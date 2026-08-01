// Inventory item list for one area (?area=hair|skin|body|nail|jewelry) —
// pure ownership records (sticker/name/brand/category/size/status/notes).
// Purchase details, photos, and current routine membership live on
// inventory-item.html; this page is just "what do I own in this
// category," shown as a sticker-forward gallery like every other item
// list in the app now.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { AREAS, escapeHtml } from "./maintenanceShared.js";
import * as stickers from "./stickerShared.js";

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
const stickerPreview = document.getElementById("item-sticker-preview");
const nameInput = document.getElementById("i-name");
const brandInput = document.getElementById("i-brand");
const categoryInput = document.getElementById("i-category");
const sizeInput = document.getElementById("i-size");
const statusPickerEl = document.getElementById("i-status");
const notesInput = document.getElementById("i-notes");

let userId = null;
let items = [];
let pendingStickerId = null;
let stickerById = new Map();

function statusClass(s) {
  return (s || "").replace(/\s/g, "");
}

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
    .map((i) => {
      const s = i.sticker_id ? stickerById.get(i.sticker_id) : null;
      return `
    <a class="item-gallery-card" href="inventory-item.html?id=${encodeURIComponent(i.id)}&area=${encodeURIComponent(area)}">
      <div class="sticker-badge hero">${s?.image_path ? `<img src="${escapeHtml(s.image_path)}" alt="">` : "🏷️"}</div>
      <span class="name">${escapeHtml(i.name)}</span>
      <span class="brand">${escapeHtml(i.brand || "")}</span>
      ${i.status ? `<span class="status-tag status-${statusClass(i.status)}">${escapeHtml(i.status)}</span>` : ""}
    </a>
  `;
    })
    .join("");
}

function openModal() {
  form.reset();
  pendingStickerId = null;
  stickerPreview.innerHTML = "🏷️";
  statusPicker.set("New");
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

const statusPicker = stickers.initChipGroup(statusPickerEl, stickers.STATUS_OPTIONS, { multi: false });
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
  const fields = {
    name,
    brand: brandInput.value.trim() || null,
    category: categoryInput.value.trim() || null,
    size: sizeInput.value.trim() || null,
    status: statusPicker.get() || "New",
    notes: notesInput.value.trim() || null,
    sticker_id: pendingStickerId,
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
  stickers.setUserId(userId);
  items = await fetchItems();
  const stickerIds = [...new Set(items.map((i) => i.sticker_id).filter(Boolean))];
  for (const id of stickerIds) {
    const s = await stickers.fetchStickerById(id);
    if (s) stickerById.set(id, s);
  }
  render();
})();
