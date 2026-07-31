// Results Gallery — experiment -> result -> photo -> date. Real photos
// this time, not a placeholder: uploaded to Supabase Storage (the
// "hair-photos" bucket, see supabase/schema.sql) when configured, or
// kept as a resized data: URL in localStorage for demo mode.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { escapeHtml } from "./hairShared.js";

const gridEl = document.getElementById("gallery-grid");
const emptyNote = document.getElementById("empty-note");
const addBtn = document.getElementById("add-photo-btn");
const fileInput = document.getElementById("photo-input");
const modal = document.getElementById("add-photo-modal");
const form = document.getElementById("add-photo-form");
const cancelBtn = document.getElementById("add-photo-cancel");
const previewSlot = document.getElementById("photo-preview-slot");
const titleInput = document.getElementById("g-title");
const dateInput = document.getElementById("g-date");
const experimentSelect = document.getElementById("g-experiment");

let userId = null;
let gallery = [];
let experiments = [];
let pendingFile = null;
let pendingDataUrl = null;

async function fetchGallery() {
  if (!isConfigured) return demoStore.listHairGallery();
  const { data, error } = await supabase.from("hair_gallery").select("*").eq("user_id", userId);
  if (error) {
    console.error("Failed to load gallery:", error);
    return [];
  }
  return data.sort((a, b) => b.photo_date.localeCompare(a.photo_date));
}

async function fetchExperiments() {
  if (!isConfigured) return demoStore.listHairExperiments();
  const { data, error } = await supabase.from("hair_experiments").select("id, title").eq("user_id", userId);
  return error ? [] : data;
}

// Downscales to a max edge of 900px and re-encodes as JPEG — keeps demo
// mode's localStorage data: URLs small, and keeps real uploads quick.
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
  const { error } = await supabase.storage.from("hair-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) {
    console.error("Failed to upload photo:", error);
    return null;
  }
  const { data } = supabase.storage.from("hair-photos").getPublicUrl(path);
  return data.publicUrl;
}

async function persistAdd(fields) {
  if (!isConfigured) return demoStore.addHairGalleryPhoto(fields);
  const { data, error } = await supabase
    .from("hair_gallery")
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to save gallery entry:", error);
    return null;
  }
  return data;
}

function render() {
  emptyNote.hidden = gallery.length > 0;
  gridEl.innerHTML = gallery
    .map(
      (g) => `
    <div class="gallery-card">
      <div class="gallery-photo">${g.photo_url ? `<img src="${escapeHtml(g.photo_url)}" alt="">` : iconMarkup("camera")}</div>
      <div class="gallery-caption">
        <div class="gallery-title">${escapeHtml(g.title)}</div>
        <div class="gallery-date">${new Date(g.photo_date + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
      </div>
    </div>`
    )
    .join("");
}

// Only resets the form chrome — never pendingFile/pendingDataUrl, which
// the file-select handler below sets right before calling this, and
// which this would otherwise immediately wipe back out.
function openModal() {
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  experimentSelect.innerHTML =
    `<option value="">None</option>` +
    experiments.map((e) => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join("");
  modal.classList.add("open");
}
function closeModal() {
  modal.classList.remove("open");
  pendingFile = null;
  pendingDataUrl = null;
}

addBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  const { blob, dataUrl } = await resizeImage(file);
  pendingFile = blob;
  pendingDataUrl = dataUrl;
  openModal();
  previewSlot.innerHTML = `<img src="${dataUrl}" alt="" style="width:100%; border-radius: var(--radius-md); display:block;">`;
  const exp = experiments[0];
  if (exp) titleInput.value = exp.title;
});
cancelBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  const uploadedUrl = pendingFile ? await uploadPhoto(pendingFile) : null;
  const fields = {
    title,
    photo_date: dateInput.value,
    experiment_id: experimentSelect.value || null,
    photo_url: uploadedUrl || pendingDataUrl || null,
  };
  const created = await persistAdd(fields);
  if (created) {
    gallery.unshift(created);
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
  [gallery, experiments] = await Promise.all([fetchGallery(), fetchExperiments()]);
  render();
})();
