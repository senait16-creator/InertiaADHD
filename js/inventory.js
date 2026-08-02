// Inventory home — a category grid, the same rectangular panel-tile
// treatment used everywhere else in the app. Answers "what do I own";
// Maintenance (a separate tile) answers "how do I care for it" by
// referencing these same items rather than duplicating them.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { AREAS } from "./maintenanceShared.js";

const gridEl = document.getElementById("panel-grid");

async function fetchCounts(userId) {
  if (!isConfigured) {
    return Object.fromEntries(Object.keys(AREAS).map((area) => [area, demoStore.listInventoryItems(area).length]));
  }
  const entries = await Promise.all(
    Object.keys(AREAS).map(async (area) => {
      const { count } = await supabase
        .from("inventory_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("area", area);
      return [area, count ?? 0];
    })
  );
  return Object.fromEntries(entries);
}

(async function init() {
  let userId = null;
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }

  const counts = await fetchCounts(userId);
  gridEl.innerHTML = Object.entries(AREAS)
    .map(([area, meta]) => {
      const count = counts[area] || 0;
      return `
      <a class="panel-card" href="inventory-items.html?area=${encodeURIComponent(area)}">
        <div class="icon-badge" data-color="${meta.color}">${iconMarkup(meta.icon)}</div>
        <div class="panel-label">${meta.inventoryLabel}</div>
        <div class="panel-meta">${count} item${count === 1 ? "" : "s"}</div>
      </a>
    `;
    })
    .join("");
})();
