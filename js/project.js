import { supabase } from "./supabaseClient.js";
import { requireSession } from "./auth.js";

const params = new URLSearchParams(window.location.search);
const projectId = params.get("id");

const iconEl = document.getElementById("project-icon-display");
const nameEl = document.getElementById("project-name-display");
const statusEl = document.getElementById("project-status-display");

const editBtn = document.getElementById("edit-project-btn");
const deleteBtn = document.getElementById("delete-project-btn");

const modal = document.getElementById("edit-project-modal");
const editForm = document.getElementById("edit-project-form");
const editName = document.getElementById("edit-name");
const editIcon = document.getElementById("edit-icon");
const editStatus = document.getElementById("edit-status");
const cancelBtn = document.getElementById("cancel-edit");

let currentProject = null;

function render(project) {
  iconEl.textContent = project.icon || "📁";
  nameEl.textContent = project.name;
  statusEl.textContent = project.description || project.status || "";
}

async function loadProject() {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error || !data) {
    console.error("Failed to load project:", error);
    window.location.href = "index.html";
    return;
  }

  currentProject = data;
  render(data);
}

function openEditModal() {
  editName.value = currentProject.name || "";
  editIcon.value = currentProject.icon || "";
  editStatus.value = currentProject.status || "";
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

  const { data, error } = await supabase
    .from("projects")
    .update({
      name,
      icon: editIcon.value.trim() || null,
      status: editStatus.value.trim() || null,
    })
    .eq("id", projectId)
    .select()
    .single();

  if (error) {
    console.error("Failed to update project:", error);
    alert("Could not save changes.");
    return;
  }

  currentProject = data;
  render(data);
  closeEditModal();
});

deleteBtn.addEventListener("click", async () => {
  if (!confirm(`Delete "${currentProject.name}"? This cannot be undone.`)) return;

  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) {
    console.error("Failed to delete project:", error);
    alert("Could not delete project.");
    return;
  }

  window.location.href = "index.html";
});

(async function init() {
  const session = await requireSession();
  if (!session) return;

  if (!projectId) {
    window.location.href = "index.html";
    return;
  }

  await loadProject();
})();
