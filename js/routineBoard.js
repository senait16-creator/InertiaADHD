// Visual, icon-first routine board: large tiles that step through a
// state on every plain tap — 1st: selected (green border), 2nd: in
// progress (yellow, rises to the top), 3rd: complete (green, sinks to
// the bottom), 4th: back to not started — plus press-and-drag to
// reorder within the board's own bounds. Deliberately plain taps rather
// than double-taps: no timing window to fight with the phone's own
// double-tap-zoom gesture. Used by project.js for any project with
// workspace_type === 'routine'. Deliberately no due dates, priorities,
// or counts — see supabase/seed_morning_routine.sql for how a project
// gets set up with this workspace.
//
// Three behaviors are deliberately automatic, not manual: in-progress
// steps rise to the top and complete steps sink to the bottom (see
// displaySteps/statusRank), and any step still marked done from a
// previous calendar day resets back to not-done the next time the
// board loads (see the daily-reset pass in initRoutineBoard) — routines
// describe today, not a running history.
import { supabase, isConfigured } from "./supabaseClient.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";

function isSameLocalDay(isoString) {
  if (!isoString) return false;
  return new Date(isoString).toDateString() === new Date().toDateString();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(max, min));
}

// Breathing room between a dragged card and the board's edge — keeps it
// from feeling flush against the wall and leaves room for a scrollbar.
const DRAG_EDGE_MARGIN = 12;

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

async function persistStatus(step) {
  const updates = {
    status: step.status,
    active: step.active,
    in_progress_at: step.in_progress_at ?? null,
    completed_at: step.completed_at ?? null,
  };
  if (!isConfigured) {
    demoStore.setStepStatus(step.id, updates);
    return;
  }
  try {
    await supabase.from("routine_steps").update(updates).eq("id", step.id);
  } catch (error) {
    console.error("Failed to save step status:", error);
  }
}

// "Done in 6 min" — the gap between a step turning in progress and
// turning complete, so a completed step shows roughly how long it took.
function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "done in under a min";
  if (minutes === 1) return "done in 1 min";
  if (minutes < 60) return `done in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `done in ${hours}h ${remainder}m` : `done in ${hours}h`;
}

function stepDuration(step) {
  if (!step.in_progress_at || !step.completed_at) return null;
  const ms = new Date(step.completed_at) - new Date(step.in_progress_at);
  return ms >= 0 ? formatDuration(ms) : null;
}

export async function initRoutineBoard(container, project) {
  let steps = await fetchSteps(project.id);
  const nodeById = new Map();

  // Daily reset: a step still marked done from an earlier calendar day
  // goes back to not-done, so the board reflects today rather than
  // carrying over yesterday's completions.
  const stale = steps.filter(
    (step) => step.status === "complete" && !isSameLocalDay(step.updated_at)
  );
  for (const step of stale) {
    step.status = null;
    step.in_progress_at = null;
    step.completed_at = null;
  }
  if (stale.length) {
    await Promise.all(stale.map((step) => persistStatus(step)));
  }

  const board = document.createElement("div");
  board.className = "routine-board";
  container.appendChild(board);

  function cardEl(step) {
    const el = document.createElement("div");
    el.className = "routine-card";
    el.dataset.id = step.id;
    el.innerHTML = `
      <span class="complete-badge">${iconMarkup("check")}</span>
      ${step.link ? `<span class="link-badge">${iconMarkup("external-link")}</span>` : ""}
      <div class="routine-icon" data-color="${step.color || "sage"}">${iconMarkup(step.icon)}</div>
      <div class="routine-label">${step.name}</div>
      <div class="routine-duration"></div>
    `;
    el.addEventListener("pointerdown", (e) => onPointerDown(e, step));
    return el;
  }

  function updateCardClasses(el, step) {
    el.classList.toggle("is-active", !!step.active);
    el.classList.toggle("is-inprogress", step.status === "in_progress");
    el.classList.toggle("is-complete", step.status === "complete");
    el.querySelector(".routine-duration").textContent =
      step.status === "complete" ? stepDuration(step) || "" : "";
  }

  // In progress steps rise to the top (what you're doing right now),
  // complete steps sink to the bottom (out of the way), everything else
  // (not started, or just selected) keeps its normal, manually
  // reorderable relative order in between — automatic, so what's
  // in progress or still unfinished never gets lost.
  function statusRank(step) {
    if (step.status === "complete") return 2;
    if (step.status === "in_progress") return 0;
    return 1;
  }

  function displaySteps() {
    return [...steps].sort((a, b) => statusRank(a) - statusRank(b));
  }

  function renderBoard() {
    for (const step of displaySteps()) {
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

  // Every tap advances a step one step further — no double-tap timing
  // involved, so there's no fight with the phone's own double-tap-zoom
  // gesture:
  //   1st tap: selected (green border) — exclusive, clears any other
  //            step's selection; opens the link too, if there is one.
  //   2nd tap: in progress (yellow) — rises to the top
  //   3rd tap: complete (green) — sinks to the bottom
  //   4th tap: back to not started
  function advanceState(step) {
    const wasIdle = !step.active && !step.status;

    flip(() => {
      if (wasIdle) {
        for (const s of steps) s.active = false;
        step.active = true;
      } else if (step.active) {
        step.active = false;
        step.status = "in_progress";
        step.in_progress_at = new Date().toISOString();
      } else if (step.status === "in_progress") {
        step.status = "complete";
        step.completed_at = new Date().toISOString();
      } else {
        step.status = null;
        step.in_progress_at = null;
        step.completed_at = null;
      }
      renderBoard();
    });

    if (wasIdle) {
      persistActive(project, step, true);
      if (step.link) {
        window.open(step.link, "_blank", "noopener,noreferrer");
      }
    } else {
      persistStatus(step);
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
      // Deliberately not too sensitive — a small wobble while tapping
      // shouldn't accidentally start a drag.
      if (Math.hypot(dx, dy) < 16) return;
      drag.dragging = true;
      drag.boardRect = board.getBoundingClientRect();
      drag.el.classList.add("is-dragging");
      drag.el.style.position = "fixed";
      drag.el.style.width = `${drag.width}px`;
      drag.el.style.height = `${drag.height}px`;
      drag.el.style.margin = "0";
    }

    // Keep the dragged card inside the board's own bounds — it can be
    // pushed around within the grid, not lifted out over the header or
    // buttons below it. A small margin so it doesn't feel flush against
    // the edge, and so it doesn't cover a scrollbar if the board is
    // taller than the screen.
    const left = clamp(
      drag.originLeft + dx,
      drag.boardRect.left + DRAG_EDGE_MARGIN,
      drag.boardRect.right - drag.width - DRAG_EDGE_MARGIN
    );
    const top = clamp(
      drag.originTop + dy,
      drag.boardRect.top + DRAG_EDGE_MARGIN,
      drag.boardRect.bottom - drag.height - DRAG_EDGE_MARGIN
    );
    drag.el.style.left = `${left}px`;
    drag.el.style.top = `${top}px`;

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
      advanceState(step);
    }
    drag = null;
  }

  renderBoard();
}
