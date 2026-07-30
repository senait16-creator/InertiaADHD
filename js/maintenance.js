// Maintenance home — a full-width panel per area, matching Routines'
// large-panel treatment rather than the old small icon chips. Only "real"
// areas link anywhere; the rest are dimmed with a "soon" tag until each
// gets its own board (see js/maintenanceBoard.js).
import { isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import { iconMarkup } from "./lucideIcons.js";
import { MAINTENANCE_AREAS } from "./maintenanceAreas.js";

const listEl = document.getElementById("entry-list");

listEl.innerHTML = MAINTENANCE_AREAS.map((area) => {
  const inner = `
    <div class="icon-badge" data-color="${area.color}">${iconMarkup(area.icon)}</div>
    <div class="entry-text">
      <p class="entry-name">${area.name}</p>
      <p class="entry-sub">${area.sub}</p>
    </div>
    ${area.real ? "" : `<span class="soon">soon</span>`}
    <span class="entry-arrow">›</span>
  `;
  return area.real
    ? `<a class="entry-panel" href="${area.href || `category.html?id=${area.key}`}">${inner}</a>`
    : `<div class="entry-panel dim">${inner}</div>`;
}).join("");

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
  }
})();
