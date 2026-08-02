// Maintenance area home — the merged page: Active Routine (a calm view
// by default, Edit reveals the sectioned drag/insert builder) on top,
// the item gallery (sticker-forward, Finished hidden by default) below.
// Replaces maintenance-products.html/maintenance-product.html/
// maintenance-routine.html — see the README's "Stickers" and "Versioned
// Routines" sections for the full rationale.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { AREAS, escapeHtml, estimatedDurationDays, estimatedMonthlyCost } from "./maintenanceShared.js";
import * as stickers from "./stickerShared.js";

const params = new URLSearchParams(window.location.search);
const area = params.get("area");
const areaMeta = AREAS[area];

if (!areaMeta) {
  window.location.href = "maintenance.html";
  throw new Error("Unknown maintenance area");
}

document.getElementById("page-title").textContent = areaMeta.label;
const historyLink = document.getElementById("history-link");
historyLink.href = `maintenance-history.html?area=${encodeURIComponent(area)}`;
historyLink.innerHTML = `${iconMarkup("link")} History`;
const logLink = document.getElementById("log-link");
logLink.href = `maintenance-log.html?area=${encodeURIComponent(area)}`;
logLink.innerHTML = `${iconMarkup("link")} Log`;

const routineViewEl = document.getElementById("routine-view-mode");
const routineEditEl = document.getElementById("routine-edit-mode");
const routineSubEl = document.getElementById("routine-sub");
const editToggleBtn = document.getElementById("edit-toggle-btn");
const sectionTabsEl = document.getElementById("section-tabs");
const addSectionBtn = document.getElementById("add-section-btn");
const builderRowEl = document.getElementById("routine-builder-row");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const doneEditBtn = document.getElementById("done-edit-btn");

const galleryGrid = document.getElementById("gallery-grid");
const emptyNote = document.getElementById("empty-note");
const showFinishedBtn = document.getElementById("show-finished-toggle");
const openAddItemBtn = document.getElementById("open-add-item");

const addItemModal = document.getElementById("add-item-modal");
const itemForm = document.getElementById("item-form");
const itemStickerPreview = document.getElementById("item-sticker-preview");
const nameInput = document.getElementById("f-name");
const brandInput = document.getElementById("f-brand");
const categoryInput = document.getElementById("f-category");
const sizeInput = document.getElementById("f-size");
const priceInput = document.getElementById("f-price");
const urlInput = document.getElementById("f-url");
const notesInput = document.getElementById("f-notes");
const statusPickerEl = document.getElementById("status-picker");

const detailModal = document.getElementById("item-detail-modal");
const detailSticker = document.getElementById("detail-sticker");
const detailName = document.getElementById("detail-name");
const detailStatus = document.getElementById("detail-status");
const detailDl = document.getElementById("detail-dl");
const detailViewInventory = document.getElementById("detail-view-inventory");

const insertModal = document.getElementById("insert-step-modal");
const insertSourceGrid = document.getElementById("insert-source-grid");
const insertEmptyNote = document.getElementById("insert-empty-note");

const versionPromptModal = document.getElementById("version-prompt-modal");

let userId = null;
let routine = null;
let currentVersion = null;
let sections = {}; // { sectionName: [{ inventory_item_id, sticker_id }] }
let originalSnapshot = "";
let currentSectionTab = null;
let editMode = false;
let inventoryItems = [];
let itemById = new Map();
let stickerById = new Map();
let showFinished = false;
let insertAt = 0;
let insertSource = "inventory";

function statusClass(s) {
  return (s || "").replace(/\s/g, "");
}

function stickerImgFor(stickerId) {
  const s = stickerById.get(stickerId);
  return s?.image_path ? `<img src="${escapeHtml(s.image_path)}" alt="">` : "🏷️";
}

async function fetchRoutine() {
  if (!isConfigured) return demoStore.getOrCreateRoutine(area);
  let { data: routines } = await supabase.from("routines").select("*").eq("user_id", userId).eq("area", area);
  let r = routines && routines[0];
  if (!r) {
    const { data } = await supabase
      .from("routines")
      .insert({ user_id: userId, area, name: `${area} routine` })
      .select()
      .single();
    r = data;
  }
  const { data: versions } = await supabase
    .from("routine_versions")
    .select("*")
    .eq("user_id", userId)
    .eq("routine_id", r.id)
    .is("ended_at", null);
  if (!versions || versions.length === 0) {
    await supabase.from("routine_versions").insert({ user_id: userId, routine_id: r.id, version_number: 1, started_at: new Date().toISOString().slice(0, 10) });
  }
  return r;
}

async function fetchCurrentVersion() {
  if (!isConfigured) return demoStore.getCurrentRoutineVersion(routine.id);
  const { data, error } = await supabase
    .from("routine_versions")
    .select("*")
    .eq("user_id", userId)
    .eq("routine_id", routine.id)
    .is("ended_at", null)
    .maybeSingle();
  return error ? null : data;
}

async function fetchVersionItems(versionId) {
  if (!isConfigured) return demoStore.listVersionItems(versionId);
  const { data, error } = await supabase.from("routine_version_items").select("*").eq("routine_version_id", versionId);
  return error ? [] : data.sort((a, b) => a.position - b.position);
}

async function fetchInventoryItems() {
  if (!isConfigured) return demoStore.listInventoryItems(area);
  const { data, error } = await supabase.from("inventory_items").select("*").eq("user_id", userId).eq("area", area);
  return error ? [] : data.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function itemsToSections(versionItems) {
  const bySection = {};
  for (const vi of versionItems) {
    const sec = vi.section || "default";
    if (!bySection[sec]) bySection[sec] = [];
    bySection[sec].push({ inventory_item_id: vi.inventory_item_id, sticker_id: vi.sticker_id });
  }
  return bySection;
}

function sectionsSnapshot(secs) {
  return JSON.stringify(secs);
}

// ---------------- view mode ----------------
function renderViewMode() {
  const sectionNames = Object.keys(sections);
  if (sectionNames.length === 0) {
    routineViewEl.innerHTML = `<p class="subtitle">Nothing in your routine yet — tap Edit to add a step.</p>`;
    return;
  }
  routineViewEl.innerHTML = sectionNames
    .map((sec) => {
      const items = sections[sec];
      const row = items
        .map(
          (it, i) =>
            `${i > 0 ? '<span class="plus-sep">+</span>' : ""}<div class="sticker-badge hero pickable" data-view-sticker="${it.sticker_id || ""}" data-view-item="${it.inventory_item_id || ""}">${stickerImgFor(it.sticker_id)}</div>`
        )
        .join("");
      return `
      <div style="margin-top:1rem;">
        <div class="field-label" style="margin-bottom:0;">${escapeHtml(sec)}</div>
        <div class="routine-hero-row">${row || '<p class="field-note">Empty</p>'}</div>
      </div>`;
    })
    .join("");
}

routineViewEl.addEventListener("click", (e) => {
  const t = e.target.closest("[data-view-sticker]");
  if (!t) return;
  openDetail({ stickerId: t.dataset.viewSticker || null, itemId: t.dataset.viewItem || null, allowRemove: false });
});

// ---------------- edit mode ----------------
function renderSectionTabs() {
  const names = Object.keys(sections);
  if (!names.includes(currentSectionTab)) currentSectionTab = names[0] || null;
  sectionTabsEl.innerHTML = names
    .map((n) => `<button type="button" class="routine-section-tab ${n === currentSectionTab ? "active" : ""}" data-section="${escapeHtml(n)}">${escapeHtml(n)}</button>`)
    .join("");
}

function renderBuilderRow() {
  if (!currentSectionTab) {
    builderRowEl.innerHTML = `<p class="field-note">Add a section to get started.</p>`;
    return;
  }
  const items = sections[currentSectionTab] || [];
  let html = `<button type="button" class="insert-btn" data-insert-at="0">+</button>`;
  items.forEach((it, idx) => {
    html += `
      <div class="routine-step-chip" draggable="true" data-idx="${idx}">
        <div class="sticker-badge">${stickerImgFor(it.sticker_id)}</div>
        <span class="step-label">${escapeHtml(nameForRoutineItem(it))}</span>
      </div>
      <button type="button" class="insert-btn" data-insert-at="${idx + 1}">+</button>`;
  });
  builderRowEl.innerHTML = html;
}

function nameForRoutineItem(it) {
  if (it.inventory_item_id && itemById.has(it.inventory_item_id)) return itemById.get(it.inventory_item_id).name;
  if (it.sticker_id && stickerById.has(it.sticker_id)) return stickerById.get(it.sticker_id).name;
  return "Step";
}

sectionTabsEl.addEventListener("click", (e) => {
  const t = e.target.closest("[data-section]");
  if (!t) return;
  currentSectionTab = t.dataset.section;
  renderSectionTabs();
  renderBuilderRow();
});

addSectionBtn.addEventListener("click", () => {
  const name = prompt("Section name (e.g. Morning, Night, Weekly)");
  if (!name || !name.trim()) return;
  const clean = name.trim();
  if (!sections[clean]) sections[clean] = [];
  currentSectionTab = clean;
  renderSectionTabs();
  renderBuilderRow();
});

let dragIdx = null;
builderRowEl.addEventListener("dragstart", (e) => {
  const chip = e.target.closest(".routine-step-chip");
  if (!chip) return;
  dragIdx = Number(chip.dataset.idx);
  chip.classList.add("dragging");
});
builderRowEl.addEventListener("dragend", (e) => {
  const chip = e.target.closest(".routine-step-chip");
  if (chip) chip.classList.remove("dragging");
});
builderRowEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  const over = e.target.closest(".routine-step-chip");
  if (!over || dragIdx == null) return;
  const toIdx = Number(over.dataset.idx);
  if (toIdx === dragIdx) return;
  const items = sections[currentSectionTab];
  items.splice(toIdx, 0, items.splice(dragIdx, 1)[0]);
  dragIdx = toIdx;
  renderBuilderRow();
});

builderRowEl.addEventListener("click", (e) => {
  const insertBtn = e.target.closest(".insert-btn");
  const chip = e.target.closest(".routine-step-chip");
  if (insertBtn) {
    insertAt = Number(insertBtn.dataset.insertAt);
    openInsertModal();
  } else if (chip) {
    const it = sections[currentSectionTab][Number(chip.dataset.idx)];
    openDetail({ stickerId: it.sticker_id, itemId: it.inventory_item_id, allowRemove: true, removeIdx: Number(chip.dataset.idx) });
  }
});

function setEditMode(on) {
  editMode = on;
  routineViewEl.hidden = on;
  routineEditEl.hidden = !on;
  editToggleBtn.hidden = on;
  routineSubEl.textContent = on
    ? "Drag to reorder, tap ＋ to insert, tap a step for details."
    : "What you actually do, in order. Tap Edit to change it.";
  if (on) {
    currentSectionTab = Object.keys(sections)[0] || null;
    renderSectionTabs();
    renderBuilderRow();
  } else {
    renderViewMode();
  }
}
editToggleBtn.addEventListener("click", () => setEditMode(true));
cancelEditBtn.addEventListener("click", () => {
  sections = JSON.parse(originalSnapshot);
  setEditMode(false);
});

function flattenSections() {
  const rows = [];
  for (const [sec, items] of Object.entries(sections)) {
    items.forEach((it, idx) => {
      rows.push({ inventory_item_id: it.inventory_item_id || null, sticker_id: it.sticker_id || null, section: sec, position: idx });
    });
  }
  return rows;
}

doneEditBtn.addEventListener("click", () => {
  if (sectionsSnapshot(sections) === originalSnapshot) {
    setEditMode(false);
    return;
  }
  versionPromptModal.classList.add("open");
});
document.getElementById("version-prompt-cancel").addEventListener("click", () => versionPromptModal.classList.remove("open"));
versionPromptModal.addEventListener("click", (e) => {
  if (e.target === versionPromptModal) versionPromptModal.classList.remove("open");
});
document.getElementById("choice-update").addEventListener("click", async () => {
  const rows = flattenSections();
  if (!isConfigured) {
    demoStore.updateCurrentVersionItems(currentVersion.id, rows);
  } else {
    await supabase.from("routine_version_items").delete().eq("routine_version_id", currentVersion.id);
    if (rows.length) await supabase.from("routine_version_items").insert(rows.map((r) => ({ user_id: userId, routine_version_id: currentVersion.id, ...r })));
  }
  originalSnapshot = sectionsSnapshot(sections);
  versionPromptModal.classList.remove("open");
  setEditMode(false);
});
document.getElementById("choice-newversion").addEventListener("click", async () => {
  const rows = flattenSections();
  if (!isConfigured) {
    currentVersion = demoStore.startNewRoutineVersion(routine.id, rows);
  } else {
    await supabase.from("routine_versions").update({ ended_at: new Date().toISOString().slice(0, 10) }).eq("id", currentVersion.id);
    const { data: versions } = await supabase.from("routine_versions").select("version_number").eq("routine_id", routine.id);
    const maxV = Math.max(0, ...(versions || []).map((v) => v.version_number));
    const { data: newVersion } = await supabase
      .from("routine_versions")
      .insert({ user_id: userId, routine_id: routine.id, version_number: maxV + 1, started_at: new Date().toISOString().slice(0, 10) })
      .select()
      .single();
    currentVersion = newVersion;
    if (rows.length) await supabase.from("routine_version_items").insert(rows.map((r) => ({ user_id: userId, routine_version_id: currentVersion.id, ...r })));
  }
  originalSnapshot = sectionsSnapshot(sections);
  versionPromptModal.classList.remove("open");
  setEditMode(false);
});

// ---------------- insert step modal ----------------
function openInsertModal() {
  insertSource = "inventory";
  document.querySelectorAll("#insert-step-modal .routine-section-tab").forEach((b) => b.classList.toggle("active", b.dataset.source === "inventory"));
  renderInsertGrid();
  insertModal.classList.add("open");
}
document.querySelectorAll("#insert-step-modal .routine-section-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    insertSource = btn.dataset.source;
    document.querySelectorAll("#insert-step-modal .routine-section-tab").forEach((b) => b.classList.toggle("active", b === btn));
    renderInsertGrid();
  });
});
async function renderInsertGrid() {
  if (insertSource === "inventory") {
    insertEmptyNote.hidden = inventoryItems.length > 0;
    insertEmptyNote.textContent = "No items in Inventory yet — add one from the gallery below, or pick a plain sticker instead.";
    insertSourceGrid.innerHTML = inventoryItems
      .map(
        (i) => `
      <div class="sticker-tile">
        <div class="sticker-badge pickable" data-insert-item="${i.id}">${stickerImgFor(i.sticker_id)}</div>
        <span class="s-name" style="font-size:0.7rem;">${escapeHtml(i.name)}</span>
      </div>`
      )
      .join("");
  } else {
    const all = await stickers.fetchAllStickers();
    insertEmptyNote.hidden = all.length > 0;
    insertEmptyNote.textContent = "No stickers in your library yet.";
    insertSourceGrid.innerHTML = all
      .map(
        (s) => `
      <div class="sticker-tile">
        <div class="sticker-badge pickable" data-insert-sticker="${s.id}">${s.image_path ? `<img src="${escapeHtml(s.image_path)}" alt="">` : "🏷️"}</div>
        <span class="s-name" style="font-size:0.7rem;">${escapeHtml(s.name)}</span>
      </div>`
      )
      .join("");
  }
}
document.getElementById("insert-step-cancel").addEventListener("click", () => insertModal.classList.remove("open"));
insertModal.addEventListener("click", (e) => {
  if (e.target === insertModal) insertModal.classList.remove("open");
});
insertSourceGrid.addEventListener("click", (e) => {
  const itemPick = e.target.closest("[data-insert-item]");
  const stickerPick = e.target.closest("[data-insert-sticker]");
  if (itemPick) {
    const item = itemById.get(itemPick.dataset.insertItem);
    sections[currentSectionTab].splice(insertAt, 0, { inventory_item_id: item.id, sticker_id: item.sticker_id || null });
    renderBuilderRow();
    insertModal.classList.remove("open");
  } else if (stickerPick) {
    const id = stickerPick.dataset.insertSticker;
    stickers.fetchStickerById(id).then((s) => {
      if (s) stickerById.set(s.id, s);
      sections[currentSectionTab].splice(insertAt, 0, { inventory_item_id: null, sticker_id: id });
      renderBuilderRow();
      insertModal.classList.remove("open");
    });
  }
});

// ---------------- item detail ----------------
function openDetail({ stickerId, itemId, allowRemove, removeIdx }) {
  const item = itemId ? itemById.get(itemId) : null;
  const sticker = stickerId ? stickerById.get(stickerId) : null;
  detailSticker.innerHTML = stickerId ? stickerImgFor(stickerId) : "🏷️";
  detailName.textContent = item ? item.name : sticker ? sticker.name : "Step";
  if (item) {
    detailStatus.hidden = false;
    detailStatus.textContent = item.status || "";
    detailStatus.className = "status-tag status-" + statusClass(item.status);
  } else {
    detailStatus.hidden = true;
  }
  detailDl.innerHTML = item
    ? `${item.brand ? `<dt>Brand</dt><dd>${escapeHtml(item.brand)}</dd>` : ""}${item.category ? `<dt>Category</dt><dd>${escapeHtml(item.category)}</dd>` : ""}`
    : `<dt>Type</dt><dd>Sticker only — no linked Inventory item</dd>`;
  detailViewInventory.hidden = !itemId;
  if (itemId) detailViewInventory.href = `inventory-item.html?id=${encodeURIComponent(itemId)}&area=${encodeURIComponent(area)}`;

  let removeBtn = document.getElementById("detail-remove");
  if (!removeBtn) {
    removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.id = "detail-remove";
    removeBtn.className = "btn-secondary";
    removeBtn.style.color = "var(--danger)";
    removeBtn.style.marginRight = "auto";
    removeBtn.textContent = "Remove from routine";
    detailModal.querySelector(".modal-actions").prepend(removeBtn);
  }
  removeBtn.hidden = !allowRemove;
  removeBtn.onclick = () => {
    if (removeIdx != null) sections[currentSectionTab].splice(removeIdx, 1);
    renderBuilderRow();
    detailModal.classList.remove("open");
  };

  detailModal.classList.add("open");
}
document.getElementById("detail-close").addEventListener("click", () => detailModal.classList.remove("open"));
detailModal.addEventListener("click", (e) => {
  if (e.target === detailModal) detailModal.classList.remove("open");
});

// ---------------- gallery ----------------
function renderGallery() {
  const finishedCount = inventoryItems.filter((i) => i.status === "Finished").length;
  const visible = showFinished ? inventoryItems : inventoryItems.filter((i) => i.status !== "Finished");
  emptyNote.hidden = inventoryItems.length > 0;
  galleryGrid.innerHTML = visible
    .map((i) => {
      const suggest = i.status === "Empty" ? `<button type="button" class="status-suggest-btn" data-suggest="${i.id}">Repurchase?</button>` : "";
      return `
      <div class="item-gallery-card" data-open-item="${i.id}">
        <div class="sticker-badge hero">${stickerImgFor(i.sticker_id)}</div>
        <span class="name">${escapeHtml(i.name)}</span>
        <span class="brand">${escapeHtml(i.brand || "")}</span>
        ${i.status ? `<span class="status-tag status-${statusClass(i.status)}">${escapeHtml(i.status)}</span>` : ""}
        ${suggest}
      </div>`;
    })
    .join("");
  if (finishedCount > 0) {
    showFinishedBtn.hidden = false;
    showFinishedBtn.textContent = showFinished ? "Hide Finished" : `Show Finished (${finishedCount})`;
  } else {
    showFinishedBtn.hidden = true;
  }
}
showFinishedBtn.addEventListener("click", () => {
  showFinished = !showFinished;
  renderGallery();
});
galleryGrid.addEventListener("click", async (e) => {
  const suggestBtn = e.target.closest("[data-suggest]");
  if (suggestBtn) {
    e.stopPropagation();
    const item = itemById.get(suggestBtn.dataset.suggest);
    item.status = "Repurchase Needed";
    if (isConfigured) await supabase.from("inventory_items").update({ status: "Repurchase Needed" }).eq("id", item.id);
    else demoStore.updateInventoryItem(item.id, { status: "Repurchase Needed" });
    renderGallery();
    return;
  }
  const card = e.target.closest("[data-open-item]");
  if (card) {
    const item = itemById.get(card.dataset.openItem);
    openDetail({ stickerId: item.sticker_id, itemId: item.id, allowRemove: false });
  }
});

// ---------------- add item ----------------
const statusPicker = stickers.initChipGroup(statusPickerEl, stickers.STATUS_OPTIONS, { multi: false });
let pendingItemStickerId = null;
openAddItemBtn.addEventListener("click", () => {
  itemForm.reset();
  pendingItemStickerId = null;
  itemStickerPreview.innerHTML = "🏷️";
  itemStickerPreview.dataset.stickerId = "";
  statusPicker.set("In Use");
  addItemModal.classList.add("open");
});
document.getElementById("add-item-cancel").addEventListener("click", () => addItemModal.classList.remove("open"));
addItemModal.addEventListener("click", (e) => {
  if (e.target === addItemModal) addItemModal.classList.remove("open");
});
stickers.wireStickerField({
  previewEl: itemStickerPreview,
  chooseBtn: document.getElementById("item-choose-sticker-btn"),
  createBtn: document.getElementById("item-create-sticker-btn"),
  onChange: (s) => {
    pendingItemStickerId = s.id;
    stickerById.set(s.id, s);
    if (!nameInput.value.trim()) nameInput.value = s.name;
  },
});

itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  const fields = {
    name,
    brand: brandInput.value.trim() || null,
    category: categoryInput.value.trim() || null,
    size: sizeInput.value.trim() || null,
    status: statusPicker.get() || "In Use",
    source_url: urlInput.value.trim() || null,
    notes: notesInput.value.trim() || null,
    sticker_id: pendingItemStickerId || null,
  };
  let created;
  if (!isConfigured) {
    created = demoStore.addInventoryItem({ area, ...fields });
  } else {
    const { data } = await supabase.from("inventory_items").insert({ user_id: userId, area, ...fields }).select().single();
    created = data;
  }
  if (!created) return;
  const price = priceInput.value ? Number(priceInput.value) : null;
  if (price != null) {
    const purchaseFields = { purchase_price: price, purchase_date: new Date().toISOString().slice(0, 10) };
    if (!isConfigured) demoStore.addInventoryPurchase(created.id, purchaseFields);
    else await supabase.from("inventory_purchases").insert({ user_id: userId, inventory_item_id: created.id, ...purchaseFields });
  }
  inventoryItems.push(created);
  itemById.set(created.id, created);
  renderGallery();
  addItemModal.classList.remove("open");
});

// ---------------- init ----------------
(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }
  stickers.setUserId(userId);

  routine = await fetchRoutine();
  currentVersion = await fetchCurrentVersion();
  const [versionItems, fetchedInventoryItems] = await Promise.all([
    currentVersion ? fetchVersionItems(currentVersion.id) : [],
    fetchInventoryItems(),
  ]);
  inventoryItems = fetchedInventoryItems;
  itemById = new Map(inventoryItems.map((i) => [i.id, i]));

  const stickerIdsNeeded = [
    ...new Set([...versionItems.map((v) => v.sticker_id), ...inventoryItems.map((i) => i.sticker_id)].filter(Boolean)),
  ];
  stickerById = new Map();
  for (const id of stickerIdsNeeded) {
    const s = await stickers.fetchStickerById(id);
    if (s) stickerById.set(id, s);
  }

  sections = itemsToSections(versionItems);
  originalSnapshot = sectionsSnapshot(sections);
  renderViewMode();
  renderGallery();
})();
