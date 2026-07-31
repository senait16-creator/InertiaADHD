// Generic Maintenance product/usage list, shared by every area (Hair
// Care, Skin Care, Body Care, Nail Care, Jewelry — ?area=). This is NOT
// a product database anymore — that's Inventory's job. This page shows
// maintenance_usage rows (how an owned item performs in THIS area's
// routine) joined against inventory_items for display. "Add" means
// picking an existing Inventory item to assign here, never creating a
// new product record — see the README's "Inventory" section.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { AREAS, escapeHtml, estimatedDurationDays, estimatedMonthlyCost, formatMoney } from "./maintenanceShared.js";

const params = new URLSearchParams(window.location.search);
const area = params.get("area");
const areaMeta = AREAS[area];

if (!areaMeta) {
  window.location.href = "maintenance.html";
  throw new Error("Unknown maintenance area");
}

document.getElementById("page-title").textContent = areaMeta.label;
const routineLink = document.getElementById("routine-link");
routineLink.href = `maintenance-routine.html?area=${encodeURIComponent(area)}`;
routineLink.innerHTML = `${iconMarkup("link")} ${escapeHtml(areaMeta.label)} routine`;
const addNewItemLink = document.getElementById("add-new-item-link");
addNewItemLink.href = `inventory-items.html?area=${encodeURIComponent(area)}`;
addNewItemLink.innerHTML = `${iconMarkup("link")} Don't see it? Add a new Inventory item`;

const listEl = document.getElementById("usage-list");
const emptyNote = document.getElementById("empty-note");
const costSummary = document.getElementById("cost-summary");
const addBtn = document.getElementById("add-usage-btn");
const modal = document.getElementById("add-usage-modal");
const cancelBtn = document.getElementById("add-usage-cancel");
const pickListEl = document.getElementById("pick-item-list");
const pickEmptyNote = document.getElementById("pick-item-empty");

let userId = null;
let usages = [];
let items = []; // every inventory item in this area, for name/brand lookups + the picker
let purchasesByItem = new Map();

async function fetchUsages() {
  if (!isConfigured) return demoStore.listMaintenanceUsage(area);
  const { data, error } = await supabase.from("maintenance_usage").select("*").eq("user_id", userId).eq("area", area);
  if (error) {
    console.error("Failed to load usage records:", error);
    return [];
  }
  return data.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// Unfiltered on purpose — an item filed under a different Inventory
// category (e.g. Coconut Oil under Body Care) can still be picked for
// use in THIS area's routine (e.g. Hair Care). See the README's
// "Inventory" section for the coconut-oil example this is built for.
async function fetchAllItems() {
  if (!isConfigured) return demoStore.listAllInventoryItems();
  const { data, error } = await supabase.from("inventory_items").select("*").eq("user_id", userId);
  return error ? [] : data;
}

async function fetchPurchasesForItems(itemIds) {
  if (!itemIds.length) return [];
  if (!isConfigured) return itemIds.flatMap((id) => demoStore.listInventoryPurchases(id));
  const { data, error } = await supabase.from("inventory_purchases").select("*").in("inventory_item_id", itemIds);
  return error ? [] : data;
}

async function persistAddUsage(itemId) {
  const fields = { area, inventory_item_id: itemId };
  if (!isConfigured) return demoStore.addMaintenanceUsage(fields);
  const { data, error } = await supabase
    .from("maintenance_usage")
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to add usage record:", error);
    return null;
  }
  return data;
}

// Best computable monthly cost among an item's purchases — the most
// recently created purchase that has both a price and a measured
// duration, since that's the most relevant one to today's cost.
function bestMonthlyCostForItem(itemId) {
  const purchases = purchasesByItem.get(itemId) || [];
  for (const p of [...purchases].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const days = estimatedDurationDays(p.date_started, p.date_finished);
    const monthly = estimatedMonthlyCost(p.purchase_price, days);
    if (monthly != null) return monthly;
  }
  return null;
}

function render() {
  emptyNote.hidden = usages.length > 0;
  const itemById = new Map(items.map((i) => [i.id, i]));

  let costTotal = 0;
  let costCount = 0;
  for (const u of usages) {
    const monthly = bestMonthlyCostForItem(u.inventory_item_id);
    if (monthly != null) {
      costTotal += monthly;
      costCount++;
    }
  }
  costSummary.hidden = costCount === 0;
  if (costCount > 0) {
    costSummary.innerHTML = `${iconMarkup("sparkles")} <span>Estimated ${formatMoney(costTotal)}/month based on ${costCount} item${costCount === 1 ? "" : "s"} with a known lifespan.</span>`;
  }

  listEl.innerHTML = usages
    .map((u) => {
      const item = itemById.get(u.inventory_item_id);
      const repeatClass = u.repurchase === "Yes" ? "repeat-yes" : u.repurchase === "Maybe" ? "repeat-maybe" : "repeat-no";
      const monthly = bestMonthlyCostForItem(u.inventory_item_id);
      return `
      <a class="card-row clickable" href="maintenance-product.html?id=${encodeURIComponent(u.id)}&area=${encodeURIComponent(area)}" style="display:block; text-decoration:none; color:inherit;">
        <div class="card-title">${escapeHtml(item ? item.name : "(deleted item)")}</div>
        <div class="card-sub">${escapeHtml(item?.category || "")}${item?.brand ? " · " + escapeHtml(item.brand) : ""}</div>
        <div class="card-meta-row">
          ${u.repurchase ? `<span class="tag ${repeatClass}">Repurchase: ${escapeHtml(u.repurchase)}</span>` : ""}
          ${monthly != null ? `<span class="tag">${formatMoney(monthly)}/mo</span>` : ""}
          ${u.rating != null ? `<span class="tag">${u.rating}/10</span>` : ""}
        </div>
      </a>
    `;
    })
    .join("");
}

function openModal() {
  const usedItemIds = new Set(usages.map((u) => u.inventory_item_id));
  const available = items.filter((i) => !usedItemIds.has(i.id));
  pickEmptyNote.hidden = available.length > 0;
  pickListEl.innerHTML = available
    .map((i) => {
      const homeArea = AREAS[i.area];
      const fromOtherArea = i.area !== area && homeArea;
      return `
    <button type="button" class="card-row clickable" data-item-id="${i.id}" style="width:100%; text-align:left; background:none; border:none; font:inherit; color:inherit; cursor:pointer;">
      <div class="card-title">${escapeHtml(i.name)}</div>
      <div class="card-sub">${escapeHtml(i.category || "")}${i.brand ? " · " + escapeHtml(i.brand) : ""}${fromOtherArea ? ` · from ${escapeHtml(homeArea.inventoryLabel)}` : ""}</div>
    </button>
  `;
    })
    .join("");
  modal.classList.add("open");
}
function closeModal() {
  modal.classList.remove("open");
}
addBtn.addEventListener("click", openModal);
cancelBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
pickListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-item-id]");
  if (!btn) return;
  const created = await persistAddUsage(btn.dataset.itemId);
  if (created) {
    usages.push(created);
    render();
    closeModal();
  }
});

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }
  [usages, items] = await Promise.all([fetchUsages(), fetchAllItems()]);
  const purchases = await fetchPurchasesForItems(items.map((i) => i.id));
  purchasesByItem = new Map();
  for (const p of purchases) {
    if (!purchasesByItem.has(p.inventory_item_id)) purchasesByItem.set(p.inventory_item_id, []);
    purchasesByItem.get(p.inventory_item_id).push(p);
  }
  render();
})();
