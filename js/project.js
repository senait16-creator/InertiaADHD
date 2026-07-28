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

const editBtn = document.getElementById("edit-project-btn");
const deleteBtn = document.getElementById("delete-project-btn");

const modal = document.getElementById("edit-project-modal");
const editForm = document.getElementById("edit-project-form");
const editName = document.getElementById("edit-name");
const editStatus = document.getElementById("edit-status");
const cancelBtn = document.getElementById("cancel-edit");
const colorPicker = initColorPicker(document.getElementById("edit-color-picker"));
const iconPicker = initIconPicker(document.getElementById("edit-icon-picker"));

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
}

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

editBtn.addEventListener("click", openEditModal);
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

deleteBtn.addEventListener("click", async () => {
  if (!confirm(`Delete "${currentProject.name}"? This cannot be undone.`)) return;

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
