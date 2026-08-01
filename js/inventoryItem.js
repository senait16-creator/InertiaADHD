// One Inventory item: its identity (editable), Photos (upload or, on a
// phone, take a picture directly — see the file input's `capture`
// attribute), Purchase Instances (one row per bought container, each
// with its own computed Estimated Duration/Monthly Cost), and a
// read-only "Used In" list of the Maintenance areas this item has a
// usage record in — editing a usage record (rating, notes, repurchase)
// happens on that area's own maintenance-product.html, not here, since
// this page is about the item itself, not how any one area is using it.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { AREAS, escapeHtml, estimatedDurationDays, formatDuration, estimatedMonthlyCost, formatMoney } from "./maintenanceShared.js";

const params = new URLSearchParams(window.location.search);
const itemId = params.get("id");
const area = params.get("area");
const areaMeta = AREAS[area];

if (!areaMeta) {
  window.location.href = "inventory.html";
  throw new Error("Unknown inventory area");
}

document.getElementById("back-link").href = `inventory-items.html?area=${encodeURIComponent(area)}`;

const nameEl = document.getElementById("item-name");
const metaEl = document.getElementById("item-meta");
const form = document.getElementById("item-form");
const nameInput = document.getElementById("i-name");
const brandInput = document.getElementById("i-brand");
const categoryInput = document.getElementById("i-category");
const quantityInput = document.getElementById("i-quantity");
const conditionInput = document.getElementById("i-condition");
const notesInput = document.getElementById("i-notes");
const deleteBtn = document.getElementById("delete-item");

const purchaseListEl = document.getElementById("purchase-list");
const purchaseEmptyNote = document.getElementById("purchase-empty-note");
const addPurchaseBtn = document.getElementById("add-purchase-btn");
const purchaseModal = document.getElementById("purchase-modal");
const purchaseModalTitle = document.getElementById("purchase-modal-title");
const purchaseForm = document.getElementById("purchase-form");
const purchaseCancelBtn = document.getElementById("purchase-cancel");
const puDateInput = document.getElementById("pu-purchase-date");
const puPriceInput = document.getElementById("pu-purchase-price");
const puLocationInput = document.getElementById("pu-purchase-location");
const puStartedInput = document.getElementById("pu-date-started");
const puFinishedInput = document.getElementById("pu-date-finished");

const usageListEl = document.getElementById("usage-list");
const usageEmptyNote = document.getElementById("usage-empty-note");

const photoGridEl = document.getElementById("photo-grid");
const photoEmptyNote = document.getElementById("photo-empty-note");
const addPhotoBtn = document.getElementById("add-photo-btn");
const photoInput = document.getElementById("photo-input");

let userId = null;
let item = null;
let purchases = [];
let photos = [];
let editingPurchaseId = null;

async function fetchItem() {
  if (!isConfigured) return demoStore.getInventoryItem(itemId);
  const { data, error } = await supabase.from("inventory_items").select("*").eq("id", itemId).single();
  if (error) {
    console.error("Failed to load inventory item:", error);
    return null;
  }
  return data;
}

async function fetchPurchases() {
  if (!isConfigured) return demoStore.listInventoryPurchases(itemId);
  const { data, error } = await supabase.from("inventory_purchases").select("*").eq("inventory_item_id", itemId);
  if (error) {
    console.error("Failed to load purchases:", error);
    return [];
  }
  return data.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function fetchPhotos() {
  if (!isConfigured) return demoStore.listInventoryItemPhotos(itemId);
  const { data, error } = await supabase.from("inventory_item_photos").select("*").eq("inventory_item_id", itemId);
  if (error) {
    console.error("Failed to load photos:", error);
    return [];
  }
  return data.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function fetchUsages() {
  if (!isConfigured) return demoStore.listMaintenanceUsageForItem(itemId);
  const { data, error } = await supabase.from("maintenance_usage").select("*").eq("inventory_item_id", itemId);
  return error ? [] : data;
}

async function fetchAllRoutineSteps() {
  if (!isConfigured) return demoStore.listAllMaintenanceRoutineSteps();
  const { data, error } = await supabase.from("maintenance_routine_steps").select("*").eq("user_id", userId);
  return error ? [] : data;
}

async function persistItemUpdate(fields) {
  if (!isConfigured) return demoStore.updateInventoryItem(itemId, fields);
  try {
    await supabase.from("inventory_items").update(fields).eq("id", itemId);
  } catch (error) {
    console.error("Failed to save inventory item:", error);
  }
}

async function persistItemDelete() {
  if (!isConfigured) {
    demoStore.deleteInventoryItem(itemId);
    return;
  }
  try {
    await supabase.from("inventory_items").delete().eq("id", itemId);
  } catch (error) {
    console.error("Failed to delete inventory item:", error);
  }
}

async function persistPurchaseAdd(fields) {
  if (!isConfigured) return demoStore.addInventoryPurchase(itemId, fields);
  const { data, error } = await supabase
    .from("inventory_purchases")
    .insert({ user_id: userId, inventory_item_id: itemId, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to add purchase:", error);
    return null;
  }
  return data;
}

async function persistPurchaseUpdate(id, fields) {
  if (!isConfigured) return demoStore.updateInventoryPurchase(id, fields);
  try {
    await supabase.from("inventory_purchases").update(fields).eq("id", id);
  } catch (error) {
    console.error("Failed to save purchase:", error);
  }
}

async function persistPurchaseDelete(id) {
  if (!isConfigured) {
    demoStore.deleteInventoryPurchase(id);
    return;
  }
  try {
    await supabase.from("inventory_purchases").delete().eq("id", id);
  } catch (error) {
    console.error("Failed to delete purchase:", error);
  }
}

// Downscales to a max edge of 900px and re-encodes as JPEG — same
// approach as js/hairGallery.js's resizeImage, keeps demo mode's
// localStorage data: URLs small and keeps real uploads quick.
function resizeImage(file, maxEdge = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve({ blob, dataUrl: canvas.toDataURL("image/jpeg", 0.85) }), "image/jpeg", 0.85);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPhoto(blob) {
  if (!isConfigured) return null; // demo mode stores the data: URL directly instead
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("inventory-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) {
    console.error("Failed to upload photo:", error);
    return null;
  }
  const { data } = supabase.storage.from("inventory-photos").getPublicUrl(path);
  return data.publicUrl;
}

async function persistPhotoAdd(photoUrl) {
  if (!isConfigured) return demoStore.addInventoryItemPhoto(itemId, photoUrl);
  const { data, error } = await supabase
    .from("inventory_item_photos")
    .insert({ user_id: userId, inventory_item_id: itemId, photo_url: photoUrl })
    .select()
    .single();
  if (error) {
    console.error("Failed to save photo:", error);
    return null;
  }
  return data;
}

async function persistPhotoDelete(id) {
  if (!isConfigured) {
    demoStore.deleteInventoryItemPhoto(id);
    return;
  }
  try {
    await supabase.from("inventory_item_photos").delete().eq("id", id);
  } catch (error) {
    console.error("Failed to delete photo:", error);
  }
}

function renderPhotos() {
  photoEmptyNote.hidden = photos.length > 0;
  photoGridEl.innerHTML = photos
    .map(
      (p) => `
    <div class="gallery-card">
      <div class="gallery-photo">${p.photo_url ? `<img src="${escapeHtml(p.photo_url)}" alt="">` : iconMarkup("camera")}</div>
      <div class="gallery-caption">
        <button type="button" class="btn-ghost" data-remove-photo="${p.id}">Remove</button>
      </div>
    </div>`
    )
    .join("");
}

addPhotoBtn.addEventListener("click", () => photoInput.click());
photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  photoInput.value = "";
  if (!file) return;
  const { blob, dataUrl } = await resizeImage(file);
  const uploadedUrl = await uploadPhoto(blob);
  const created = await persistPhotoAdd(uploadedUrl || dataUrl);
  if (created) {
    photos.unshift(created);
    renderPhotos();
  }
});
photoGridEl.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-remove-photo]");
  if (!removeBtn) return;
  const id = removeBtn.dataset.removePhoto;
  persistPhotoDelete(id);
  photos = photos.filter((p) => p.id !== id);
  renderPhotos();
});

function renderPurchases() {
  purchaseEmptyNote.hidden = purchases.length > 0;
  purchaseListEl.innerHTML = purchases
    .map((p) => {
      const days = estimatedDurationDays(p.date_started, p.date_finished);
      const monthly = estimatedMonthlyCost(p.purchase_price, days);
      const parts = [];
      if (p.purchase_date) parts.push(`Bought ${escapeHtml(p.purchase_date)}`);
      if (p.purchase_price != null) parts.push(formatMoney(p.purchase_price));
      if (p.purchase_location) parts.push(escapeHtml(p.purchase_location));
      return `
      <div class="card-row clickable" data-id="${p.id}" style="cursor:pointer;">
        <div class="card-title">${parts.join(" · ") || "Purchase"}</div>
        <div class="card-sub">${days != null ? escapeHtml(formatDuration(days)) : "In progress"}${monthly != null ? " · " + formatMoney(monthly) + "/mo" : ""}</div>
        <div class="card-meta-row">
          <button type="button" class="btn-ghost" data-remove-purchase="${p.id}">Remove</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderUsages(usages, stepNameById) {
  usageEmptyNote.hidden = usages.length > 0;
  usageListEl.innerHTML = usages
    .map((u) => {
      const usageAreaMeta = AREAS[u.area];
      const stepName = u.routine_step_id ? stepNameById.get(u.routine_step_id) : null;
      const parts = [];
      if (stepName) parts.push(escapeHtml(stepName));
      if (u.rating != null) parts.push(`${u.rating}/10`);
      if (u.repurchase) parts.push(`Repurchase: ${escapeHtml(u.repurchase)}`);
      return `
      <a class="card-row clickable" href="maintenance-product.html?id=${encodeURIComponent(u.id)}&area=${encodeURIComponent(u.area)}" style="display:block; text-decoration:none; color:inherit;">
        <div class="card-title">${escapeHtml(usageAreaMeta ? usageAreaMeta.label : u.area)}</div>
        <div class="card-sub">${parts.join(" · ") || "No rating yet"}</div>
      </a>
    `;
    })
    .join("");
}

function openPurchaseModal(purchase) {
  editingPurchaseId = purchase ? purchase.id : null;
  purchaseModalTitle.textContent = purchase ? "Edit Purchase" : "Add Purchase";
  puDateInput.value = purchase?.purchase_date || "";
  puPriceInput.value = purchase?.purchase_price ?? "";
  puLocationInput.value = purchase?.purchase_location || "";
  puStartedInput.value = purchase?.date_started || "";
  puFinishedInput.value = purchase?.date_finished || "";
  purchaseModal.classList.add("open");
}
function closePurchaseModal() {
  purchaseModal.classList.remove("open");
  editingPurchaseId = null;
}

addPurchaseBtn.addEventListener("click", () => openPurchaseModal(null));
purchaseCancelBtn.addEventListener("click", closePurchaseModal);
purchaseModal.addEventListener("click", (e) => {
  if (e.target === purchaseModal) closePurchaseModal();
});

purchaseListEl.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-remove-purchase]");
  if (removeBtn) {
    e.preventDefault();
    e.stopPropagation();
    const id = removeBtn.dataset.removePurchase;
    persistPurchaseDelete(id);
    purchases = purchases.filter((p) => p.id !== id);
    renderPurchases();
    return;
  }
  const row = e.target.closest(".card-row[data-id]");
  if (row) openPurchaseModal(purchases.find((p) => p.id === row.dataset.id));
});

purchaseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fields = {
    purchase_date: puDateInput.value || null,
    purchase_price: puPriceInput.value ? Number(puPriceInput.value) : null,
    purchase_location: puLocationInput.value.trim() || null,
    date_started: puStartedInput.value || null,
    date_finished: puFinishedInput.value || null,
  };
  if (editingPurchaseId) {
    await persistPurchaseUpdate(editingPurchaseId, fields);
    const existing = purchases.find((p) => p.id === editingPurchaseId);
    if (existing) Object.assign(existing, fields);
  } else {
    const created = await persistPurchaseAdd(fields);
    if (created) purchases.unshift(created);
  }
  renderPurchases();
  closePurchaseModal();
});

deleteBtn.addEventListener("click", async () => {
  if (!confirm(`Delete "${item.name}"? This also removes its purchase history and any routine assignments.`)) return;
  await persistItemDelete();
  window.location.href = `inventory-items.html?area=${encodeURIComponent(area)}`;
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
  await persistItemUpdate(fields);
  Object.assign(item, fields);
  nameEl.textContent = item.name;
  metaEl.textContent = [item.category, item.brand].filter(Boolean).join(" · ");
});

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }

  const [fetchedItem, fetchedPurchases, fetchedPhotos, usages, routineSteps] = await Promise.all([
    fetchItem(),
    fetchPurchases(),
    fetchPhotos(),
    fetchUsages(),
    fetchAllRoutineSteps(),
  ]);
  item = fetchedItem;
  if (!item) {
    window.location.href = `inventory-items.html?area=${encodeURIComponent(area)}`;
    return;
  }
  purchases = fetchedPurchases;
  photos = fetchedPhotos;

  nameEl.textContent = item.name;
  metaEl.textContent = [item.category, item.brand].filter(Boolean).join(" · ");
  nameInput.value = item.name;
  brandInput.value = item.brand || "";
  categoryInput.value = item.category || "";
  quantityInput.value = item.quantity_or_size || "";
  conditionInput.value = item.condition || "";
  notesInput.value = item.notes || "";

  renderPurchases();
  renderPhotos();

  const stepNameById = new Map(routineSteps.map((s) => [s.id, s.name]));
  renderUsages(usages, stepNameById);
})();
