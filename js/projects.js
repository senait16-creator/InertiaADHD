// Projects section — the original dashboard, now scoped under the home
// screen. Routine-workspace projects (see js/routineBoard.js) live under
// Routines instead, so this grid excludes them.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { DEFAULT_COLOR, initColorPicker } from "./colors.js";
import { DEFAULT_ICON, iconMarkup, initIconPicker, isKnownIcon } from "./lucideIcons.js";

const gridEl = document.getElementById("project-grid");
const addCard = document.getElementById("add-project-card");

const modal = document.getElementById("add-project-modal");
const addForm = document.getElementById("add-project-form");
const nameInput = document.getElementById("project-name");
const statusInput = document.getElementById("project-status");
const cancelBtn = document.getElementById("cancel-add");
const colorPicker = initColorPicker(document.getElementById("project-color-picker"));
const iconPicker = initIconPicker(document.getElementById("project-icon-picker"));

const actionModal = document.getElementById("project-action-modal");
const actionMenuView = document.getElementById("action-menu-view");
const actionConfirmView = document.getElementById("action-confirm-view");
const actionMenuTitle = document.getElementById("action-menu-title");
const actionDeleteBtn = document.getElementById("action-delete-btn");
const actionCancelBtn1 = document.getElementById("action-cancel-btn-1");
const actionCancelBtn2 = document.getElementById("action-cancel-btn-2");
const confirmText = document.getElementById("confirm-text");
const actionConfirmDeleteBtn = document.getElementById("action-confirm-delete-btn");

let currentUserId = null;
let actionTarget = null;

const LONG_PRESS_MS = 500;
const LONG_PRESS_CANCEL_PX = 10;

function attachLongPress(el, project) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button > 0) return;
    fired = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      fired = true;
      timer = null;
      openActionMenu(project, el);

      // The finger/mouse is still down when the menu appears. Its
      // eventual release lands wherever the menu now renders (often
      // right on top of "Cancel"), which would otherwise register as a
      // tap on that button. Swallow just that one trailing release so it
      // takes a deliberate second tap to actually choose something.
      const swallowRelease = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      window.addEventListener("pointerup", swallowRelease, { capture: true, once: true });
    }, LONG_PRESS_MS);
  });

  el.addEventListener("pointermove", (e) => {
    if (!timer) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > LONG_PRESS_CANCEL_PX) {
      clearTimer();
    }
  });

  el.addEventListener("pointerup", clearTimer);
  el.addEventListener("pointercancel", clearTimer);
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  // A long press that opened the menu shouldn't also navigate — the click
  // event still fires on release, so swallow it once.
  el.addEventListener("click", (e) => {
    if (fired) {
      e.preventDefault();
      fired = false;
    }
  });
}

function openActionMenu(project, cardEl) {
  actionTarget = { project, cardEl };
  actionMenuTitle.textContent = project.name;
  actionMenuView.hidden = false;
  actionConfirmView.hidden = true;
  actionModal.classList.add("open");
}

function closeActionModal() {
  actionModal.classList.remove("open");
  actionTarget = null;
}

actionCancelBtn1.addEventListener("click", closeActionModal);
actionCancelBtn2.addEventListener("click", closeActionModal);
actionModal.addEventListener("click", (event) => {
  if (event.target === actionModal) closeActionModal();
});

actionDeleteBtn.addEventListener("click", () => {
  if (!actionTarget) return;
  confirmText.textContent = `Delete "${actionTarget.project.name}"?`;
  actionMenuView.hidden = true;
  actionConfirmView.hidden = false;
});

actionConfirmDeleteBtn.addEventListener("click", async () => {
  if (!actionTarget) return;
  const { project, cardEl } = actionTarget;

  if (isConfigured) {
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) {
      console.error("Failed to delete project:", error);
      alert("Could not delete project.");
      return;
    }
  } else {
    demoStore.deleteProject(project.id);
  }

  cardEl.remove();
  closeActionModal();
});

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function iconBadgeMarkup(project) {
  const color = escapeHtml(project.color || DEFAULT_COLOR);
  // Legacy or explicitly-emoji rows (no icon_type) still render as text so
  // nothing created before the icon picker existed changes appearance.
  const inner =
    project.icon_type === "lucide"
      ? iconMarkup(isKnownIcon(project.icon) ? project.icon : DEFAULT_ICON)
      : escapeHtml(project.icon || "📁");
  return `<div class="icon-badge" data-color="${color}">${inner}</div>`;
}

function projectCardEl(project) {
  const link = document.createElement("a");
  link.className = "project-card";
  link.href = `project.html?id=${encodeURIComponent(project.id)}`;
  link.dataset.color = project.color || DEFAULT_COLOR;
  link.innerHTML = `
    ${iconBadgeMarkup(project)}
    <div class="project-info">
      <div class="project-name">${escapeHtml(project.name)}</div>
      ${project.status ? `<div class="project-context">${escapeHtml(project.status)}</div>` : ""}
    </div>
    <div class="project-arrow">›</div>
  `;
  attachLongPress(link, project);
  return link;
}

async function fetchAllProjects(userId) {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Failed to load projects:", error);
      return [];
    }
    return data;
  }
  return demoStore.listProjects();
}

async function loadProjects(userId) {
  const all = await fetchAllProjects(userId);
  const data = all.filter((project) => project.workspace_type !== "routine");

  gridEl.querySelectorAll(".project-card:not(.add-project-card)").forEach((el) => el.remove());
  for (const project of data) {
    gridEl.insertBefore(projectCardEl(project), addCard);
  }
}

function openModal() {
  modal.classList.add("open");
  nameInput.focus();
}

function closeModal() {
  modal.classList.remove("open");
  addForm.reset();
  colorPicker.set(DEFAULT_COLOR);
  iconPicker.set(DEFAULT_ICON);
}

addCard.addEventListener("click", openModal);
cancelBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  if (!name) return;

  const icon = iconPicker.get();
  const status = statusInput.value.trim() || null;
  const color = colorPicker.get();

  let data;
  if (isConfigured) {
    const { data: inserted, error } = await supabase
      .from("projects")
      .insert({ user_id: currentUserId, name, icon, icon_type: "lucide", status, color })
      .select()
      .single();

    if (error) {
      console.error("Failed to add project:", error);
      alert("Could not add project. Please try again.");
      return;
    }
    data = inserted;
  } else {
    data = demoStore.addProject({ name, icon, icon_type: "lucide", status, color });
  }

  gridEl.insertBefore(projectCardEl(data), addCard);
  closeModal();
});

(async function init() {
  if (!isConfigured) {
    await loadProjects(null);
    return;
  }

  const session = await requireSession();
  if (!session) return;

  currentUserId = session.user.id;
  await loadProjects(currentUserId);
})();
