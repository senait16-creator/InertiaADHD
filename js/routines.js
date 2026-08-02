// Routines section — lists every routine-workspace project (see
// js/routineBoard.js), so any new one created later shows up here
// automatically. Opening one goes straight to the real board on
// project.html.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { DEFAULT_COLOR } from "./colors.js";
import { DEFAULT_ICON, iconMarkup, isKnownIcon } from "./lucideIcons.js";

const gridEl = document.getElementById("routines-grid");
const insightsLinkEl = document.getElementById("insights-link");
if (insightsLinkEl) insightsLinkEl.innerHTML = iconMarkup("chart-bar");

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function iconBadgeMarkup(project) {
  const color = escapeHtml(project.color || DEFAULT_COLOR);
  const inner =
    project.icon_type === "lucide"
      ? iconMarkup(isKnownIcon(project.icon) ? project.icon : DEFAULT_ICON)
      : escapeHtml(project.icon || "🔁");
  return `<div class="icon-badge" data-color="${color}">${inner}</div>`;
}

function routineCardEl(project) {
  const link = document.createElement("a");
  link.className = "panel-card";
  link.href = `project.html?id=${encodeURIComponent(project.id)}`;
  link.innerHTML = `
    ${iconBadgeMarkup(project)}
    <div class="panel-label">${escapeHtml(project.name)}</div>
  `;
  return link;
}

async function fetchRoutineProjects(userId) {
  const all = isConfigured
    ? await (async () => {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) {
          console.error("Failed to load routines:", error);
          return [];
        }
        return data;
      })()
    : demoStore.listProjects();
  return all.filter((p) => p.workspace_type === "routine");
}

(async function init() {
  let userId = null;
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }

  const routines = await fetchRoutineProjects(userId);

  if (routines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "subtitle";
    empty.textContent = "No routines yet.";
    gridEl.replaceWith(empty);
    return;
  }

  for (const project of routines) {
    gridEl.appendChild(routineCardEl(project));
  }
})();
