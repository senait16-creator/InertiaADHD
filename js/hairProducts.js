// Hair Lab's Products panel — lists Inventory items in the "hair" area
// (not a Hair-only product database anymore; see the README's
// "Inventory" section). Adding a product here creates an Inventory item
// AND its "hair" maintenance_usage row in one step (so it shows up in
// Maintenance -> Hair Care immediately, and Repurchase has somewhere to
// live) — the two are just two views of the same underlying records.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { escapeHtml } from "./hairShared.js";
import * as stickers from "./stickerShared.js";

document.getElementById("inventory-link").innerHTML = `${iconMarkup("link")} View in Inventory`;

const listEl = document.getElementById("product-list");
const emptyNote = document.getElementById("empty-note");
const addBtn = document.getElementById("add-product-btn");
const modal = document.getElementById("add-product-modal");
const form = document.getElementById("add-product-form");
const cancelBtn = document.getElementById("add-product-cancel");
const stickerPreview = document.getElementById("item-sticker-preview");
const nameInput = document.getElementById("p-name");
const brandInput = document.getElementById("p-brand");
const categoryInput = document.getElementById("p-category");
const notesInput = document.getElementById("p-notes");
const repurchaseGroup = document.getElementById("p-repurchase");

let userId = null;
let items = [];
let usageByItemId = new Map();
let stickerById = new Map();
let pendingStickerId = null;

async function fetchItems() {
  if (!isConfigured) return demoStore.listInventoryItems("hair");
  const { data, error } = await supabase.from("inventory_items").select("*").eq("user_id", userId).eq("area", "hair");
  if (error) {
    console.error("Failed to load hair products:", error);
    return [];
  }
  return data.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function fetchUsages() {
  if (!isConfigured) return demoStore.listMaintenanceUsage("hair");
  const { data, error } = await supabase.from("maintenance_usage").select("*").eq("user_id", userId).eq("area", "hair");
  return error ? [] : data;
}

async function persistAddItem(fields) {
  if (!isConfigured) return demoStore.addInventoryItem({ area: "hair", ...fields });
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({ user_id: userId, area: "hair", ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to add hair product:", error);
    return null;
  }
  return data;
}

async function persistAddUsage(itemId, repurchase) {
  const fields = { area: "hair", inventory_item_id: itemId, repurchase };
  if (!isConfigured) return demoStore.addMaintenanceUsage(fields);
  const { data, error } = await supabase
    .from("maintenance_usage")
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  return error ? null : data;
}

function render() {
  emptyNote.hidden = items.length > 0;
  listEl.innerHTML = items
    .map((p) => {
      const usage = usageByItemId.get(p.id);
      const repurchase = usage?.repurchase;
      const repeatClass = repurchase === "Yes" ? "repeat-yes" : repurchase === "Maybe" ? "repeat-maybe" : "repeat-no";
      const s = p.sticker_id ? stickerById.get(p.sticker_id) : null;
      return `
      <a class="item-gallery-card" href="hair-product.html?id=${encodeURIComponent(p.id)}">
        <div class="sticker-badge hero">${s?.image_path ? `<img src="${escapeHtml(s.image_path)}" alt="">` : "🏷️"}</div>
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="brand">${escapeHtml(p.brand || "")}</span>
        ${repurchase ? `<span class="tag ${repeatClass}">Repurchase: ${escapeHtml(repurchase)}</span>` : ""}
      </a>
    `;
    })
    .join("");
}

function openModal() {
  form.reset();
  pendingStickerId = null;
  stickerPreview.innerHTML = "🏷️";
  repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === "Maybe")));
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
repurchaseGroup.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", "true");
});

stickers.wireStickerField({
  previewEl: stickerPreview,
  chooseBtn: document.getElementById("choose-sticker-btn"),
  createBtn: document.getElementById("create-sticker-btn"),
  onChange: (s) => {
    pendingStickerId = s.id;
    stickerById.set(s.id, s);
    if (!nameInput.value.trim()) nameInput.value = s.name;
  },
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  const item = await persistAddItem({
    name,
    brand: brandInput.value.trim() || null,
    category: categoryInput.value.trim() || null,
    notes: notesInput.value.trim() || null,
    sticker_id: pendingStickerId,
  });
  if (item) {
    const repurchase = repurchaseGroup.querySelector('button[aria-pressed="true"]')?.dataset.value || "Maybe";
    const usage = await persistAddUsage(item.id, repurchase);
    items.push(item);
    if (usage) usageByItemId.set(item.id, usage);
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
  stickers.setUserId(userId);
  const [fetchedItems, usages] = await Promise.all([fetchItems(), fetchUsages()]);
  items = fetchedItems;
  usageByItemId = new Map(usages.map((u) => [u.inventory_item_id, u]));
  const stickerIds = [...new Set(items.map((i) => i.sticker_id).filter(Boolean))];
  for (const id of stickerIds) {
    const s = await stickers.fetchStickerById(id);
    if (s) stickerById.set(id, s);
  }
  render();
})();
