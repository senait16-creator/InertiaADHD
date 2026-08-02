// Sticker Library — shared across every page that lets you pick or
// create a sticker (Add Item, the routine builder's insert flow, Hair
// Lab's own Products panel). Not a page of its own (see the README's
// "Stickers" section for why) — this module injects one shared pair of
// modals into the document once, and any page calls openChooseSticker/
// openCreateSticker to use them, so the crop/upload logic and the
// Sticker Library list exist in exactly one place.
import { supabase, isConfigured } from "./supabaseClient.js";
import * as demoStore from "./demoStore.js";

export const STATUS_OPTIONS = ["New", "In Use", "Almost Empty", "Empty", "Finished", "Repurchase Needed", "Archived"];

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// Single or multi-select chip group — same contract as js/hairShared.js
// and js/maintenanceShared.js's copies (get/set), duplicated rather than
// imported so this module has no dependency on either.
export function initChipGroup(container, options, { multi }) {
  container.innerHTML = options
    .map(
      (opt) =>
        `<button type="button" class="chip" data-value="${escapeHtml(opt)}" role="${multi ? "checkbox" : "radio"}" aria-checked="false">${escapeHtml(opt)}</button>`
    )
    .join("");
  const buttons = Array.from(container.querySelectorAll(".chip"));
  let selected = multi ? new Set() : null;
  function refresh() {
    for (const btn of buttons) {
      const isSelected = multi ? selected.has(btn.dataset.value) : selected === btn.dataset.value;
      btn.setAttribute("aria-checked", String(isSelected));
    }
  }
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const value = btn.dataset.value;
    if (multi) {
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
    } else {
      selected = selected === value ? null : value;
    }
    refresh();
  });
  return {
    get: () => (multi ? Array.from(selected) : selected),
    set: (value) => {
      selected = multi ? new Set(value || []) : value || null;
      refresh();
    },
  };
}

let userId = null;
let stickersCache = [];

async function fetchStickers() {
  if (!isConfigured) return demoStore.listStickers();
  const { data, error } = await supabase.from("stickers").select("*").eq("user_id", userId);
  if (error) {
    console.error("Failed to load stickers:", error);
    return [];
  }
  return data.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function persistAddSticker(fields) {
  if (!isConfigured) return demoStore.addSticker(fields);
  const { data, error } = await supabase
    .from("stickers")
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to save sticker:", error);
    return null;
  }
  return data;
}

async function persistRenameSticker(id, name) {
  if (!isConfigured) return demoStore.updateSticker(id, { name });
  try {
    await supabase.from("stickers").update({ name }).eq("id", id);
  } catch (error) {
    console.error("Failed to rename sticker:", error);
  }
}

async function isStickerInUse(id) {
  if (!isConfigured) return demoStore.isStickerInUse(id);
  const [itemRes, versionItemRes] = await Promise.all([
    supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("sticker_id", id),
    supabase.from("routine_version_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("sticker_id", id),
  ]);
  return (itemRes.count || 0) > 0 || (versionItemRes.count || 0) > 0;
}

async function persistDeleteSticker(id) {
  if (!isConfigured) {
    demoStore.deleteSticker(id);
    return;
  }
  try {
    await supabase.from("stickers").delete().eq("id", id);
  } catch (error) {
    console.error("Failed to delete sticker:", error);
  }
}

async function uploadSticker(blob, ext) {
  if (!isConfigured) return null; // demo mode uses the data: URL directly instead
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("stickers").upload(path, blob, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}` });
  if (error) {
    console.error("Failed to upload sticker:", error);
    return null;
  }
  const { data } = supabase.storage.from("stickers").getPublicUrl(path);
  return data.publicUrl;
}

// ---------------- crop + resize ----------------
// Renders the visible portion of the crop stage (see wireCropStage
// below) onto a canvas at the target sticker resolution, then encodes
// as WebP — falling back to JPEG on browsers where canvas WebP encoding
// isn't available. "Transparent" per the original request depends on
// background removal, which is a labeled no-op for now (see the
// README) — a plain crop has no alpha to preserve yet.
function renderCropToBlob(img, cropRect, outSize = 320) {
  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, cropRect.sx, cropRect.sy, cropRect.sw, cropRect.sh, 0, 0, outSize, outSize);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve({ blob, ext: "webp", dataUrl: canvas.toDataURL("image/webp", 0.9) });
        } else {
          canvas.toBlob(
            (jpegBlob) => resolve({ blob: jpegBlob, ext: "jpg", dataUrl: canvas.toDataURL("image/jpeg", 0.9) }),
            "image/jpeg",
            0.9
          );
        }
      },
      "image/webp",
      0.9
    );
  });
}

// Wires the drag-to-reposition + zoom-slider crop interaction onto a
// fixed-size square stage. Returns { setImage(img), getCropRect() }.
function wireCropStage(stageEl, imgEl, zoomInput) {
  const stageSize = stageEl.clientWidth || 260;
  let naturalW = 0;
  let naturalH = 0;
  let baseScale = 1;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;

  function apply() {
    const scale = baseScale * zoom;
    const dispW = naturalW * scale;
    const dispH = naturalH * scale;
    offsetX = Math.min(0, Math.max(stageSize - dispW, offsetX));
    offsetY = Math.min(0, Math.max(stageSize - dispH, offsetY));
    imgEl.style.width = `${dispW}px`;
    imgEl.style.height = `${dispH}px`;
    imgEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  }

  function setImage(img) {
    naturalW = img.naturalWidth;
    naturalH = img.naturalHeight;
    baseScale = stageSize / Math.min(naturalW, naturalH);
    zoom = 1;
    zoomInput.value = "1";
    offsetX = (stageSize - naturalW * baseScale) / 2;
    offsetY = (stageSize - naturalH * baseScale) / 2;
    imgEl.src = img.src;
    apply();
  }

  let drag = null;
  stageEl.addEventListener("pointerdown", (e) => {
    drag = { startX: e.clientX, startY: e.clientY, originX: offsetX, originY: offsetY };
    stageEl.setPointerCapture(e.pointerId);
  });
  stageEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    offsetX = drag.originX + (e.clientX - drag.startX);
    offsetY = drag.originY + (e.clientY - drag.startY);
    apply();
  });
  stageEl.addEventListener("pointerup", () => {
    drag = null;
  });
  zoomInput.addEventListener("input", () => {
    zoom = Number(zoomInput.value);
    apply();
  });

  function getCropRect() {
    const scale = baseScale * zoom;
    return {
      sx: -offsetX / scale,
      sy: -offsetY / scale,
      sw: stageSize / scale,
      sh: stageSize / scale,
    };
  }

  return { setImage, getCropRect };
}

// ---------------- shared modal DOM, injected once ----------------
let modalsInjected = false;
let chooseModal, chooseGrid, chooseCancelBtn, createBtn2;
let createModal, sourceStep, editStep, cropStage, cropImg, zoomInput, fileInput, cameraInput, nameInput, typeSelect, saveBtn, cancelBtn2, bgToggle;
let onChooseCallback = null;
let draftBlob = null;
let draftExt = "webp";
let draftDataUrl = null;
let creatingFromChoose = false;

function injectModals() {
  if (modalsInjected) return;
  modalsInjected = true;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="modal-overlay" id="sticker-choose-modal">
      <div class="modal">
        <h2>Choose a Sticker</h2>
        <div class="sticker-grid" id="sticker-choose-grid"></div>
        <p class="field-note" id="sticker-choose-empty" hidden>No stickers yet — create one instead.</p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="sticker-choose-cancel">Cancel</button>
          <button type="button" class="btn-primary" id="sticker-choose-create">+ Create New</button>
        </div>
      </div>
    </div>
    <div class="modal-overlay" id="sticker-create-modal">
      <div class="modal">
        <h2>New Sticker</h2>
        <div id="sticker-create-source">
          <p class="field-note">For the cleanest sticker, photograph one item against a plain or light background. Other backgrounds are still okay.</p>
          <div class="modal-actions" style="justify-content:flex-start; flex-wrap:wrap; margin-top:12px;">
            <button type="button" class="btn-secondary" id="sticker-src-camera">Take Photo</button>
            <button type="button" class="btn-secondary" id="sticker-src-upload">Upload Image</button>
          </div>
          <input type="file" id="sticker-camera-input" accept="image/*" capture="environment" hidden>
          <input type="file" id="sticker-file-input" accept="image/*" hidden>
        </div>
        <div id="sticker-create-edit" hidden>
          <p class="field-note">Drag to reposition, use the slider to zoom, then crop.</p>
          <div id="sticker-crop-stage" style="width:220px; height:220px; margin:12px auto; border-radius:999px; overflow:hidden; border:3px solid var(--surface); box-shadow:0 2px 10px rgba(0,0,0,0.15); position:relative; touch-action:none; cursor:grab; background:var(--surface-2, #eee);">
            <img id="sticker-crop-img" style="position:absolute; top:0; left:0; user-select:none; pointer-events:none;" draggable="false">
          </div>
          <input type="range" id="sticker-zoom" min="1" max="3" step="0.05" value="1" style="width:100%;">
          <label style="display:flex; align-items:center; gap:6px; font-size:0.82rem; margin-top:10px;">
            <input type="checkbox" id="sticker-bg-toggle" disabled> Remove background <span class="field-note" style="margin:0;">(planned for V2)</span>
          </label>
          <label style="display:block; margin-top:10px;">
            Sticker name
            <input type="text" id="sticker-name-input" maxlength="60" autocomplete="off">
          </label>
          <label style="display:block; margin-top:10px;">
            Sticker type
            <select id="sticker-type-select">
              <option value="product">product</option>
              <option value="routine">routine</option>
              <option value="maintenance">maintenance</option>
              <option value="project">project</option>
              <option value="custom">custom</option>
            </select>
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="sticker-create-cancel">Cancel</button>
          <button type="button" class="btn-primary" id="sticker-create-save" hidden>Save to Library</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  chooseModal = document.getElementById("sticker-choose-modal");
  chooseGrid = document.getElementById("sticker-choose-grid");
  chooseCancelBtn = document.getElementById("sticker-choose-cancel");
  createBtn2 = document.getElementById("sticker-choose-create");

  createModal = document.getElementById("sticker-create-modal");
  sourceStep = document.getElementById("sticker-create-source");
  editStep = document.getElementById("sticker-create-edit");
  cropImg = document.getElementById("sticker-crop-img");
  zoomInput = document.getElementById("sticker-zoom");
  fileInput = document.getElementById("sticker-file-input");
  cameraInput = document.getElementById("sticker-camera-input");
  nameInput = document.getElementById("sticker-name-input");
  typeSelect = document.getElementById("sticker-type-select");
  saveBtn = document.getElementById("sticker-create-save");
  cancelBtn2 = document.getElementById("sticker-create-cancel");
  bgToggle = document.getElementById("sticker-bg-toggle");
  cropStage = wireCropStage(document.getElementById("sticker-crop-stage"), cropImg, zoomInput);

  chooseCancelBtn.addEventListener("click", () => chooseModal.classList.remove("open"));
  chooseModal.addEventListener("click", (e) => {
    if (e.target === chooseModal) chooseModal.classList.remove("open");
  });
  createBtn2.addEventListener("click", () => {
    chooseModal.classList.remove("open");
    openCreateSticker(onChooseCallback);
  });
  chooseGrid.addEventListener("click", async (e) => {
    const rename = e.target.closest("[data-rename]");
    const del = e.target.closest("[data-delete]");
    const pick = e.target.closest("[data-pick]");
    if (rename) {
      const s = stickersCache.find((x) => x.id === rename.dataset.rename);
      const name = prompt("Rename sticker", s.name);
      if (name && name.trim()) {
        await persistRenameSticker(s.id, name.trim());
        s.name = name.trim();
        renderChooseGrid();
      }
    } else if (del) {
      const s = stickersCache.find((x) => x.id === del.dataset.delete);
      if (await isStickerInUse(s.id)) {
        alert(`"${s.name}" is still used somewhere — remove it from there first.`);
        return;
      }
      await persistDeleteSticker(s.id);
      stickersCache = stickersCache.filter((x) => x.id !== s.id);
      renderChooseGrid();
    } else if (pick) {
      const s = stickersCache.find((x) => x.id === pick.dataset.pick);
      chooseModal.classList.remove("open");
      if (onChooseCallback) onChooseCallback(s);
    }
  });

  cancelBtn2.addEventListener("click", () => createModal.classList.remove("open"));
  createModal.addEventListener("click", (e) => {
    if (e.target === createModal) createModal.classList.remove("open");
  });
  document.getElementById("sticker-src-camera").addEventListener("click", () => cameraInput.click());
  document.getElementById("sticker-src-upload").addEventListener("click", () => fileInput.click());
  [cameraInput, fileInput].forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          sourceStep.hidden = true;
          editStep.hidden = false;
          saveBtn.hidden = false;
          cropStage.setImage(img);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  });
  bgToggle.addEventListener("change", () => {
    bgToggle.checked = false; // stays a no-op checkbox for now, see label
  });
  saveBtn.addEventListener("click", async () => {
    const img = cropImg;
    const rect = cropStage.getCropRect();
    const result = await renderCropToBlob(img, rect);
    draftBlob = result.blob;
    draftExt = result.ext;
    draftDataUrl = result.dataUrl;
    const name = nameInput.value.trim() || "Untitled sticker";
    const uploadedUrl = await uploadSticker(draftBlob, draftExt);
    const created = await persistAddSticker({
      name,
      image_path: uploadedUrl || draftDataUrl,
      sticker_type: typeSelect.value,
    });
    if (created) {
      stickersCache.push(created);
      createModal.classList.remove("open");
      if (onChooseCallback) onChooseCallback(created);
    }
  });
}

function stickerImgHtml(sticker, sizeClass = "") {
  const src = sticker?.image_path;
  return src
    ? `<img src="${escapeHtml(src)}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;">`
    : `🏷️`;
}

function renderChooseGrid() {
  document.getElementById("sticker-choose-empty").hidden = stickersCache.length > 0;
  chooseGrid.innerHTML = stickersCache
    .map(
      (s) => `
    <div class="sticker-tile">
      <div class="icon-badge pickable" data-pick="${s.id}" data-color="lavender" style="cursor:pointer; overflow:hidden;">${stickerImgHtml(s)}</div>
      <span class="panel-label" style="font-size:0.72rem;">${escapeHtml(s.name)}</span>
      <div class="s-actions" style="display:flex; gap:4px; justify-content:center; margin-top:2px;">
        <button type="button" class="btn-ghost" data-rename="${s.id}">Rename</button>
        <button type="button" class="btn-ghost" data-delete="${s.id}">Delete</button>
      </div>
    </div>`
    )
    .join("");
}

export async function openChooseSticker(onChoose) {
  injectModals();
  onChooseCallback = onChoose;
  stickersCache = await fetchStickers();
  renderChooseGrid();
  chooseModal.classList.add("open");
}

export function openCreateSticker(onSaved) {
  injectModals();
  onChooseCallback = onSaved;
  sourceStep.hidden = false;
  editStep.hidden = true;
  saveBtn.hidden = true;
  nameInput.value = "";
  typeSelect.value = "product";
  createModal.classList.add("open");
}

// Renders a small "Sticker / Image" field: a preview badge plus Choose
// Sticker / Create New buttons. Call once per page with the container
// element and a callback fired with the chosen/created sticker.
export function wireStickerField({ previewEl, chooseBtn, createBtn, onChange }) {
  chooseBtn.addEventListener("click", () => {
    openChooseSticker((sticker) => {
      previewEl.dataset.stickerId = sticker.id;
      previewEl.innerHTML = stickerImgHtml(sticker);
      if (onChange) onChange(sticker);
    });
  });
  createBtn.addEventListener("click", () => {
    openCreateSticker((sticker) => {
      previewEl.dataset.stickerId = sticker.id;
      previewEl.innerHTML = stickerImgHtml(sticker);
      if (onChange) onChange(sticker);
    });
  });
}

export function stickerBadgeHtml(sticker) {
  return stickerImgHtml(sticker);
}

export function setUserId(id) {
  userId = id;
}

export async function fetchStickerById(id) {
  if (!id) return null;
  if (!isConfigured) return demoStore.getSticker(id);
  const { data, error } = await supabase.from("stickers").select("*").eq("id", id).maybeSingle();
  return error ? null : data;
}

export async function fetchAllStickers() {
  return fetchStickers();
}
