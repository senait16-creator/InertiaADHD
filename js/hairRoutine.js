// Hair Routine — the current process, in order. Not an experiment (see
// js/hairExperiment.js for that); this is just what you actually do,
// reorderable the same way any other list in this app is.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { escapeHtml } from "./hairShared.js";

const listEl = document.getElementById("routine-list");
const addBtn = document.getElementById("add-step-btn");

let userId = null;
let steps = [];
// Same reasoning as nodeById in js/routineBoard.js: render() must reuse
// each step's existing DOM node rather than recreating it, or a node
// being actively dragged (and holding pointer capture) gets destroyed
// mid-gesture the moment a reorder redraw happens.
const nodeById = new Map();

async function fetchSteps() {
  if (!isConfigured) return demoStore.listHairRoutineSteps();
  const { data, error } = await supabase
    .from("hair_routine_steps")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Failed to load hair routine:", error);
    return [];
  }
  return data;
}

async function persistAdd(name) {
  if (!isConfigured) return demoStore.addHairRoutineStep(name);
  const { data, error } = await supabase
    .from("hair_routine_steps")
    .insert({ user_id: userId, name, sort_order: steps.length })
    .select()
    .single();
  if (error) {
    console.error("Failed to add hair routine step:", error);
    return null;
  }
  return data;
}

async function persistRename(id, name) {
  if (!isConfigured) return demoStore.updateHairRoutineStep(id, name);
  try {
    await supabase.from("hair_routine_steps").update({ name }).eq("id", id);
  } catch (error) {
    console.error("Failed to rename hair routine step:", error);
  }
}

async function persistDelete(id) {
  if (!isConfigured) {
    demoStore.deleteHairRoutineStep(id);
    return;
  }
  try {
    await supabase.from("hair_routine_steps").delete().eq("id", id);
  } catch (error) {
    console.error("Failed to delete hair routine step:", error);
  }
}

async function persistReorder() {
  if (!isConfigured) {
    demoStore.reorderHairRoutineSteps(steps.map((s) => s.id));
    return;
  }
  try {
    await Promise.all(
      steps.map((step, index) => supabase.from("hair_routine_steps").update({ sort_order: index }).eq("id", step.id))
    );
  } catch (error) {
    console.error("Failed to save hair routine order:", error);
  }
}

function stepRowEl(step) {
  const el = document.createElement("div");
  el.className = "routine-step-row";
  el.dataset.id = step.id;
  el.innerHTML = `
    <span class="drag-dots">⠿</span>
    <div class="step-number"></div>
    <div class="step-name" contenteditable="true"></div>
    <button type="button" class="star-btn" data-remove aria-label="Remove step">✕</button>
  `;
  el.querySelector(".step-name").addEventListener("blur", (e) => {
    const name = e.target.textContent.trim();
    if (name && name !== step.name) {
      step.name = name;
      persistRename(step.id, name);
    } else {
      e.target.textContent = step.name;
    }
  });
  el.querySelector("[data-remove]").addEventListener("click", () => {
    steps = steps.filter((s) => s.id !== step.id);
    nodeById.delete(step.id);
    persistDelete(step.id);
    render();
  });
  return el;
}

// Only touches what actually changes with position — never the
// step-name text, so an in-progress edit (or its own focus) is never
// clobbered by a reorder happening elsewhere in the list.
function updateStepRow(el, step, index) {
  el.dataset.idx = index;
  el.querySelector(".step-number").textContent = index + 1;
  const nameEl = el.querySelector(".step-name");
  if (document.activeElement !== nameEl) nameEl.textContent = step.name;
}

function render() {
  steps.forEach((step, i) => {
    let el = nodeById.get(step.id);
    if (!el) {
      el = stepRowEl(step);
      nodeById.set(step.id, el);
    }
    updateStepRow(el, step, i);
    listEl.appendChild(el);
  });
}

// Press-and-drag to reorder — same algorithm as js/routineBoard.js's
// onPointerDown, simplified: no long-press modal, no tap action other
// than editing the label directly (see contenteditable above).
let drag = null;
listEl.addEventListener("pointerdown", (e) => {
  if (e.target.closest("[contenteditable], button")) return;
  const el = e.target.closest(".routine-step-row");
  if (!el || (e.button !== undefined && e.button > 0)) return;
  const rect = el.getBoundingClientRect();
  drag = { el, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originLeft: rect.left, originTop: rect.top, width: rect.width, height: rect.height, dragging: false };
  el.setPointerCapture(e.pointerId);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
});

function onMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  if (!drag.dragging) {
    if (Math.hypot(dx, dy) < 10) return;
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
  const targetEl = under && under.closest(".routine-step-row");
  if (targetEl && targetEl !== drag.el && listEl.contains(targetEl)) {
    const from = steps.findIndex((s) => s.id === drag.el.dataset.id);
    const to = steps.findIndex((s) => s.id === targetEl.dataset.id);
    if (from !== -1 && to !== -1 && from !== to) {
      steps.splice(to, 0, steps.splice(from, 1)[0]);
      render();
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
  if (drag.dragging) {
    drag.el.classList.remove("is-dragging");
    drag.el.style.position = "";
    drag.el.style.width = "";
    drag.el.style.left = "";
    drag.el.style.top = "";
    render();
    persistReorder();
  }
  drag = null;
}

addBtn.addEventListener("click", async () => {
  const created = await persistAdd("New step");
  if (created) {
    steps.push(created);
    render();
  }
});

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }
  steps = await fetchSteps();
  render();
})();
