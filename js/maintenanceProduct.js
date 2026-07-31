// One maintenance_usage row: how an Inventory item performs in THIS
// area's routine — routine step, rating, performance notes, repurchase
// decision for this use. The item's identity/purchase history lives on
// its Inventory page (linked below, read-only from here); "Remove from
// this routine" deletes only this usage row, never the underlying item.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { AREAS, escapeHtml, initChipGroup } from "./maintenanceShared.js";

const params = new URLSearchParams(window.location.search);
const usageId = params.get("id");
const area = params.get("area");
const areaMeta = AREAS[area];

if (!areaMeta) {
  window.location.href = "maintenance.html";
  throw new Error("Unknown maintenance area");
}

document.getElementById("back-link").href = `maintenance-products.html?area=${encodeURIComponent(area)}`;

const nameEl = document.getElementById("item-name");
const metaEl = document.getElementById("item-meta");
const itemLink = document.getElementById("item-link");
const form = document.getElementById("usage-form");
const routineStepGroupEl = document.getElementById("u-routine-step");
const routineStepEmptyNote = document.getElementById("u-routine-step-empty");
const ratingInput = document.getElementById("u-rating");
const notesInput = document.getElementById("u-notes");
const repurchaseGroup = document.getElementById("u-repurchase");
const deleteBtn = document.getElementById("delete-usage");

let userId = null;
let usage = null;
let routineStepPicker = null;

async function fetchUsage() {
  if (!isConfigured) return demoStore.getMaintenanceUsage(usageId);
  const { data, error } = await supabase.from("maintenance_usage").select("*").eq("id", usageId).single();
  if (error) {
    console.error("Failed to load usage record:", error);
    return null;
  }
  return data;
}

async function fetchItem(itemId) {
  if (!isConfigured) return demoStore.getInventoryItem(itemId);
  const { data, error } = await supabase.from("inventory_items").select("*").eq("id", itemId).single();
  return error ? null : data;
}

async function fetchRoutineSteps() {
  if (!isConfigured) return demoStore.listMaintenanceRoutineSteps(area);
  const { data, error } = await supabase
    .from("maintenance_routine_steps")
    .select("*")
    .eq("user_id", userId)
    .eq("area", area)
    .order("sort_order", { ascending: true });
  return error ? [] : data;
}

async function persistUpdate(fields) {
  if (!isConfigured) return demoStore.updateMaintenanceUsage(usageId, fields);
  try {
    await supabase.from("maintenance_usage").update(fields).eq("id", usageId);
  } catch (error) {
    console.error("Failed to save usage record:", error);
  }
}

async function persistDelete() {
  if (!isConfigured) {
    demoStore.deleteMaintenanceUsage(usageId);
    return;
  }
  try {
    await supabase.from("maintenance_usage").delete().eq("id", usageId);
  } catch (error) {
    console.error("Failed to delete usage record:", error);
  }
}

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }

  usage = await fetchUsage();
  if (!usage) {
    window.location.href = `maintenance-products.html?area=${encodeURIComponent(area)}`;
    return;
  }

  const [item, routineSteps] = await Promise.all([fetchItem(usage.inventory_item_id), fetchRoutineSteps()]);

  nameEl.textContent = item ? item.name : "(deleted item)";
  metaEl.textContent = item ? [item.category, item.brand].filter(Boolean).join(" · ") : "";
  itemLink.href = `inventory-item.html?id=${encodeURIComponent(usage.inventory_item_id)}&area=${encodeURIComponent(area)}`;
  itemLink.innerHTML = `${iconMarkup("link")} View in Inventory`;

  routineStepEmptyNote.hidden = routineSteps.length > 0;
  const stepNameById = new Map(routineSteps.map((s) => [s.id, s.name]));
  const stepIdByName = new Map(routineSteps.map((s) => [s.name, s.id]));
  routineStepPicker = initChipGroup(routineStepGroupEl, routineSteps.map((s) => s.name), { multi: false });
  if (usage.routine_step_id) routineStepPicker.set(stepNameById.get(usage.routine_step_id) || null);

  ratingInput.value = usage.rating ?? "";
  notesInput.value = usage.notes || "";
  repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === (usage.repurchase || "Maybe"))));

  repurchaseGroup.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedStepName = routineStepPicker.get();
    await persistUpdate({
      routine_step_id: selectedStepName ? stepIdByName.get(selectedStepName) || null : null,
      rating: ratingInput.value ? Number(ratingInput.value) : null,
      notes: notesInput.value.trim() || null,
      repurchase: repurchaseGroup.querySelector('button[aria-pressed="true"]')?.dataset.value || "Maybe",
    });
    window.location.href = `maintenance-products.html?area=${encodeURIComponent(area)}`;
  });

  deleteBtn.addEventListener("click", async () => {
    await persistDelete();
    window.location.href = `maintenance-products.html?area=${encodeURIComponent(area)}`;
  });
})();
