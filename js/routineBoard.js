// Visual, icon-first routine board: large tiles, tap to focus, double-tap
// to complete, press-and-drag to reorder. Used by project.js for any
// project with workspace_type === 'routine'. Deliberately no due dates,
// priorities, or counts — see supabase/seed_morning_routine.sql for how a
// project gets set up with this workspace.
import { supabase, isConfigured } from "./supabaseClient.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";

async function fetchSteps(projectId) {
  if (!isConfigured) return demoStore.listSteps(projectId);

  const { data, error } = await supabase
    .from("routine_steps")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load routine steps:", error);
    return [];
  }
  return data;
}

async function persistReorder(project, steps) {
  if (!isConfigured) {
    demoStore.reorderSteps(project.id, steps.map((s) => s.id));
    return;
  }
  try {
    await Promise.all(
      steps.map((step, index) =>
        supabase.from("routine_steps").update({ sort_order: index }).eq("id", step.id)
      )
    );
  } catch (error) {
    console.error("Failed to save new step order:", error);
  }
}

async function persistActive(project, step, turningOn) {
  if (!isConfigured) {
    demoStore.setActiveStep(project.id, step.id);
    return;
  }
  try {
    await supabase.from("routine_steps").update({ active: false }).eq("project_id", project.id);
    if (turningOn) {
      await supabase.from("routine_steps").update({ active: true }).eq("id", step.id);
    }
  } catch (error) {
    console.error("Failed to save focused step:", error);
  }
}

async function persistComplete(step) {
  if (!isConfigured) {
    demoStore.setStepComplete(step.id, step.complete);
    return;
  }
  try {
    await supabase
      .from("routine_steps")
      .update({ complete: step.complete, active: step.active })
      .eq("id", step.id);
  } catch (error) {
    console.error("Failed to save completed step:", error);
  }
}

export async function initRoutineBoard(container, project) {
  let steps = await fetchSteps(project.id);
  const nodeById = new Map();

  const board = document.createElement("div");
  board.className = "routine-board";
  container.appendChild(board);

  function cardEl(step) {
    const el = document.createElement("div");
    el.className = "routine-card";
    el.dataset.id = step.id;
    el.innerHTML = `
      <span class="complete-badge">${iconMarkup("check")}</span>
      <div class="routine-icon" data-color="${step.color || "sage"}">${iconMarkup(step.icon)}</div>
      <div class="routine-label">${step.name}</div>
    `;
    el.addEventListener("pointerdown", (e) => onPointerDown(e, step));
    return el;
  }

  function updateCardClasses(el, step) {
    el.classList.toggle("is-active", !!step.active);
    el.classList.toggle("is-complete", !!step.complete);
  }

  function renderBoard() {
    for (const step of steps) {
      let el = nodeById.get(step.id);
      if (!el) {
        el = cardEl(step);
        nodeById.set(step.id, el);
      }
      updateCardClasses(el, step);
      board.appendChild(el);
    }
  }

  function flip(mutate) {
    const before = new Map(
      Array.from(board.children).map((el) => [el, el.getBoundingClientRect()])
    );
    mutate();
    for (const el of board.children) {
      if (el.classList.contains("is-dragging")) continue;
      const b = before.get(el);
      if (!b) continue;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      if (dx || dy) {
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.22s cubic-bezier(.2,.8,.2,1)";
          el.style.transform = "";
        });
      }
    }
  }

  function setActive(step) {
    const turningOn = !step.active;
    for (const s of steps) s.active = false;
    step.active = turningOn;
    renderBoard();
    persistActive(project, step, turningOn);
  }

  function toggleComplete(step) {
    step.complete = !step.complete;
    if (step.complete) step.active = false;
    renderBoard();
    persistComplete(step);
  }

  let lastTap = { id: null, time: 0 };
  let pendingTap = null;

  function handleTap(step) {
    const now = Date.now();
    if (lastTap.id === step.id && now - lastTap.time < 320) {
      clearTimeout(pendingTap);
      lastTap = { id: null, time: 0 };
      toggleComplete(step);
    } else {
      lastTap = { id: step.id, time: now };
      pendingTap = setTimeout(() => setActive(step), 320);
    }
  }

  let drag = null;

  function onPointerDown(e, step) {
    if (e.button !== undefined && e.button > 0) return;
    const el = nodeById.get(step.id);
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    drag = {
      pointerId: e.pointerId,
      step,
      el,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      height: rect.height,
      dragging: false,
    };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.dragging) {
      if (Math.hypot(dx, dy) < 9) return;
      drag.dragging = true;
      drag.el.classList.add("is-dragging");
      drag.el.style.position = "fixed";
      drag.el.style.width = `${drag.width}px`;
      drag.el.style.height = `${drag.height}px`;
      drag.el.style.margin = "0";
    }

    drag.el.style.left = `${drag.originLeft + dx}px`;
    drag.el.style.top = `${drag.originTop + dy}px`;

    drag.el.style.pointerEvents = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    drag.el.style.pointerEvents = "";
    const targetCard = under && under.closest(".routine-card");
    if (targetCard && targetCard !== drag.el && board.contains(targetCard)) {
      const targetStep = steps.find((s) => s.id === targetCard.dataset.id);
      const from = steps.indexOf(drag.step);
      const to = steps.indexOf(targetStep);
      if (from !== -1 && to !== -1 && from !== to) {
        flip(() => {
          steps.splice(from, 1);
          steps.splice(to, 0, drag.step);
          renderBoard();
        });
      }
    }
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { el, step, dragging } = drag;
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }

    if (dragging) {
      el.classList.remove("is-dragging");
      el.style.position = "";
      el.style.width = "";
      el.style.height = "";
      el.style.left = "";
      el.style.top = "";
      el.style.margin = "";
      flip(() => renderBoard());
      persistReorder(project, steps);
    } else {
      handleTap(step);
    }
    drag = null;
  }

  renderBoard();
}
