// Hair home — the "why did this happen" experimentation framework, not
// a tracker (see the README's "Hair Lab" section for the full design
// rationale). Two things happen here: the panel grid (press-and-drag to
// reorder, same gesture as the routine boards) links out to each of the
// seven areas, and "+ Start Experiment" opens the one screen every
// experiment begins with — "What am I changing?" — before handing off
// to hair-experiment.html for the rest.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { DEFAULT_PANEL_ORDER, PANEL_META, wireStartExperimentModal } from "./hairShared.js";

const gridEl = document.getElementById("panel-grid");
const startExpModal = wireStartExperimentModal();
document.getElementById("start-exp-btn").addEventListener("click", startExpModal.show);

async function fetchPanelOrder(userId) {
  const saved = isConfigured
    ? await (async () => {
        const { data } = await supabase.from("hair_settings").select("panel_order").eq("user_id", userId).maybeSingle();
        return data?.panel_order;
      })()
    : demoStore.getHairSettings()?.panel_order;
  if (!saved || !saved.length) return [...DEFAULT_PANEL_ORDER];
  // Any panel key not in a saved order (e.g. added after the user last
  // reordered) still needs to show up somewhere — append it.
  const missing = DEFAULT_PANEL_ORDER.filter((k) => !saved.includes(k));
  return [...saved, ...missing];
}

async function savePanelOrder(userId, order) {
  if (!isConfigured) {
    demoStore.saveHairPanelOrder(order);
    return;
  }
  try {
    await supabase.from("hair_settings").upsert({ user_id: userId, panel_order: order });
  } catch (error) {
    console.error("Failed to save panel order:", error);
  }
}

async function fetchPanelCounts(userId) {
  if (!isConfigured) {
    return {
      routine: demoStore.listMaintenanceRoutineSteps("hair").length,
      products: demoStore.listInventoryItems("hair").length,
      washlog: demoStore.listHairWashLog().length,
      experiments: demoStore.listHairExperiments().length,
      gallery: demoStore.listHairGallery().length,
      learned: demoStore.listHairLessons().length,
      notes: demoStore.listHairNotes().length,
    };
  }
  // routine and products are now the generic, area-filtered tables (see
  // the README's "Inventory" section) rather than Hair-only ones, so
  // they need an extra area filter the rest of these tables don't.
  const [routineCount, productsCount, ...rest] = await Promise.all([
    supabase.from("maintenance_routine_steps").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("area", "hair"),
    supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("area", "hair"),
    ...Object.entries({
      washlog: "hair_wash_log",
      experiments: "hair_experiments",
      gallery: "hair_gallery",
      learned: "hair_lessons",
      notes: "hair_notes",
    }).map(async ([key, table]) => {
      const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
      return [key, count ?? 0];
    }),
  ]);
  return {
    routine: routineCount.count ?? 0,
    products: productsCount.count ?? 0,
    ...Object.fromEntries(rest),
  };
}

function panelCountLabel(key, count) {
  if (key === "routine") return `${count} step${count === 1 ? "" : "s"}`;
  if (key === "products") return `${count} product${count === 1 ? "" : "s"}`;
  if (key === "washlog") return `${count} entr${count === 1 ? "y" : "ies"}`;
  if (key === "experiments") return `${count} logged`;
  if (key === "gallery") return `${count} photo${count === 1 ? "" : "s"}`;
  if (key === "learned") return `${count} lesson${count === 1 ? "" : "s"}`;
  return `${count} saved`;
}

function panelCardEl(key, count) {
  const meta = PANEL_META[key];
  const el = document.createElement("div");
  el.className = "panel-card draggable-panel";
  el.dataset.key = key;
  el.innerHTML = `
    ${meta.stage ? `<span class="panel-stage">${meta.stage}</span>` : ""}
    <span class="drag-hint">⠿</span>
    <div class="icon-badge" data-color="${meta.color}">${iconMarkup(meta.icon)}</div>
    <div class="panel-label">${meta.label}</div>
    <div class="panel-meta">${panelCountLabel(key, count)}</div>
  `;
  return el;
}

// Press-and-drag to reorder, same gesture/algorithm as the routine
// board (see onPointerDown in js/routineBoard.js) — simplified since
// panels have no long-press modal, just a tap-to-open vs drag-to-reorder
// distinction.
function makeReorderable(container, order, onDrop) {
  let drag = null;

  container.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".draggable-panel");
    if (!el || (e.button !== undefined && e.button > 0)) return;
    const rect = el.getBoundingClientRect();
    drag = {
      el,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      height: rect.height,
      dragging: false,
    };
    el.setPointerCapture(e.pointerId);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  });

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.dragging) {
      if (Math.hypot(dx, dy) < 12) return;
      drag.dragging = true;
      drag.el.classList.add("is-dragging");
      drag.el.style.position = "fixed";
      drag.el.style.width = `${drag.width}px`;
    }
    drag.el.style.left = `${drag.originLeft + dx}px`;
    drag.el.style.top = `${drag.originTop + dy}px`;
    drag.el.style.pointerEvents = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    drag.el.style.pointerEvents = "";
    const targetEl = under && under.closest(".draggable-panel");
    if (targetEl && targetEl !== drag.el && container.contains(targetEl)) {
      const from = order.indexOf(drag.el.dataset.key);
      const to = order.indexOf(targetEl.dataset.key);
      if (from !== -1 && to !== -1 && from !== to) {
        order.splice(to, 0, order.splice(from, 1)[0]);
        onDrop(order, false);
      }
    }
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.el.removeEventListener("pointermove", onMove);
    drag.el.removeEventListener("pointerup", onUp);
    try {
      drag.el.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    const wasDragging = drag.dragging;
    if (wasDragging) {
      drag.el.classList.remove("is-dragging");
      drag.el.style.position = "";
      drag.el.style.width = "";
      drag.el.style.left = "";
      drag.el.style.top = "";
      onDrop(order, true);
    } else {
      window.location.href = PANEL_META[drag.el.dataset.key].href;
    }
    drag = null;
  }
}

(async function init() {
  let userId = null;
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }

  const [order, counts] = await Promise.all([fetchPanelOrder(userId), fetchPanelCounts(userId)]);

  // Same reasoning as nodeById in js/routineBoard.js: reuse each
  // panel's existing node rather than recreating it, or the node being
  // actively dragged (holding pointer capture) gets destroyed mid-drag
  // the instant a reorder redraw happens.
  const nodeByKey = new Map();
  function render() {
    order.forEach((key) => {
      let el = nodeByKey.get(key);
      if (!el) {
        el = panelCardEl(key, counts[key] || 0);
        nodeByKey.set(key, el);
      }
      gridEl.appendChild(el);
    });
  }
  render();

  makeReorderable(gridEl, order, (newOrder, settled) => {
    if (settled) savePanelOrder(userId, newOrder);
    else render();
  });
})();
