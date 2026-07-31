// Maintenance home — a grid of panels, the same rectangular-tile
// treatment used everywhere else in the app (Routines, nav-board, ...)
// rather than the old full-width row style. Every area listed here is
// already built (see MAINTENANCE_AREAS) — no "soon"/dimmed state.
import { isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import { iconMarkup } from "./lucideIcons.js";
import { MAINTENANCE_AREAS } from "./maintenanceAreas.js";

const gridEl = document.getElementById("entry-list");

gridEl.innerHTML = MAINTENANCE_AREAS.map((area) => {
  return `
    <a class="panel-card" href="${area.href || `category.html?id=${area.key}`}">
      <div class="icon-badge" data-color="${area.color}">${iconMarkup(area.icon)}</div>
      <div class="panel-label">${area.name}</div>
    </a>
  `;
}).join("");

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
  }
})();
