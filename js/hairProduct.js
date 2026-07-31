// Hair Lab's product detail — composes an Inventory item (identity,
// read-only here — edit that on its Inventory page), its purchases
// (for the computed Estimated Duration/Monthly Cost), and its "hair"
// maintenance_usage row (routine step, rating, performance notes,
// repurchase — the fields this page actually edits). Stats and the
// "works best when..." line are computed from your own experiment
// history (see productInsight below), the same "only speak up once
// there's enough data" restraint as the real app's Insights page.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { escapeHtml, RESULT_FIELDS } from "./hairShared.js";
import { initChipGroup, estimatedDurationDays, formatDuration, estimatedMonthlyCost, formatMoney } from "./maintenanceShared.js";

const params = new URLSearchParams(window.location.search);
const itemId = params.get("id");

const nameEl = document.getElementById("product-name");
const metaEl = document.getElementById("product-meta");
const itemLink = document.getElementById("item-link");
const insightSlot = document.getElementById("insight-slot");
const statTilesEl = document.getElementById("stat-tiles");
const costStatsEl = document.getElementById("cost-stats");
const relatedLessonsEl = document.getElementById("related-lessons");
const form = document.getElementById("product-form");
const routineStepGroupEl = document.getElementById("p-routine-step");
const routineStepEmptyNote = document.getElementById("p-routine-step-empty");
const ratingInput = document.getElementById("p-rating");
const notesInput = document.getElementById("p-notes");
const repurchaseGroup = document.getElementById("p-repurchase");
const deleteBtn = document.getElementById("delete-product");

let userId = null;
let item = null;
let usage = null; // the "hair" maintenance_usage row for this item, created lazily on save if missing
let routineStepPicker = null;

async function fetchItem() {
  if (!isConfigured) return demoStore.getInventoryItem(itemId);
  const { data, error } = await supabase.from("inventory_items").select("*").eq("id", itemId).single();
  if (error) {
    console.error("Failed to load product:", error);
    return null;
  }
  return data;
}

async function fetchUsage() {
  if (!isConfigured) return demoStore.getMaintenanceUsageForItem(itemId, "hair");
  const { data, error } = await supabase
    .from("maintenance_usage")
    .select("*")
    .eq("inventory_item_id", itemId)
    .eq("area", "hair")
    .maybeSingle();
  return error ? null : data;
}

async function fetchPurchases() {
  if (!isConfigured) return demoStore.listInventoryPurchases(itemId);
  const { data, error } = await supabase.from("inventory_purchases").select("*").eq("inventory_item_id", itemId);
  return error ? [] : data;
}

async function fetchExperimentsUsing(itemId) {
  if (!isConfigured) return demoStore.listHairExperiments().filter((e) => (e.product_ids || []).includes(itemId));
  const { data, error } = await supabase
    .from("hair_experiments")
    .select("*")
    .eq("user_id", userId)
    .contains("product_ids", [itemId]);
  if (error) {
    console.error("Failed to load experiments for product:", error);
    return [];
  }
  return data;
}

async function fetchAllItems() {
  if (!isConfigured) return demoStore.listInventoryItems("hair");
  const { data, error } = await supabase.from("inventory_items").select("id, name").eq("user_id", userId).eq("area", "hair");
  return error ? [] : data;
}

async function fetchLessons() {
  if (!isConfigured) return demoStore.listHairLessons();
  const { data, error } = await supabase.from("hair_lessons").select("*").eq("user_id", userId);
  return error ? [] : data;
}

async function fetchRoutineSteps() {
  if (!isConfigured) return demoStore.listMaintenanceRoutineSteps("hair");
  const { data, error } = await supabase
    .from("maintenance_routine_steps")
    .select("*")
    .eq("user_id", userId)
    .eq("area", "hair")
    .order("sort_order", { ascending: true });
  return error ? [] : data;
}

async function persistUsageUpsert(fields) {
  if (!isConfigured) {
    if (usage) return demoStore.updateMaintenanceUsage(usage.id, fields);
    return demoStore.addMaintenanceUsage({ area: "hair", inventory_item_id: itemId, ...fields });
  }
  if (usage) {
    await supabase.from("maintenance_usage").update(fields).eq("id", usage.id);
    return;
  }
  await supabase.from("maintenance_usage").insert({ user_id: userId, area: "hair", inventory_item_id: itemId, ...fields });
}

async function persistItemDelete() {
  if (!isConfigured) {
    demoStore.deleteInventoryItem(itemId);
    return;
  }
  try {
    await supabase.from("inventory_items").delete().eq("id", itemId);
  } catch (error) {
    console.error("Failed to delete product:", error);
  }
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function starsReadOnly(value) {
  const rounded = Math.round(value);
  let out = '<div class="stars small">';
  for (let i = 1; i <= 5; i++) {
    out += `<span class="star-btn ${i <= rounded ? "filled" : ""}" style="cursor:default;">${iconMarkup("star")}</span>`;
  }
  return out + "</div>";
}

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }

  item = await fetchItem();
  if (!item) {
    window.location.href = "hair-products.html";
    return;
  }

  nameEl.textContent = item.name;
  metaEl.textContent = [item.category, item.brand].filter(Boolean).join(" · ");
  itemLink.href = `inventory-item.html?id=${encodeURIComponent(itemId)}&area=hair`;
  itemLink.innerHTML = `${iconMarkup("link")} View identity & purchases in Inventory`;

  const [usedIn, allItems, lessons, routineSteps, purchases, fetchedUsage] = await Promise.all([
    fetchExperimentsUsing(itemId),
    fetchAllItems(),
    fetchLessons(),
    fetchRoutineSteps(),
    fetchPurchases(),
    fetchUsage(),
  ]);
  usage = fetchedUsage;
  const itemNameById = new Map(allItems.map((p) => [p.id, p.name]));

  routineStepEmptyNote.hidden = routineSteps.length > 0;
  const stepNameById = new Map(routineSteps.map((s) => [s.id, s.name]));
  const stepIdByName = new Map(routineSteps.map((s) => [s.name, s.id]));
  routineStepPicker = initChipGroup(routineStepGroupEl, routineSteps.map((s) => s.name), { multi: false });
  if (usage?.routine_step_id) routineStepPicker.set(stepNameById.get(usage.routine_step_id) || null);

  ratingInput.value = usage?.rating ?? "";
  notesInput.value = usage?.notes || "";
  repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === (usage?.repurchase || "Maybe"))));

  // Best computable monthly cost among this item's purchases — the most
  // recent one with both a price and a measured duration.
  let bestDays = null;
  let bestMonthly = null;
  for (const p of [...purchases].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const days = estimatedDurationDays(p.date_started, p.date_finished);
    const monthly = estimatedMonthlyCost(p.purchase_price, days);
    if (monthly != null) {
      bestDays = days;
      bestMonthly = monthly;
      break;
    }
  }
  costStatsEl.innerHTML = `
    <div class="stat-tile">
      <div class="overall-stat-label">Estimated Duration</div>
      <div class="overall-stat-value" style="font-size:0.95rem;">${bestDays != null ? escapeHtml(formatDuration(bestDays)) : "—"}</div>
    </div>
    <div class="stat-tile">
      <div class="overall-stat-label">Estimated Monthly Cost</div>
      <div class="overall-stat-value" style="font-size:0.95rem;">${bestMonthly != null ? formatMoney(bestMonthly) : "—"}</div>
    </div>
  `;

  // Stats: how many experiments, their average result (across all six
  // dimensions that were actually rated), and the product most often
  // used alongside this one.
  let sum = 0;
  let count = 0;
  const pairingCounts = new Map();
  for (const exp of usedIn) {
    for (const [key] of RESULT_FIELDS) {
      if (exp[key] != null) {
        sum += exp[key];
        count++;
      }
    }
    for (const pid of exp.product_ids || []) {
      if (pid === itemId) continue;
      pairingCounts.set(pid, (pairingCounts.get(pid) || 0) + 1);
    }
  }
  const avg = count ? sum / count : null;
  const topPairing = [...pairingCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const pairingName = topPairing ? itemNameById.get(topPairing[0]) : null;

  statTilesEl.innerHTML = `
    <div class="stat-tile">
      <div class="overall-stat-label">Experiments used</div>
      <div class="overall-stat-value">${usedIn.length}</div>
    </div>
    <div class="stat-tile">
      <div class="overall-stat-label">Average results</div>
      <div class="overall-stat-value">${avg != null ? starsReadOnly(avg) : "—"}</div>
    </div>
    <div class="stat-tile">
      <div class="overall-stat-label">Most common pairing</div>
      <div class="overall-stat-value" style="font-size:0.95rem;">${pairingName ? escapeHtml(pairingName) : "—"}</div>
    </div>
    <div class="stat-tile">
      <div class="overall-stat-label">Repurchase?</div>
      <div class="overall-stat-value" style="font-size:0.95rem;">${escapeHtml(usage?.repurchase || "—")}</div>
    </div>
  `;

  // The "why," not just the "what": only speaks up once two or more
  // experiments using this product, that also went well (definition
  // 4+), agree on a moisture level.
  const goodOnes = usedIn.filter((e) => (e.result_definition || 0) >= 4);
  const moistureCounts = new Map();
  goodOnes.forEach((e) => {
    if (e.hair_moisture) moistureCounts.set(e.hair_moisture, (moistureCounts.get(e.hair_moisture) || 0) + 1);
  });
  const topMoisture = [...moistureCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topMoisture && topMoisture[1] >= 2) {
    insightSlot.innerHTML = `<div class="insight-line">${iconMarkup("sparkles")} <span>Works best when hair is ${escapeHtml(topMoisture[0].toLowerCase())}.</span></div>`;
  }

  const related = lessons.filter((l) => l.text.toLowerCase().includes(item.name.toLowerCase()));
  relatedLessonsEl.innerHTML = related.length
    ? related.map((l) => `<div class="lesson-card" style="padding:0.75rem 0.9rem; font-size:0.88rem;">${escapeHtml(l.text)}</div>`).join("")
    : `<p class="field-note">None yet — nothing in What I've Learned mentions ${escapeHtml(item.name)} yet.</p>`;

  repurchaseGroup.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedStepName = routineStepPicker.get();
    await persistUsageUpsert({
      routine_step_id: selectedStepName ? stepIdByName.get(selectedStepName) || null : null,
      rating: ratingInput.value ? Number(ratingInput.value) : null,
      notes: notesInput.value.trim() || null,
      repurchase: repurchaseGroup.querySelector('button[aria-pressed="true"]')?.dataset.value || "Maybe",
    });
    window.location.href = "hair-products.html";
  });

  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Delete "${item.name}" from Inventory? This also removes it from every other area it's used in.`)) return;
    await persistItemDelete();
    window.location.href = "hair-products.html";
  });
})();
