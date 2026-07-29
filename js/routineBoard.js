// Visual, icon-first routine board: large tiles that step through a
// state on every plain tap — ⚪ Available -> ⚫ Ready (up next; several
// steps can be Ready at once, not exclusive) -> 🟡 In Progress (rises to
// the top) -> 🟢 Complete (sinks to the bottom) -> back to Available —
// plus press-and-drag to reorder within the board's own bounds, and
// long-press for "Edit Routine Item" (currently just the duration-
// tracking toggle below). Deliberately plain taps rather than
// double-taps: no timing window to fight with the phone's own
// double-tap-zoom gesture. Used by project.js for any project with
// workspace_type === 'routine'. Deliberately no due dates, priorities,
// or counts — see supabase/seed_morning_routine.sql for how a project
// gets set up with this workspace.
//
// Every step, tracked or not, shows a completion timestamp once it
// turns Complete, e.g. "Done 8:14 AM" (see completionSummary) — that
// part is not gated by anything. Duration tracking is a separate,
// opt-in-per-step addition on top of that (see track_duration, toggled
// from the long-press edit modal): when on, a small clock badge shows
// on the card, the tap that turns the step In Progress stamps a start
// time, and a completed step then also shows how long it took, e.g.
// "Done 8:22 AM · 7 min".
//
// Two other behaviors are deliberately automatic, not manual: in
// progress steps rise to the top and complete steps sink to the bottom
// (see displaySteps/statusRank), and any step still marked done from a
// previous calendar day resets back to not-done the next time the
// board loads (see the daily-reset pass in initRoutineBoard) — routines
// describe today, not a running history.
//
// The board itself never looks backward — but every completion is
// quietly logged to a separate, permanent table (see recordCompletion
// and supabase/routine_completions) for the Insights page
// (js/insights.js, reachable from routines.html) to read later. The
// board answers "what do I want to do next"; Insights answers "what
// patterns am I noticing" — the two stay deliberately separate.
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

// Marks a step Ready — not exclusive, so this only ever touches the one
// step, never its siblings (several steps can be Ready at once).
async function persistActive(step) {
  if (!isConfigured) {
    demoStore.setActiveStep(step.id);
    return;
  }
  try {
    await supabase.from("routine_steps").update({ active: true }).eq("id", step.id);
  } catch (error) {
    console.error("Failed to save ready step:", error);
  }
}

async function persistTrackDuration(step) {
  if (!isConfigured) {
    demoStore.setStepTrackDuration(step.id, step.track_duration);
    return;
  }
  try {
    await supabase
      .from("routine_steps")
      .update({ track_duration: step.track_duration })
      .eq("id", step.id);
  } catch (error) {
    console.error("Failed to save duration-tracking preference:", error);
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

// Logs a permanent history row every time a step is tapped complete —
// this is what the Insights page reads from (see js/insights.js). Kept
// separate from routine_steps' own status/timestamps, which reset daily.
async function recordCompletion(project, step, completedAt) {
  const durationSeconds =
    step.track_duration && step.in_progress_at
      ? Math.round((new Date(completedAt) - new Date(step.in_progress_at)) / 1000)
      : null;
  const entry = {
    project_id: project.id,
    step_id: step.id,
    step_name: step.name,
    icon: step.icon || null,
    color: step.color || null,
    in_progress_at: step.track_duration ? step.in_progress_at ?? null : null,
    completed_at: completedAt,
    duration_seconds: durationSeconds != null && durationSeconds >= 0 ? durationSeconds : null,
  };
  if (!isConfigured) {
    demoStore.addRoutineCompletion(entry);
    return;
  }
  try {
    await supabase.from("routine_completions").insert(entry);
  } catch (error) {
    console.error("Failed to record routine completion:", error);
  }
}

// "6 min" — the gap between a step turning in progress and turning
// complete, so a completed step shows roughly how long it took.
function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a min";
  if (minutes === 1) return "1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

// Only meaningful when the step was tracking duration at the moment it
// turned in progress — untracked steps never get an in_progress_at, so
// this stays null for them regardless of what completionSummary shows.
function stepDuration(step) {
  if (!step.in_progress_at || !step.completed_at) return null;
  const ms = new Date(step.completed_at) - new Date(step.in_progress_at);
  return ms >= 0 ? formatDuration(ms) : null;
}

function formatClockTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Every completed step shows when it finished — "Done 8:14 AM" — whether
// or not it tracks duration. Only a step that was tracking duration (and
// so has an in_progress_at to measure from) also gets "· 6 min" appended.
function completionSummary(step) {
  if (!step.completed_at) return "";
  const clock = formatClockTime(step.completed_at);
  const duration = stepDuration(step);
  return duration ? `Done ${clock} · ${duration}` : `Done ${clock}`;
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

  // Long-press a step for this modal — currently just the duration-
  // tracking toggle, built once per board and reused across steps.
  const editModal = document.createElement("div");
  editModal.className = "modal-overlay";
  editModal.innerHTML = `
    <div class="modal">
      <h2 id="routine-edit-title">Edit Routine Item</h2>
      <form id="routine-edit-form">
        <div class="field">
          <label class="field-checkbox">
            <input type="checkbox" id="routine-edit-track-duration">
            <span>Track duration — show a timer badge and record how long this step takes</span>
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="routine-edit-cancel">Cancel</button>
          <button type="submit" class="btn-primary">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(editModal);

  const editTitleEl = editModal.querySelector("#routine-edit-title");
  const editFormEl = editModal.querySelector("#routine-edit-form");
  const editTrackDurationInput = editModal.querySelector("#routine-edit-track-duration");
  const editCancelBtn = editModal.querySelector("#routine-edit-cancel");

  let editingStep = null;

  function openEditModal(step) {
    editingStep = step;
    editTitleEl.textContent = `Edit "${step.name}"`;
    editTrackDurationInput.checked = !!step.track_duration;
    editModal.classList.add("open");
  }

  function closeEditModal() {
    editModal.classList.remove("open");
    editingStep = null;
  }

  editCancelBtn.addEventListener("click", closeEditModal);
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) closeEditModal();
  });
  editFormEl.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editingStep) return;
    editingStep.track_duration = editTrackDurationInput.checked;
    persistTrackDuration(editingStep);
    const el = nodeById.get(editingStep.id);
    if (el) updateCardClasses(el, editingStep);
    closeEditModal();
  });

  function cardEl(step) {
    const el = document.createElement("div");
    el.className = "routine-card";
    el.dataset.id = step.id;
    el.innerHTML = `
      <span class="complete-badge">${iconMarkup("check")}</span>
      <span class="duration-badge">${iconMarkup("clock")}</span>
      ${step.link ? `<span class="link-badge">${iconMarkup("external-link")}</span>` : ""}
      <div class="routine-icon" data-color="${step.color || "sage"}">${iconMarkup(step.icon)}</div>
      <div class="routine-label">${step.name}</div>
      <div class="routine-duration"></div>
    `;
    el.addEventListener("pointerdown", (e) => onPointerDown(e, step));
    return el;
  }

  function updateCardClasses(el, step) {
    el.classList.toggle("is-ready", !!step.active);
    el.classList.toggle("is-inprogress", step.status === "in_progress");
    el.classList.toggle("is-complete", step.status === "complete");
    el.classList.toggle("tracks-duration", !!step.track_duration);
    el.querySelector(".routine-duration").textContent =
      step.status === "complete" ? completionSummary(step) : "";
  }

  // In progress steps rise to the top (what you're doing right now),
  // Ready steps come next (up next, so you can see at a glance which
  // few you've queued up), Available (untouched) steps keep their
  // normal, manually reorderable order after that, and complete steps
  // sink to the bottom — automatic, so what's in progress or still
  // unfinished never gets lost.
  function statusRank(step) {
    if (step.status === "complete") return 3;
    if (step.status === "in_progress") return 0;
    if (step.active) return 1;
    return 2;
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
  //   1st tap: Ready (gray) — up next; not exclusive, so several steps
  //            can be Ready at once; opens the link too, if there is one.
  //   2nd tap: In Progress (yellow) — rises to the top; starts the timer
  //            if this step has duration tracking on.
  //   3rd tap: Complete (green) — sinks to the bottom; always records a
  //            completion timestamp, and stops the timer too if this
  //            step has duration tracking on.
  //   4th tap: back to Available (not started)
  function advanceState(step) {
    const wasIdle = !step.active && !step.status;
    let justCompletedAt = null;

    flip(() => {
      if (wasIdle) {
        step.active = true;
      } else if (step.active) {
        step.active = false;
        step.status = "in_progress";
        if (step.track_duration) step.in_progress_at = new Date().toISOString();
      } else if (step.status === "in_progress") {
        justCompletedAt = new Date().toISOString();
        step.status = "complete";
        step.completed_at = justCompletedAt;
      } else {
        step.status = null;
        step.in_progress_at = null;
        step.completed_at = null;
      }
      renderBoard();
    });

    if (wasIdle) {
      persistActive(step);
      if (step.link) {
        window.open(step.link, "_blank", "noopener,noreferrer");
      }
    } else {
      persistStatus(step);
      if (justCompletedAt) recordCompletion(project, step, justCompletedAt);
    }
  }

  const LONG_PRESS_MS = 500;
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
      longPressFired: false,
      longPressTimer: setTimeout(() => {
        drag.longPressTimer = null;
        drag.longPressFired = true;
        openEditModal(step);
      }, LONG_PRESS_MS),
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
      if (drag.longPressTimer) {
        clearTimeout(drag.longPressTimer);
        drag.longPressTimer = null;
      }
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
    const { el, step, dragging, longPressFired } = drag;
    if (drag.longPressTimer) clearTimeout(drag.longPressTimer);
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
    } else if (!longPressFired) {
      advanceState(step);
    }
    drag = null;
  }

  renderBoard();
}
