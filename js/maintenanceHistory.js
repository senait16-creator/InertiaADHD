// Routine version history — every closed era of a routine, in order,
// each with its own sticker row and note. See the README's "Versioned
// Routines" section; versions are created from maintenance-home.html's
// Active Routine editor, never here (this page is read-only).
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

document.getElementById("page-title").textContent = `${areaMeta.label} — History`;
document.getElementById("back-link").href = `maintenance-home.html?area=${encodeURIComponent(area)}`;

const timelineEl = document.getElementById("timeline");
const emptyNote = document.getElementById("empty-note");

async function fetchRoutine(userId) {
  if (!isConfigured) return demoStore.getOrCreateRoutine(area);
  const { data } = await supabase.from("routines").select("*").eq("user_id", userId).eq("area", area).maybeSingle();
  return data;
}

async function fetchVersions(routineId) {
  if (!isConfigured) return demoStore.listRoutineVersions(routineId);
  const { data, error } = await supabase.from("routine_versions").select("*").eq("routine_id", routineId);
  return error ? [] : data.sort((a, b) => a.version_number - b.version_number);
}

async function fetchVersionItems(versionId) {
  if (!isConfigured) return demoStore.listVersionItems(versionId);
  const { data, error } = await supabase.from("routine_version_items").select("*").eq("routine_version_id", versionId);
  return error ? [] : data.sort((a, b) => a.position - b.position);
}

function formatRange(v) {
  const start = new Date(v.started_at + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const end = v.ended_at ? new Date(v.ended_at + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Present";
  return `${start} – ${end}`;
}

(async function init() {
  let userId = null;
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }
  stickers.setUserId(userId);

  const routine = await fetchRoutine(userId);
  if (!routine) {
    emptyNote.hidden = false;
    return;
  }
  const versions = await fetchVersions(routine.id);
  emptyNote.hidden = versions.length > 0;

  const versionsWithItems = await Promise.all(
    versions.map(async (v) => ({ version: v, items: await fetchVersionItems(v.id) }))
  );

  const stickerIds = new Set();
  for (const { items } of versionsWithItems) for (const it of items) if (it.sticker_id) stickerIds.add(it.sticker_id);
  const stickerById = new Map();
  for (const id of stickerIds) {
    const s = await stickers.fetchStickerById(id);
    if (s) stickerById.set(id, s);
  }

  timelineEl.innerHTML = versionsWithItems
    .slice()
    .reverse()
    .map(({ version, items }) => {
      const isCurrent = !version.ended_at;
      const row = items
        .map((it, i) => {
          const s = it.sticker_id ? stickerById.get(it.sticker_id) : null;
          return `${i > 0 ? '<span class="plus-sep">+</span>' : ""}<div class="sticker-badge sm">${s?.image_path ? `<img src="${escapeHtml(s.image_path)}" alt="">` : "🏷️"}</div>`;
        })
        .join("");
      return `
      <div class="version-entry ${isCurrent ? "current" : ""}">
        <div class="version-rail"><div class="version-dot"></div></div>
        <div class="version-body">
          <div class="version-dates">${formatRange(version)}${isCurrent ? "  ·  ACTIVE" : ""}</div>
          <div class="version-sticker-row">${row || '<span class="field-note">Empty</span>'}</div>
          ${version.notes ? `<div class="version-note">${escapeHtml(version.notes)}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");
})();
