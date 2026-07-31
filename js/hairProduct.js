// Product detail — a personal knowledge base, not a bookmark. Stats and
// the "works best when..." line are computed from your own experiment
// history (see productInsight below), the same "only speak up once
// there's enough data" restraint as the real app's Insights page.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { escapeHtml, RESULT_FIELDS } from "./hairShared.js";

const params = new URLSearchParams(window.location.search);
const productId = params.get("id");

const nameEl = document.getElementById("product-name");
const metaEl = document.getElementById("product-meta");
const insightSlot = document.getElementById("insight-slot");
const statTilesEl = document.getElementById("stat-tiles");
const relatedLessonsEl = document.getElementById("related-lessons");
const form = document.getElementById("product-form");
const notesInput = document.getElementById("p-notes");
const favoriteInput = document.getElementById("p-favorite");
const repurchaseGroup = document.getElementById("p-repurchase");
const deleteBtn = document.getElementById("delete-product");

let userId = null;
let product = null;

async function fetchProduct() {
  if (!isConfigured) return demoStore.getHairProduct(productId);
  const { data, error } = await supabase.from("hair_products").select("*").eq("id", productId).single();
  if (error) {
    console.error("Failed to load product:", error);
    return null;
  }
  return data;
}

async function fetchExperimentsUsing(productId) {
  if (!isConfigured) return demoStore.listHairExperiments().filter((e) => (e.product_ids || []).includes(productId));
  const { data, error } = await supabase
    .from("hair_experiments")
    .select("*")
    .eq("user_id", userId)
    .contains("product_ids", [productId]);
  if (error) {
    console.error("Failed to load experiments for product:", error);
    return [];
  }
  return data;
}

async function fetchAllProducts() {
  if (!isConfigured) return demoStore.listHairProducts();
  const { data, error } = await supabase.from("hair_products").select("*").eq("user_id", userId);
  return error ? [] : data;
}

async function fetchLessons() {
  if (!isConfigured) return demoStore.listHairLessons();
  const { data, error } = await supabase.from("hair_lessons").select("*").eq("user_id", userId);
  return error ? [] : data;
}

async function persistUpdate(fields) {
  if (!isConfigured) return demoStore.updateHairProduct(productId, fields);
  try {
    await supabase.from("hair_products").update(fields).eq("id", productId);
  } catch (error) {
    console.error("Failed to save product:", error);
  }
}

async function persistDelete() {
  if (!isConfigured) {
    demoStore.deleteHairProduct(productId);
    return;
  }
  try {
    await supabase.from("hair_products").delete().eq("id", productId);
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

  product = await fetchProduct();
  if (!product) {
    window.location.href = "hair-products.html";
    return;
  }

  nameEl.textContent = `${product.favorite ? "★ " : ""}${product.name}`;
  metaEl.textContent = [product.category, product.brand].filter(Boolean).join(" · ");
  notesInput.value = product.notes || "";
  favoriteInput.checked = !!product.favorite;
  repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === (product.repurchase || "Maybe"))));

  const [usedIn, allProducts, lessons] = await Promise.all([
    fetchExperimentsUsing(productId),
    fetchAllProducts(),
    fetchLessons(),
  ]);
  const productNameById = new Map(allProducts.map((p) => [p.id, p.name]));

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
      if (pid === productId) continue;
      pairingCounts.set(pid, (pairingCounts.get(pid) || 0) + 1);
    }
  }
  const avg = count ? sum / count : null;
  const topPairing = [...pairingCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const pairingName = topPairing ? productNameById.get(topPairing[0]) : null;

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
      <div class="overall-stat-value" style="font-size:0.95rem;">${escapeHtml(product.repurchase || "—")}</div>
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

  const related = lessons.filter((l) => l.text.toLowerCase().includes(product.name.toLowerCase()));
  relatedLessonsEl.innerHTML = related.length
    ? related.map((l) => `<div class="lesson-card" style="padding:0.75rem 0.9rem; font-size:0.88rem;">${escapeHtml(l.text)}</div>`).join("")
    : `<p class="field-note">None yet — nothing in What I've Learned mentions ${escapeHtml(product.name)} yet.</p>`;

  repurchaseGroup.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await persistUpdate({
      notes: notesInput.value.trim() || null,
      favorite: favoriteInput.checked,
      repurchase: repurchaseGroup.querySelector('button[aria-pressed="true"]')?.dataset.value || "Maybe",
    });
    window.location.href = "hair-products.html";
  });

  deleteBtn.addEventListener("click", async () => {
    await persistDelete();
    window.location.href = "hair-products.html";
  });
})();
