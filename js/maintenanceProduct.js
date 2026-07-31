// Generic product detail/edit — full purchase & usage record, shared by
// Skin Care, Body Care, Nail Care, and Jewelry. Estimated Duration and
// Estimated Monthly Cost are computed live from the dates/price below
// (see js/maintenanceShared.js) rather than stored, so they can never
// drift out of sync with the fields they're derived from.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { AREAS, escapeHtml, initChipGroup, estimatedDurationDays, formatDuration, estimatedMonthlyCost, formatMoney } from "./maintenanceShared.js";

const params = new URLSearchParams(window.location.search);
const productId = params.get("id");
const area = params.get("area");
const areaMeta = AREAS[area];

if (!areaMeta) {
  window.location.href = "maintenance.html";
  throw new Error("Unknown maintenance area");
}

document.getElementById("back-link").href = `maintenance-products.html?area=${encodeURIComponent(area)}`;

const nameEl = document.getElementById("product-name");
const metaEl = document.getElementById("product-meta");
const computedStatsEl = document.getElementById("computed-stats");
const form = document.getElementById("product-form");
const purchaseDateInput = document.getElementById("p-purchase-date");
const purchasePriceInput = document.getElementById("p-purchase-price");
const purchaseLocationInput = document.getElementById("p-purchase-location");
const dateStartedInput = document.getElementById("p-date-started");
const dateFinishedInput = document.getElementById("p-date-finished");
const routineStepGroupEl = document.getElementById("p-routine-step");
const routineStepEmptyNote = document.getElementById("p-routine-step-empty");
const ratingInput = document.getElementById("p-rating");
const notesInput = document.getElementById("p-notes");
const repurchaseGroup = document.getElementById("p-repurchase");
const deleteBtn = document.getElementById("delete-product");

let userId = null;
let product = null;
let routineStepPicker = null;

async function fetchProduct() {
  if (!isConfigured) return demoStore.getMaintenanceProduct(productId);
  const { data, error } = await supabase.from("maintenance_products").select("*").eq("id", productId).single();
  if (error) {
    console.error("Failed to load product:", error);
    return null;
  }
  return data;
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
  if (!isConfigured) return demoStore.updateMaintenanceProduct(productId, fields);
  try {
    await supabase.from("maintenance_products").update(fields).eq("id", productId);
  } catch (error) {
    console.error("Failed to save product:", error);
  }
}

async function persistDelete() {
  if (!isConfigured) {
    demoStore.deleteMaintenanceProduct(productId);
    return;
  }
  try {
    await supabase.from("maintenance_products").delete().eq("id", productId);
  } catch (error) {
    console.error("Failed to delete product:", error);
  }
}

function updateComputedStats() {
  const days = estimatedDurationDays(dateStartedInput.value || null, dateFinishedInput.value || null);
  const price = purchasePriceInput.value ? Number(purchasePriceInput.value) : null;
  const monthly = estimatedMonthlyCost(price, days);
  computedStatsEl.innerHTML = `
    <div class="stat-tile">
      <div class="overall-stat-label">Estimated Duration</div>
      <div class="overall-stat-value" style="font-size:0.95rem;">${days != null ? escapeHtml(formatDuration(days)) : "—"}</div>
    </div>
    <div class="stat-tile">
      <div class="overall-stat-label">Estimated Monthly Cost</div>
      <div class="overall-stat-value" style="font-size:0.95rem;">${monthly != null ? formatMoney(monthly) : "—"}</div>
    </div>
  `;
}

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }

  const [fetchedProduct, routineSteps] = await Promise.all([fetchProduct(), fetchRoutineSteps()]);
  product = fetchedProduct;
  if (!product) {
    window.location.href = `maintenance-products.html?area=${encodeURIComponent(area)}`;
    return;
  }

  nameEl.textContent = product.name;
  metaEl.textContent = [product.category, product.brand].filter(Boolean).join(" · ");

  purchaseDateInput.value = product.purchase_date || "";
  purchasePriceInput.value = product.purchase_price ?? "";
  purchaseLocationInput.value = product.purchase_location || "";
  dateStartedInput.value = product.date_started || "";
  dateFinishedInput.value = product.date_finished || "";
  ratingInput.value = product.rating ?? "";
  notesInput.value = product.notes || "";
  repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === (product.repurchase || "Maybe"))));

  routineStepEmptyNote.hidden = routineSteps.length > 0;
  const stepNameById = new Map(routineSteps.map((s) => [s.id, s.name]));
  routineStepPicker = initChipGroup(routineStepGroupEl, routineSteps.map((s) => s.name), { multi: false });
  if (product.routine_step_id) routineStepPicker.set(stepNameById.get(product.routine_step_id) || null);
  const stepIdByName = new Map(routineSteps.map((s) => [s.name, s.id]));

  updateComputedStats();
  [purchaseDateInput, purchasePriceInput, dateStartedInput, dateFinishedInput].forEach((input) =>
    input.addEventListener("input", updateComputedStats)
  );

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
      purchase_date: purchaseDateInput.value || null,
      purchase_price: purchasePriceInput.value ? Number(purchasePriceInput.value) : null,
      purchase_location: purchaseLocationInput.value.trim() || null,
      date_started: dateStartedInput.value || null,
      date_finished: dateFinishedInput.value || null,
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
