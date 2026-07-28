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

let currentUserId = null;

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
  link.innerHTML = `
    ${iconBadgeMarkup(project)}
    <div class="project-info">
      <div class="project-name">${escapeHtml(project.name)}</div>
      ${project.status ? `<div class="project-context">${escapeHtml(project.status)}</div>` : ""}
    </div>
    <div class="project-arrow">›</div>
  `;
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
