// Maintenance log — one entry per day, with a routine snapshot locked to
// whichever version is active at save time (see the README's "Preserve
// routine snapshots in logs" section). A past entry's snapshot always
// reflects the version that was active *then*, never the current one.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { AREAS, escapeHtml } from "./maintenanceShared.js";
import * as stickers from "./stickerShared.js";

const params = new URLSearchParams(window.location.search);
const area = params.get("area");
const areaMeta = AREAS[area];

if (!areaMeta) {
  window.location.href = "maintenance.html";
  throw new Error("Unknown maintenance area");
}

document.getElementById("page-title").textContent = `${areaMeta.label} — Log`;
document.getElementById("back-link").href = `maintenance-home.html?area=${encodeURIComponent(area)}`;
document.getElementById("log-today-date").textContent = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });

const logSnapshotEl = document.getElementById("log-snapshot");
const logForm = document.getElementById("log-form");
const notesInput = document.getElementById("log-notes");
const photoPreview = document.getElementById("log-photo-preview");
const photoInput = document.getElementById("log-photo-input");
const logHistoryEl = document.getElementById("log-history");
const logEmptyNote = document.getElementById("log-empty-note");

let userId = null;
let currentVersionId = null;
let pendingPhotoBlob = null;
let pendingPhotoDataUrl = null;

function wireSeverityRow(row) {
  row.addEventListener("click", (e) => {
    const chip = e.target.closest(".severity-chip");
    if (!chip) return;
    row.querySelectorAll(".severity-chip").forEach((c) => c.setAttribute("aria-checked", "false"));
    chip.setAttribute("aria-checked", "true");
  });
}
document.querySelectorAll(".severity-row").forEach(wireSeverityRow);
function severityValue(field) {
  const active = document.querySelector(`.severity-row[data-field="${field}"] .severity-chip[aria-checked="true"]`);
  return active ? active.dataset.value : null;
}

async function fetchRoutine() {
  if (!isConfigured) return demoStore.getOrCreateRoutine(area);
  const { data } = await supabase.from("routines").select("*").eq("user_id", userId).eq("area", area).maybeSingle();
  return data;
}
async function fetchCurrentVersion(routineId) {
  if (!isConfigured) return demoStore.getCurrentRoutineVersion(routineId);
  const { data } = await supabase
    .from("routine_versions")
    .select("*")
    .eq("user_id", userId)
    .eq("routine_id", routineId)
    .is("ended_at", null)
    .maybeSingle();
  return data;
}
async function fetchVersionItems(versionId) {
  if (!versionId) return [];
  if (!isConfigured) return demoStore.listVersionItems(versionId);
  const { data, error } = await supabase.from("routine_version_items").select("*").eq("routine_version_id", versionId);
  return error ? [] : data.sort((a, b) => a.position - b.position);
}
async function fetchLogs() {
  if (!isConfigured) return demoStore.listMaintenanceLogs(area);
  const { data, error } = await supabase.from("maintenance_logs").select("*").eq("user_id", userId).eq("area", area);
  return error ? [] : data.sort((a, b) => b.log_date.localeCompare(a.log_date));
}

async function renderSnapshotRow(container, versionId) {
  const items = await fetchVersionItems(versionId);
  if (!items.length) {
    container.innerHTML = `<span class="field-note">No routine steps yet.</span>`;
    return;
  }
  const rows = await Promise.all(
    items.map(async (it, i) => {
      const s = it.sticker_id ? await stickers.fetchStickerById(it.sticker_id) : null;
      const img = s?.image_path ? `<img src="${escapeHtml(s.image_path)}" alt="">` : "🏷️";
      return `${i > 0 ? '<span class="plus-sep">+</span>' : ""}<div class="sticker-badge">${img}</div>`;
    })
  );
  container.innerHTML = rows.join("");
}

// ---------------- photo upload (resize client-side, same pattern as js/hairGallery.js) ----------------
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
async function uploadLogPhoto(blob) {
  if (!isConfigured) return null;
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("inventory-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) {
    console.error("Failed to upload photo:", error);
    return null;
  }
  const { data } = supabase.storage.from("inventory-photos").getPublicUrl(path);
  return data.publicUrl;
}
photoPreview.addEventListener("click", () => photoInput.click());
photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  photoInput.value = "";
  if (!file) return;
  const { blob, dataUrl } = await resizeImage(file);
  pendingPhotoBlob = blob;
  pendingPhotoDataUrl = dataUrl;
  photoPreview.innerHTML = `<img src="${dataUrl}" alt="" style="width:100%; height:100%; object-fit:cover;">`;
});

async function persistLog(fields) {
  if (!isConfigured) return demoStore.addMaintenanceLog({ area, ...fields });
  const { data, error } = await supabase
    .from("maintenance_logs")
    .insert({ user_id: userId, area, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to save log:", error);
    return null;
  }
  return data;
}

logForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const uploadedUrl = pendingPhotoBlob ? await uploadLogPhoto(pendingPhotoBlob) : null;
  const created = await persistLog({
    routine_version_id: currentVersionId,
    condition: severityValue("condition"),
    dryness: severityValue("dryness"),
    irritation: severityValue("irritation"),
    breakouts: severityValue("breakouts"),
    notes: notesInput.value.trim() || null,
    photo_url: uploadedUrl || pendingPhotoDataUrl || null,
  });
  if (created) {
    logForm.reset();
    document.querySelectorAll(".severity-chip").forEach((c) => c.setAttribute("aria-checked", "false"));
    photoPreview.innerHTML = "＋";
    pendingPhotoBlob = null;
    pendingPhotoDataUrl = null;
    await renderLogHistory();
  }
});

async function renderLogHistory() {
  const logs = await fetchLogs();
  logEmptyNote.hidden = logs.length > 0;
  logHistoryEl.innerHTML = logs
    .map(
      (l) => `
    <div class="log-entry-row">
      <div class="field-note" style="margin:0;">${new Date(l.log_date + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
      <div class="routine-hero-row" data-log-snapshot="${l.id}" data-version="${l.routine_version_id || ""}" style="margin-top:0.4rem;"></div>
      <div class="chip-group" style="margin-top:0.5rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
        ${l.condition ? `<span class="status-tag" style="background:var(--surface-muted); color:var(--text);">Condition: ${escapeHtml(l.condition)}</span>` : ""}
        ${l.dryness && l.dryness !== "None" ? `<span class="status-tag" style="background:var(--surface-muted); color:var(--text);">Dryness: ${escapeHtml(l.dryness)}</span>` : ""}
        ${l.irritation && l.irritation !== "None" ? `<span class="status-tag" style="background:var(--surface-muted); color:var(--text);">Irritation: ${escapeHtml(l.irritation)}</span>` : ""}
        ${l.breakouts && l.breakouts !== "None" ? `<span class="status-tag" style="background:var(--surface-muted); color:var(--text);">Breakouts: ${escapeHtml(l.breakouts)}</span>` : ""}
      </div>
      ${l.notes ? `<p class="field-note" style="margin-top:0.4rem;">${escapeHtml(l.notes)}</p>` : ""}
      ${l.photo_url ? `<img src="${escapeHtml(l.photo_url)}" alt="" style="width:70px; height:70px; object-fit:cover; border-radius:10px; margin-top:0.4rem;">` : ""}
    </div>`
    )
    .join("");
  for (const el of logHistoryEl.querySelectorAll("[data-log-snapshot]")) {
    renderSnapshotRow(el, el.dataset.version || null);
  }
}

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }
  stickers.setUserId(userId);

  const routine = await fetchRoutine();
  const version = routine ? await fetchCurrentVersion(routine.id) : null;
  currentVersionId = version ? version.id : null;
  await renderSnapshotRow(logSnapshotEl, currentVersionId);
  await renderLogHistory();
})();
