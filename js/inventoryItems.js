// Inventory item list for one area (?area=hair|skin|body|nail|jewelry) —
// pure ownership records (name/brand/category/quantity/condition/notes).
// Purchase details and how an item is used in a routine live elsewhere
// (see inventory-item.html for purchases, maintenance-product.html for
// usage) — this page is just "what do I own in this category."
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { AREAS, escapeHtml } from "./maintenanceShared.js";

const params = new URLSearchParams(window.location.search);
const area = params.get("area");
const areaMeta = AREAS[area];

if (!areaMeta) {
  window.location.href = "inventory.html";
  throw new Error("Unknown inventory area");
}

document.getElementById("page-title").textContent = areaMeta.inventoryLabel;

const listEl = document.getElementById("item-list");
const emptyNote = document.getElementById("empty-note");
const addBtn = document.getElementById("add-item-btn");
const modal = document.getElementById("add-item-modal");
const form = document.getElementById("add-item-form");
const cancelBtn = document.getElementById("add-item-cancel");
const nameInput = document.getElementById("i-name");
const brandInput = document.getElementById("i-brand");
const categoryInput = document.getElementById("i-category");
const quantityInput = document.getElementById("i-quantity");
const conditionInput = document.getElementById("i-condition");
const notesInput = document.getElementById("i-notes");

let userId = null;
let items = [];

async function fetchItems() {
  if (!isConfigured) return demoStore.listInventoryItems(area);
  const { data, error } = await supabase.from("inventory_items").select("*").eq("user_id", userId).eq("area", area);
  if (error) {
    console.error("Failed to load inventory items:", error);
    return [];
  }
  return data.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function persistAdd(fields) {
  if (!isConfigured) return demoStore.addInventoryItem({ area, ...fields });
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({ user_id: userId, area, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to add inventory item:", error);
    return null;
  }
  return data;
}

function render() {
  emptyNote.hidden = items.length > 0;
  listEl.innerHTML = items
    .map(
      (i) => `
    <a class="card-row clickable" href="inventory-item.html?id=${encodeURIComponent(i.id)}&area=${encodeURIComponent(area)}" style="display:block; text-decoration:none; color:inherit;">
      <div class="card-title">${escapeHtml(i.name)}</div>
      <div class="card-sub">${escapeHtml(i.category || "")}${i.brand ? " · " + escapeHtml(i.brand) : ""}</div>
      ${i.condition ? `<div class="card-meta-row"><span class="tag">${escapeHtml(i.condition)}</span></div>` : ""}
    </a>
  `
    )
    .join("");
}

function openModal() {
  form.reset();
  modal.classList.add("open");
  nameInput.focus();
}
function closeModal() {
  modal.classList.remove("open");
}
addBtn.addEventListener("click", openModal);
cancelBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  const fields = {
    name,
    brand: brandInput.value.trim() || null,
    category: categoryInput.value.trim() || null,
    quantity_or_size: quantityInput.value.trim() || null,
    condition: conditionInput.value.trim() || null,
    notes: notesInput.value.trim() || null,
  };
  const created = await persistAdd(fields);
  if (created) {
    items.push(created);
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
  items = await fetchItems();
  render();
})();
