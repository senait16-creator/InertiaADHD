import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { DEFAULT_COLOR, initColorPicker } from "./colors.js";
import { DEFAULT_ICON, iconMarkup, initIconPicker, isKnownIcon } from "./lucideIcons.js";
import { initRoutineBoard } from "./routineBoard.js";
import { initNavBoard } from "./navBoard.js";

const params = new URLSearchParams(window.location.search);
const projectId = params.get("id");

const iconEl = document.getElementById("project-icon-display");
const nameEl = document.getElementById("project-name-display");
const statusEl = document.getElementById("project-status-display");
const bodyEl = document.getElementById("project-body");
const routineMountEl = document.getElementById("routine-board-mount");
const navMountEl = document.getElementById("nav-board-mount");
const backLinkEl = document.getElementById("back-link");

const overflowBtn = document.getElementById("overflow-btn");
const actionModal = document.getElementById("project-action-modal");
const actionMenuView = document.getElementById("action-menu-view");
const actionConfirmView = document.getElementById("action-confirm-view");
const actionMenuTitle = document.getElementById("action-menu-title");
const actionEditBtn = document.getElementById("action-edit-btn");
const actionDeleteBtn = document.getElementById("action-delete-btn");
const actionCancelBtn1 = document.getElementById("action-cancel-btn-1");
const actionCancelBtn2 = document.getElementById("action-cancel-btn-2");
const confirmText = document.getElementById("confirm-text");
const actionConfirmDeleteBtn = document.getElementById("action-confirm-delete-btn");

const modal = document.getElementById("edit-project-modal");
const editForm = document.getElementById("edit-project-form");
const editName = document.getElementById("edit-name");
const editStatus = document.getElementById("edit-status");
const cancelBtn = document.getElementById("cancel-edit");
const colorPicker = initColorPicker(document.getElementById("edit-color-picker"));
const iconPicker = initIconPicker(document.getElementById("edit-icon-picker"));

const statusPillEl = document.getElementById("status-pill");
const statusPillLabelEl = document.getElementById("status-pill-label");

// The project's own lifecycle status — separate from whichever section
// is inside it. Tapping the pill cycles through these, wrapping around.
const PROJECT_STATES = [
  { key: "planned", label: "Planned" },
  { key: "active", label: "Active" },
  { key: "waiting", label: "Waiting" },
  { key: "complete", label: "Complete" },
];

let currentProject = null;

function render(project) {
  // Legacy or explicitly-emoji rows (no icon_type) still render as text so
  // nothing created before the icon picker existed changes appearance.
  if (project.icon_type === "lucide") {
    iconEl.innerHTML = iconMarkup(isKnownIcon(project.icon) ? project.icon : DEFAULT_ICON);
  } else {
    iconEl.textContent = project.icon || "📁";
  }
  iconEl.dataset.color = project.color || DEFAULT_COLOR;
  nameEl.textContent = project.name;
  statusEl.textContent = project.description || project.status || "";
  renderStatusPill(project);
}

function renderStatusPill(project) {
  const info =
    PROJECT_STATES.find((s) => s.key === project.state) || PROJECT_STATES[0];
  statusPillEl.dataset.state = info.key;
  statusPillLabelEl.textContent = info.label;
}

async function persistState(state) {
  if (!isConfigured) return demoStore.setProjectState(projectId, state);
  const { data, error } = await supabase
    .from("projects")
    .update({ state })
    .eq("id", projectId)
    .select()
    .single();
  if (error) {
    console.error("Failed to save project status:", error);
    return null;
  }
  return data;
}

statusPillEl.addEventListener("click", async () => {
  const currentIndex = PROJECT_STATES.findIndex(
    (s) => s.key === (currentProject.state || "planned")
  );
  const next = PROJECT_STATES[(currentIndex + 1) % PROJECT_STATES.length];
  currentProject.state = next.key;
  renderStatusPill(currentProject);
  await persistState(next.key);
});

async function loadProject() {
  const data = isConfigured
    ? await (async () => {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();
        if (error) console.error("Failed to load project:", error);
        return data;
      })()
    : demoStore.getProject(projectId);

  if (!data) {
    window.location.href = "index.html";
    return;
  }

  currentProject = data;
  render(data);
  backLinkEl.href = data.workspace_type === "routine" ? "routines.html" : "projects.html";

  if (data.workspace_type === "routine") {
    bodyEl.hidden = true;
    routineMountEl.hidden = false;
    await initRoutineBoard(routineMountEl, data);
  } else if (data.workspace_type === "nav") {
    bodyEl.hidden = true;
    navMountEl.hidden = false;
    await initNavBoard(navMountEl, data);
  }
}

function openEditModal() {
  editName.value = currentProject.name || "";
  editStatus.value = currentProject.status || "";
  colorPicker.set(currentProject.color || DEFAULT_COLOR);
  iconPicker.set(currentProject.icon_type === "lucide" ? currentProject.icon : DEFAULT_ICON);
  modal.classList.add("open");
}

function closeEditModal() {
  modal.classList.remove("open");
}

cancelBtn.addEventListener("click", closeEditModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeEditModal();
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = editName.value.trim();
  if (!name) return;

  const icon = iconPicker.get();
  const status = editStatus.value.trim() || null;
  const color = colorPicker.get();

  let data;
  if (isConfigured) {
    const { data: updated, error } = await supabase
      .from("projects")
      .update({ name, icon, icon_type: "lucide", status, color })
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      console.error("Failed to update project:", error);
      alert("Could not save changes.");
      return;
    }
    data = updated;
  } else {
    data = demoStore.updateProject(projectId, { name, icon, icon_type: "lucide", status, color });
  }

  currentProject = data;
  render(data);
  closeEditModal();
});

// Overflow menu (⋯): Edit/Delete live here instead of always-visible
// buttons, so the page itself is just about the workspace, not managing
// the project.
function openActionMenu() {
  actionMenuTitle.textContent = currentProject.name;
  actionMenuView.hidden = false;
  actionConfirmView.hidden = true;
  actionModal.classList.add("open");
}

function closeActionModal() {
  actionModal.classList.remove("open");
}

overflowBtn.addEventListener("click", openActionMenu);
actionCancelBtn1.addEventListener("click", closeActionModal);
actionCancelBtn2.addEventListener("click", closeActionModal);
actionModal.addEventListener("click", (event) => {
  if (event.target === actionModal) closeActionModal();
});

actionEditBtn.addEventListener("click", () => {
  closeActionModal();
  openEditModal();
});

actionDeleteBtn.addEventListener("click", () => {
  confirmText.textContent = `Delete "${currentProject.name}"?`;
  actionMenuView.hidden = true;
  actionConfirmView.hidden = false;
});

actionConfirmDeleteBtn.addEventListener("click", async () => {
  if (isConfigured) {
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) {
      console.error("Failed to delete project:", error);
      alert("Could not delete project.");
      return;
    }
  } else {
    demoStore.deleteProject(projectId);
  }

  window.location.href = backLinkEl.href;
});

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
  }

  if (!projectId) {
    window.location.href = "index.html";
    return;
  }

  await loadProject();
})();
