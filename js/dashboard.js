import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";

const greetingEl = document.getElementById("greeting");
const gridEl = document.getElementById("project-grid");
const addCard = document.getElementById("add-project-card");
const demoBanner = document.getElementById("demo-banner");
const migrationNotice = document.getElementById("migration-notice");

const modal = document.getElementById("add-project-modal");
const addForm = document.getElementById("add-project-form");
const nameInput = document.getElementById("project-name");
const iconInput = document.getElementById("project-icon");
const statusInput = document.getElementById("project-status");
const cancelBtn = document.getElementById("cancel-add");

let currentUserId = null;

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function projectCardEl(project) {
  const link = document.createElement("a");
  link.className = "project-card";
  link.href = `project.html?id=${encodeURIComponent(project.id)}`;
  link.innerHTML = `
    <div class="project-icon">${escapeHtml(project.icon || "📁")}</div>
    <div class="project-info">
      <div class="project-name">${escapeHtml(project.name)}</div>
      ${project.status ? `<div class="project-status">${escapeHtml(project.status)}</div>` : ""}
    </div>
    <div class="project-arrow">›</div>
  `;
  return link;
}

async function loadProjects(userId) {
  const data = isConfigured
    ? await (async () => {
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
      })()
    : demoStore.listProjects();

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

  const icon = iconInput.value.trim() || null;
  const status = statusInput.value.trim() || null;

  let data;
  if (isConfigured) {
    const { data: inserted, error } = await supabase
      .from("projects")
      .insert({ user_id: currentUserId, name, icon, status })
      .select()
      .single();

    if (error) {
      console.error("Failed to add project:", error);
      alert("Could not add project. Please try again.");
      return;
    }
    data = inserted;
  } else {
    data = demoStore.addProject({ name, icon, status });
  }

  gridEl.insertBefore(projectCardEl(data), addCard);
  closeModal();
});

// One-time: if this browser has projects saved locally from preview mode
// (see js/demoStore.js), copy them into the signed-in account so nothing
// created before Supabase was configured gets lost. Leaves local data
// untouched on failure so it's retried on the next load.
async function migrateDemoProjects(userId) {
  const demoProjects = demoStore.listProjects();
  if (demoProjects.length === 0) return;

  const rows = demoProjects.map((project) => ({
    user_id: userId,
    name: project.name,
    icon: project.icon,
    status: project.status,
    sort_order: project.sort_order,
  }));

  const { error } = await supabase.from("projects").insert(rows);
  if (error) {
    console.error("Failed to migrate preview projects:", error);
    return;
  }

  demoStore.clearAll();
  migrationNotice.textContent = `Imported ${demoProjects.length} project${
    demoProjects.length === 1 ? "" : "s"
  } from your preview.`;
  migrationNotice.hidden = false;
}

(async function init() {
  if (!isConfigured) {
    demoBanner.hidden = false;
    greetingEl.textContent = `${greetingForNow()}, Senait`;
    await loadProjects(null);
    return;
  }

  const session = await requireSession();
  if (!session) return;

  currentUserId = session.user.id;
  greetingEl.textContent = `${greetingForNow()}, Senait`;

  await migrateDemoProjects(currentUserId);
  await loadProjects(currentUserId);
})();
