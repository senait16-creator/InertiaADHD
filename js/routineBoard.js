// Visual, icon-first routine board: large tiles that step through a
// state on every plain tap — ⚪ Available -> ⚫ Ready (up next; several
// steps can be Ready at once, not exclusive) -> 🟡 In Progress (rises to
// the top) -> 🟢 Complete (sinks to the bottom) -> back to Available —
// plus press-and-drag to reorder within the board's own bounds, and
// long-press for "Edit Routine Item" (an optional subtitle shown under
// the title — e.g. which book an Audiobook step is on — plus the
// duration-tracking toggle below). Deliberately plain taps rather than
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
// A card has two separately-tappable zones, so "doing the task" and
// "opening whatever's attached to it" never fight over the same tap:
// the body (label, badges, most of the card) always advances the tap
// cycle above, while the icon square opens the step's resource, if it
// has one — a plain external `link`, or, for a 'video_panel' kind step
// (see the video panel section below), a small library of video cards.
// A step with neither just does nothing when its icon is tapped. Which
// zone was pressed is decided at pointerdown (see onPointerDown) since
// pointer capture rewrites every later event's target to the card
// itself, not whatever's actually under the pointer.
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

// Saves the "Edit Routine Item" modal's fields together.
async function persistStepEdits(step) {
  const updates = {
    track_duration: step.track_duration,
    subtitle: step.subtitle ?? null,
    phased: step.phased,
  };
  if (!isConfigured) {
    demoStore.setStepEdits(step.id, updates);
    return;
  }
  try {
    await supabase.from("routine_steps").update(updates).eq("id", step.id);
  } catch (error) {
    console.error("Failed to save routine item edits:", error);
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

// Logs a permanent history row every time a step is marked "Not Today"
// (see setNotToday) — same reasoning as recordCompletion above: the
// step's own 'not_today' status only reflects today and resets by
// tomorrow, so this is what a future Insights view would read to notice
// a skip pattern.
async function recordSkip(project, step) {
  const entry = {
    project_id: project.id,
    step_id: step.id,
    step_name: step.name,
    icon: step.icon || null,
    color: step.color || null,
    skipped_at: new Date().toISOString(),
  };
  if (!isConfigured) {
    demoStore.addRoutineSkip(entry);
    return;
  }
  try {
    await supabase.from("routine_skips").insert(entry);
  } catch (error) {
    console.error("Failed to record routine skip:", error);
  }
}

// ---------------- Continuations (see the phased/continuation_of columns) ----------------
// A phased step (e.g. Steps) can be completed for "this part of the day"
// without pretending the whole habit is done — completing it offers to
// drop a small continuation card into another routine, and the
// original shows an hourglass badge for as long as that continuation
// stays open (not yet completed).

// Every other routine-workspace project — candidate targets for "Add a
// continuation to ___". Fetched fresh each time rather than assumed,
// since routine projects can be renamed or added to over time.
async function fetchOtherRoutineProjects(excludeProjectId) {
  if (!isConfigured) {
    return demoStore
      .listProjects()
      .filter((p) => p.workspace_type === "routine" && p.id !== excludeProjectId);
  }
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_type", "routine")
    .neq("id", excludeProjectId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Failed to load other routines:", error);
    return [];
  }
  return data;
}

// For a set of phased steps, which of them have an open (not yet
// completed) continuation card somewhere. Returns a Set of step ids.
async function fetchOpenContinuations(stepIds) {
  if (!stepIds.length) return new Set();
  let rows;
  if (!isConfigured) {
    rows = demoStore.listAllSteps().filter((s) => stepIds.includes(s.continuation_of));
  } else {
    const { data, error } = await supabase
      .from("routine_steps")
      .select("continuation_of, status")
      .in("continuation_of", stepIds);
    if (error) {
      console.error("Failed to load continuations:", error);
      return new Set();
    }
    rows = data;
  }
  const open = new Set();
  for (const row of rows) {
    if (row.status !== "complete") open.add(row.continuation_of);
  }
  return open;
}

async function createContinuationStep(originStep, targetProject) {
  const fields = {
    project_id: targetProject.id,
    user_id: originStep.user_id,
    name: `Finish Remaining ${originStep.name}`,
    icon: originStep.icon,
    color: originStep.color,
    sort_order: 9999,
    continuation_of: originStep.id,
  };
  if (!isConfigured) {
    // Demo mode has no per-project step count handy here, so this just
    // appends after whatever's already in that project.
    fields.sort_order = demoStore.listSteps(targetProject.id).length;
    return demoStore.addStep(fields);
  }
  const { count } = await supabase
    .from("routine_steps")
    .select("id", { count: "exact", head: true })
    .eq("project_id", targetProject.id);
  fields.sort_order = count ?? 0;
  const { data, error } = await supabase.from("routine_steps").insert(fields).select().single();
  if (error) {
    console.error("Failed to create continuation step:", error);
    return null;
  }
  return data;
}

async function deleteStepRecord(step) {
  if (!isConfigured) {
    demoStore.deleteStep(step.id);
    return;
  }
  try {
    await supabase.from("routine_steps").delete().eq("id", step.id);
  } catch (error) {
    console.error("Failed to delete continuation step:", error);
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// ---------------- Video panel (a 'video_panel' kind step, e.g. Stretch) ----------------
// Supports youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, and
// youtube.com/embed/ — the common shapes a pasted link comes in.
function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shorts) return shorts[1];
      const embed = u.pathname.match(/^\/embed\/([^/?]+)/);
      if (embed) return embed[1];
    }
  } catch {
    return null;
  }
  return null;
}

function youtubeThumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// A video's thumbnail_url is "auto" (not a manual override) when it
// matches exactly what we'd derive from the url right now — used so the
// edit form only shows something in "Custom thumbnail URL" when the
// person actually set one.
function isAutoThumbnail(video) {
  const videoId = extractYouTubeId(video.url);
  return !!videoId && video.thumbnail_url === youtubeThumbnailUrl(videoId);
}

// Best-effort only — YouTube's oEmbed endpoint is public and needs no
// API key, but this still has to fail silently (network error, private
// or deleted video, no network at all) without blocking Save; the title
// stays manually editable either way.
async function fetchYouTubeTitle(url) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch {
    return null;
  }
}

async function fetchStepVideos(stepId) {
  if (!isConfigured) return demoStore.listStepVideos(stepId);
  const { data, error } = await supabase
    .from("routine_step_videos")
    .select("*")
    .eq("step_id", stepId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Failed to load step videos:", error);
    return [];
  }
  return data;
}

async function persistNewVideo(project, step, fields) {
  const payload = { ...fields, step_id: step.id, user_id: project.user_id };
  if (!isConfigured) return demoStore.addStepVideo(payload);
  try {
    const { data, error } = await supabase.from("routine_step_videos").insert(payload).select().single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Failed to add video:", error);
    return null;
  }
}

async function persistVideoUpdate(video, fields) {
  if (!isConfigured) return demoStore.updateStepVideo(video.id, fields);
  try {
    const { data, error } = await supabase
      .from("routine_step_videos")
      .update(fields)
      .eq("id", video.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Failed to update video:", error);
    return null;
  }
}

async function persistVideoDelete(video) {
  if (!isConfigured) {
    demoStore.deleteStepVideo(video.id);
    return;
  }
  try {
    await supabase.from("routine_step_videos").delete().eq("id", video.id);
  } catch (error) {
    console.error("Failed to delete video:", error);
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

  // A completed continuation card (see continuation_of) was only ever
  // temporary — once it's served its purpose it gets deleted outright
  // on the next day's load, rather than reset back to Available like a
  // normal step would be, since there's no reason for "Finish Remaining
  // Steps" to exist again tomorrow.
  const staleContinuations = steps.filter(
    (step) => step.continuation_of && step.status === "complete" && !isSameLocalDay(step.updated_at)
  );
  if (staleContinuations.length) {
    await Promise.all(staleContinuations.map((step) => deleteStepRecord(step)));
    const staleIds = new Set(staleContinuations.map((step) => step.id));
    steps = steps.filter((step) => !staleIds.has(step.id));
  }

  // Daily reset: a step still marked done (or "Not Today") from an
  // earlier calendar day goes back to not-done, so the board reflects
  // today rather than carrying over yesterday's completions or skips.
  const stale = steps.filter(
    (step) =>
      !step.continuation_of &&
      (step.status === "complete" || step.status === "not_today") &&
      !isSameLocalDay(step.updated_at)
  );
  for (const step of stale) {
    step.status = null;
    step.in_progress_at = null;
    step.completed_at = null;
  }
  if (stale.length) {
    await Promise.all(stale.map((step) => persistStatus(step)));
  }

  // For every phased step (see the "Not today"-style checkbox in the
  // edit modal below), whether it currently has an open continuation
  // elsewhere — drives the hourglass badge in updateCard.
  const phasedStepIds = steps.filter((step) => step.phased).map((step) => step.id);
  const openContinuations = await fetchOpenContinuations(phasedStepIds);
  for (const step of steps) {
    step.hasOpenContinuation = openContinuations.has(step.id);
  }

  const board = document.createElement("div");
  board.className = "routine-board";
  container.appendChild(board);

  // Long-press a step for this modal — duration tracking and a free-text
  // subtitle, built once per board and reused across steps.
  const editModal = document.createElement("div");
  editModal.className = "modal-overlay";
  editModal.innerHTML = `
    <div class="modal">
      <h2 id="routine-edit-title">Edit Routine Item</h2>
      <form id="routine-edit-form">
        <label>
          Subtitle (optional)
          <input type="text" id="routine-edit-subtitle" maxlength="60" autocomplete="off" placeholder="e.g. the book you're reading">
        </label>
        <div class="row-list">
          <div class="row">
            <div class="row-icon tint-neutral">${iconMarkup("clock")}</div>
            <div class="row-text">
              <div class="row-title">Track duration</div>
              <div class="row-desc">Show a timer badge and record how long this step takes</div>
            </div>
            <button type="button" class="switch tone-neutral" id="routine-edit-track-duration" role="switch" aria-checked="false" aria-label="Track duration"></button>
          </div>
          <div class="row">
            <div class="row-icon tint-blue">${iconMarkup("moon-star")}</div>
            <div class="row-text">
              <div class="row-title">Not today</div>
              <div class="row-desc">Turns blue and sinks to the bottom; a plain tap undoes it</div>
            </div>
            <button type="button" class="switch tone-blue" id="routine-edit-not-today" role="switch" aria-checked="false" aria-label="Not today"></button>
          </div>
          <div class="row">
            <div class="row-icon tint-amber">${iconMarkup("hourglass")}</div>
            <div class="row-text">
              <div class="row-title">Continues in phases</div>
              <div class="row-desc">Completing it offers a continuation card in another routine</div>
            </div>
            <button type="button" class="switch tone-amber" id="routine-edit-phased" role="switch" aria-checked="false" aria-label="Continues in phases"></button>
          </div>
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
  const editSubtitleInput = editModal.querySelector("#routine-edit-subtitle");
  const editTrackDurationInput = editModal.querySelector("#routine-edit-track-duration");
  const editNotTodayInput = editModal.querySelector("#routine-edit-not-today");
  const editPhasedInput = editModal.querySelector("#routine-edit-phased");
  const editCancelBtn = editModal.querySelector("#routine-edit-cancel");

  // The three toggles above are custom switch buttons, not native
  // checkboxes (see the row-list styles in css/styles.css) — this gives
  // each one a .checked-like getter/setter/toggle so the rest of the
  // modal's code can treat them exactly like the checkboxes they
  // replaced.
  function wireSwitch(btn) {
    Object.defineProperty(btn, "checked", {
      get() {
        return btn.classList.contains("on");
      },
      set(value) {
        btn.classList.toggle("on", !!value);
        btn.setAttribute("aria-checked", value ? "true" : "false");
      },
    });
    btn.addEventListener("click", () => {
      btn.checked = !btn.checked;
    });
  }
  [editTrackDurationInput, editNotTodayInput, editPhasedInput].forEach(wireSwitch);

  let editingStep = null;

  function openEditModal(step) {
    editingStep = step;
    editTitleEl.textContent = `Edit "${step.name}"`;
    editSubtitleInput.value = step.subtitle || "";
    editTrackDurationInput.checked = !!step.track_duration;
    editNotTodayInput.checked = step.status === "not_today";
    editPhasedInput.checked = !!step.phased;
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
    const wasNotToday = editingStep.status === "not_today";
    const markNotToday = editNotTodayInput.checked;

    editingStep.subtitle = editSubtitleInput.value.trim() || null;
    editingStep.track_duration = editTrackDurationInput.checked;
    editingStep.phased = editPhasedInput.checked;
    persistStepEdits(editingStep);

    if (markNotToday && !wasNotToday) setNotToday(editingStep);
    else if (!markNotToday && wasNotToday) clearNotToday(editingStep);

    const el = nodeById.get(editingStep.id);
    if (el) updateCard(el, editingStep);
    if (videoPanelHeaderCard && videoPanelStep && videoPanelStep.id === editingStep.id) {
      updateCard(videoPanelHeaderCard, videoPanelStep);
    }
    closeEditModal();
  });

  // Sinks a step to the very bottom of the board for today (see
  // statusRank) without touching anything else about it — the same
  // step picks back up tomorrow, or right away if cleared here or via a
  // plain tap (see advanceState's catch-all reset branch).
  function setNotToday(step) {
    flip(() => {
      step.status = "not_today";
      step.active = false;
      step.in_progress_at = null;
      step.completed_at = null;
      renderBoard();
    });
    persistStatus(step);
    recordSkip(project, step);
  }

  function clearNotToday(step) {
    flip(() => {
      step.status = null;
      renderBoard();
    });
    persistStatus(step);
  }

  // Offered right after completing a phased step (see the "Continues in
  // phases" checkbox above) — one modal, reused for whichever step just
  // triggered it. Built once per board; its list of routine buttons is
  // filled in fresh each time it opens, since which other routines exist
  // isn't known until then.
  const continueModal = document.createElement("div");
  continueModal.className = "modal-overlay";
  continueModal.innerHTML = `
    <div class="modal">
      <h2 id="continue-modal-title">Continue later today?</h2>
      <p id="continue-modal-body" class="subtitle"></p>
      <div id="continue-modal-routines" class="continue-routine-list"></div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="continue-modal-skip">Not needed today</button>
      </div>
    </div>
  `;
  document.body.appendChild(continueModal);

  const continueModalBodyEl = continueModal.querySelector("#continue-modal-body");
  const continueModalRoutinesEl = continueModal.querySelector("#continue-modal-routines");
  const continueModalSkipBtn = continueModal.querySelector("#continue-modal-skip");

  function closeContinueModal() {
    continueModal.classList.remove("open");
  }

  continueModalSkipBtn.addEventListener("click", closeContinueModal);
  continueModal.addEventListener("click", (e) => {
    if (e.target === continueModal) closeContinueModal();
  });

  async function promptContinuation(step) {
    const otherRoutines = await fetchOtherRoutineProjects(project.id);
    if (!otherRoutines.length) return;

    continueModalBodyEl.textContent = `You marked "${step.name}" done for now — want to pick it back up later today?`;
    continueModalRoutinesEl.innerHTML = "";
    for (const routine of otherRoutines) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-primary";
      btn.textContent = `Continue in ${routine.name}`;
      btn.addEventListener("click", async () => {
        closeContinueModal();
        const created = await createContinuationStep(step, routine);
        if (created) {
          step.hasOpenContinuation = true;
          const el = nodeById.get(step.id);
          if (el) updateCard(el, step);
        }
      });
      continueModalRoutinesEl.appendChild(btn);
    }
    continueModal.classList.add("open");
  }

  function handlePanelHeaderTap(step) {
    advanceState(step);
    if (videoPanelHeaderCard) updateCard(videoPanelHeaderCard, step);
  }

  // The icon square's tap target — opens whatever resource a step has,
  // if any. Read fresh off the step each tap (rather than baked in at
  // cardEl creation time) since the same step object is mutated in
  // place elsewhere in this file.
  function handleIconTap(step) {
    if (step.kind === "video_panel") {
      openVideoPanel(step);
    } else if (step.link) {
      window.open(step.link, "_blank", "noopener,noreferrer");
    }
  }

  // iconOpensResource is false for the one card that's already showing
  // its own resource — the video panel's header card reuse of a
  // 'video_panel' step — since tapping its icon there would just try to
  // reopen the panel it's already inside.
  function cardEl(step, { onBodyTap = advanceState, iconOpensResource = true } = {}) {
    const el = document.createElement("div");
    el.className = "routine-card";
    el.dataset.id = step.id;
    el.innerHTML = `
      <span class="complete-badge">${iconMarkup("check")}</span>
      <span class="duration-badge">${iconMarkup("clock")}</span>
      <span class="phase-badge">${iconMarkup("hourglass")}</span>
      ${step.link || step.kind === "video_panel" ? `<span class="link-badge">${iconMarkup("external-link")}</span>` : ""}
      <div class="routine-icon" data-color="${step.color || "sage"}">${iconMarkup(step.icon)}</div>
      <div class="routine-label">${step.name}</div>
      <div class="routine-subtitle"></div>
      <div class="routine-duration"></div>
    `;
    el.addEventListener("pointerdown", (e) => onPointerDown(e, step, onBodyTap, iconOpensResource));
    return el;
  }

  function updateCard(el, step) {
    el.classList.toggle("is-ready", !!step.active);
    el.classList.toggle("is-inprogress", step.status === "in_progress");
    el.classList.toggle("is-complete", step.status === "complete");
    el.classList.toggle("is-not-today", step.status === "not_today");
    el.classList.toggle("tracks-duration", !!step.track_duration);
    el.classList.toggle("has-continuation", !!step.hasOpenContinuation);
    el.querySelector(".routine-subtitle").textContent = step.subtitle || "";
    el.querySelector(".routine-duration").textContent =
      step.status === "complete"
        ? completionSummary(step)
        : step.status === "not_today"
          ? "Not today"
          : "";
  }

  // In progress steps rise to the top (what you're doing right now),
  // Ready steps come next (up next, so you can see at a glance which
  // few you've queued up), Available (untouched) steps keep their
  // normal, manually reorderable order after that, complete steps sink
  // to the bottom, and "Not Today" steps sink even further below those
  // — automatic, so what's in progress or still unfinished never gets
  // lost, and what's explicitly skipped stays out of the way.
  function statusRank(step) {
    if (step.status === "not_today") return 4;
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
      updateCard(el, step);
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

  // Every tap on a card's body advances it one step further — no
  // double-tap timing involved, so there's no fight with the phone's own
  // double-tap-zoom gesture:
  //   1st tap: Ready (gray) — up next; not exclusive, so several steps
  //            can be Ready at once.
  //   2nd tap: In Progress (yellow) — rises to the top; starts the timer
  //            if this step has duration tracking on.
  //   3rd tap: Complete (green) — sinks to the bottom; always records a
  //            completion timestamp, and stops the timer too if this
  //            step has duration tracking on.
  //   4th tap: back to Available (not started)
  // A step marked "Not Today" (blue, see setNotToday) isn't part of this
  // cycle — it falls through to the same catch-all branch a 4th tap
  // hits, so a plain tap on it just undoes the skip and returns it to
  // Available, ready to start the cycle fresh.
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
    } else {
      persistStatus(step);
      if (justCompletedAt) {
        recordCompletion(project, step, justCompletedAt);
        if (step.phased && !step.hasOpenContinuation) promptContinuation(step);
      }
    }
  }

  const LONG_PRESS_MS = 500;
  let drag = null;

  function onPointerDown(e, step, onBodyTap, iconOpensResource) {
    if (e.button !== undefined && e.button > 0) return;
    const el = e.currentTarget;
    // Captured here, before setPointerCapture below rewrites every later
    // event's target to el regardless of where the pointer actually is.
    const pressedIcon = iconOpensResource && !!e.target.closest(".routine-icon");
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    drag = {
      pointerId: e.pointerId,
      step,
      el,
      onBodyTap,
      pressedIcon,
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
      // Only cards in the main grid are reorderable — e.g. a step's own
      // card reused as its video panel's header has nowhere to be
      // dropped, so it shouldn't lift into a drag at all.
      if (!board.contains(drag.el)) return;
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
    const { el, step, onBodyTap, pressedIcon, dragging, longPressFired } = drag;
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
      if (pressedIcon) handleIconTap(step);
      else onBodyTap(step);
    }
    drag = null;
  }

  // --- Video panel: a secondary screen of video cards for a
  // 'video_panel' kind step (see handleIconTap above). ---
  const videoPanelEl = document.createElement("div");
  videoPanelEl.className = "video-panel";
  videoPanelEl.hidden = true;
  container.appendChild(videoPanelEl);

  const videoEditModal = document.createElement("div");
  videoEditModal.className = "modal-overlay";
  videoEditModal.innerHTML = `
    <div class="modal">
      <h2 id="video-edit-title">Add Video</h2>
      <form id="video-edit-form">
        <label>
          Video URL
          <input type="url" id="video-edit-url" required autocomplete="off" placeholder="https://youtube.com/watch?v=...">
        </label>
        <label>
          Display title
          <div class="field-with-button">
            <input type="text" id="video-edit-title-input" autocomplete="off" placeholder="e.g. 10-Minute Morning Stretch">
            <button type="button" id="video-edit-refetch" title="Fetch title from URL">${iconMarkup("repeat-2")}</button>
          </div>
        </label>
        <label>
          Duration (optional)
          <input type="text" id="video-edit-duration" autocomplete="off" placeholder="e.g. 10 min">
        </label>
        <label>
          Custom thumbnail URL (optional)
          <input type="url" id="video-edit-thumb" autocomplete="off" placeholder="https://...">
        </label>
        <label>
          Note (optional)
          <input type="text" id="video-edit-note" autocomplete="off" placeholder="e.g. Hips, Gentle">
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-danger" id="video-delete-btn" hidden>Delete</button>
          <button type="button" class="btn-secondary" id="video-edit-cancel">Cancel</button>
          <button type="submit" class="btn-primary">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(videoEditModal);

  const videoEditTitleEl = videoEditModal.querySelector("#video-edit-title");
  const videoEditFormEl = videoEditModal.querySelector("#video-edit-form");
  const videoUrlInput = videoEditModal.querySelector("#video-edit-url");
  const videoTitleInput = videoEditModal.querySelector("#video-edit-title-input");
  const videoDurationInput = videoEditModal.querySelector("#video-edit-duration");
  const videoThumbInput = videoEditModal.querySelector("#video-edit-thumb");
  const videoNoteInput = videoEditModal.querySelector("#video-edit-note");
  const videoRefetchBtn = videoEditModal.querySelector("#video-edit-refetch");
  const videoDeleteBtn = videoEditModal.querySelector("#video-delete-btn");
  const videoCancelBtn = videoEditModal.querySelector("#video-edit-cancel");

  let editingVideo = null;
  let videoPanelStep = null;
  let videoPanelHeaderCard = null;
  let videoGridEl = null;
  let videos = [];

  function openVideoEditModal(video) {
    editingVideo = video;
    videoEditTitleEl.textContent = video ? "Edit Video" : "Add Video";
    videoUrlInput.value = video?.url || "";
    videoTitleInput.value = video?.title || "";
    videoDurationInput.value = video?.duration || "";
    videoThumbInput.value = video && !isAutoThumbnail(video) ? video.thumbnail_url || "" : "";
    videoNoteInput.value = video?.note || "";
    videoDeleteBtn.hidden = !video;
    videoEditModal.classList.add("open");
  }

  function closeVideoEditModal() {
    videoEditModal.classList.remove("open");
    editingVideo = null;
  }

  videoCancelBtn.addEventListener("click", closeVideoEditModal);
  videoEditModal.addEventListener("click", (e) => {
    if (e.target === videoEditModal) closeVideoEditModal();
  });

  async function fillTitleIfEmpty(url) {
    if (!url || videoTitleInput.value.trim()) return;
    const title = await fetchYouTubeTitle(url);
    if (title) videoTitleInput.value = title;
  }

  videoUrlInput.addEventListener("blur", () => fillTitleIfEmpty(videoUrlInput.value.trim()));

  videoRefetchBtn.addEventListener("click", async () => {
    const url = videoUrlInput.value.trim();
    if (!url) return;
    const title = await fetchYouTubeTitle(url);
    if (title) videoTitleInput.value = title;
  });

  videoEditFormEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = videoUrlInput.value.trim();
    if (!url) return;
    const customThumb = videoThumbInput.value.trim();
    const videoId = extractYouTubeId(url);
    const fields = {
      url,
      title: videoTitleInput.value.trim() || null,
      duration: videoDurationInput.value.trim() || null,
      note: videoNoteInput.value.trim() || null,
      thumbnail_url: customThumb || (videoId ? youtubeThumbnailUrl(videoId) : null),
    };

    if (editingVideo) {
      const updated = await persistVideoUpdate(editingVideo, fields);
      if (updated) {
        const idx = videos.findIndex((v) => v.id === editingVideo.id);
        if (idx !== -1) videos[idx] = updated;
      }
    } else {
      const created = await persistNewVideo(project, videoPanelStep, { ...fields, sort_order: videos.length });
      if (created) videos.push(created);
    }

    closeVideoEditModal();
    renderVideoGrid();
  });

  videoDeleteBtn.addEventListener("click", async () => {
    if (!editingVideo) return;
    await persistVideoDelete(editingVideo);
    videos = videos.filter((v) => v.id !== editingVideo.id);
    closeVideoEditModal();
    renderVideoGrid();
  });

  function videoCardEl(video) {
    const el = document.createElement("div");
    el.className = "video-card";
    el.dataset.id = video.id;

    const videoId = extractYouTubeId(video.url);
    const thumbUrl = video.thumbnail_url || (videoId ? youtubeThumbnailUrl(videoId) : null);
    const durationBadge = video.duration
      ? `<span class="video-duration-badge">${escapeHtml(video.duration)}</span>`
      : "";
    const thumbInner = thumbUrl
      ? `<img class="video-thumb" src="${escapeHtml(thumbUrl)}" alt="" loading="lazy">`
      : `<div class="video-thumb-placeholder">${iconMarkup("stretching")}<span>Preview unavailable</span></div>`;

    el.innerHTML = `
      <button type="button" class="video-edit-btn" aria-label="Edit video">${iconMarkup("pencil")}</button>
      <a class="video-open-link" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">
        <div class="video-thumb-wrap">${thumbInner}${durationBadge}</div>
        <div class="video-title">${escapeHtml(video.title || "Untitled video")}</div>
        ${video.note ? `<div class="video-note">${escapeHtml(video.note)}</div>` : ""}
      </a>
    `;

    el.querySelector(".video-edit-btn").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openVideoEditModal(video);
    });

    const img = el.querySelector(".video-thumb");
    if (img) {
      img.addEventListener("load", () => {
        // YouTube returns a 120x90 gray placeholder (not a 404) when
        // maxresdefault.jpg doesn't exist for a video — swap to
        // hqdefault.jpg, which is always available, when that happens.
        if (img.naturalWidth === 120 && img.naturalHeight === 90 && videoId) {
          img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
      });
      img.addEventListener("error", () => {
        const wrap = img.closest(".video-thumb-wrap");
        if (wrap) wrap.innerHTML = `<div class="video-thumb-placeholder">${iconMarkup("stretching")}<span>Preview unavailable</span></div>${durationBadge}`;
      });
    }

    return el;
  }

  function renderVideoGrid() {
    while (videoGridEl.children.length > 1) {
      videoGridEl.removeChild(videoGridEl.lastChild);
    }
    for (const video of videos) {
      videoGridEl.appendChild(videoCardEl(video));
    }
  }

  function renderVideoPanelShell() {
    videoPanelEl.innerHTML = "";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "back-link nav-back";
    back.textContent = `‹ ${project.name}`;
    back.addEventListener("click", closeVideoPanel);
    videoPanelEl.appendChild(back);

    videoPanelHeaderCard = cardEl(videoPanelStep, {
      onBodyTap: handlePanelHeaderTap,
      iconOpensResource: false,
    });
    updateCard(videoPanelHeaderCard, videoPanelStep);

    videoGridEl = document.createElement("div");
    videoGridEl.className = "video-panel-grid";
    videoGridEl.appendChild(videoPanelHeaderCard);
    videoPanelEl.appendChild(videoGridEl);
    renderVideoGrid();

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-video-row";
    addBtn.textContent = "+ Add Video";
    addBtn.addEventListener("click", () => openVideoEditModal(null));
    videoPanelEl.appendChild(addBtn);
  }

  async function openVideoPanel(step) {
    videoPanelStep = step;
    board.hidden = true;
    videoPanelEl.hidden = false;
    videoPanelEl.innerHTML = `<p class="subtitle">Loading…</p>`;
    videos = await fetchStepVideos(step.id);
    renderVideoPanelShell();
  }

  function closeVideoPanel() {
    videoPanelStep = null;
    videoPanelHeaderCard = null;
    videoPanelEl.hidden = true;
    board.hidden = false;
  }

  renderBoard();
}
