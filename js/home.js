// Home screen — five entry panels, with a time-of-day featured routine
// (morning/night) instead of everything shown with equal weight. See
// README for the information architecture this replaced.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { DEFAULT_COLOR } from "./colors.js";
import { iconMarkup } from "./lucideIcons.js";

const greetingEl = document.getElementById("greeting");
const subtitleEl = document.getElementById("home-subtitle");
const demoBanner = document.getElementById("demo-banner");
const migrationNotice = document.getElementById("migration-notice");
const contentEl = document.getElementById("home-content");

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Morning/night get a featured routine because there's an unambiguous
// answer; the hours between don't get a guessed-at "default" panel.
function timeState() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 20 || hour < 5) return "night";
  return "neutral";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

const PANELS = [
  { href: "routines.html", icon: "repeat", color: "sage", label: "Routines" },
  { href: "maintenance.html", icon: "sparkles", color: "lavender", label: "Maintenance" },
  { href: "projects.html", icon: "layout-grid", color: "blue", label: "Projects" },
  { href: "vision.html", icon: "compass", color: "amber", label: "2026 Vision" },
];
const REMINDERS_PANEL = { href: "reminders.html", icon: "bell", color: "sage", label: "Reminders" };

function panelCardHtml(p) {
  return `
    <a class="panel-card" href="${p.href}">
      <div class="icon-badge" data-color="${p.color}">${iconMarkup(p.icon)}</div>
      <div class="panel-label">${p.label}</div>
    </a>
  `;
}

function panelBarHtml(p, extraClass = "") {
  return `
    <a class="panel-bar ${extraClass}" href="${p.href}">
      <div class="icon-badge" data-color="${p.color}">${iconMarkup(p.icon)}</div>
      <div class="panel-label">${p.label}</div>
      <span class="bar-arrow">›</span>
    </a>
  `;
}

function renderNeutral() {
  subtitleEl.textContent = "Where do you want to go?";
  contentEl.innerHTML = `
    <div class="panel-grid">${PANELS.map(panelCardHtml).join("")}</div>
    ${panelBarHtml(REMINDERS_PANEL)}
  `;
}

function renderFeatured(routineProject, isMorning) {
  subtitleEl.textContent = isMorning ? "Time for your morning routine." : "Time to wind down.";
  contentEl.innerHTML = `
    <a class="hero-card" href="project.html?id=${encodeURIComponent(routineProject.id)}">
      <div class="icon-badge" data-color="${isMorning ? "amber" : "lavender"}">${iconMarkup(isMorning ? "sunrise" : "moon-star")}</div>
      <div class="hero-text">
        <div class="hero-eyebrow">Right now</div>
        <div class="panel-label">${escapeHtml(routineProject.name)}</div>
      </div>
      <span class="bar-arrow">›</span>
    </a>
    <div class="panel-bar-list">
      ${PANELS.map((p) => panelBarHtml(p)).join("")}
      ${panelBarHtml(REMINDERS_PANEL, "is-reminders")}
    </div>
  `;
}

async function fetchRoutineProjects(userId) {
  const all = isConfigured
    ? await (async () => {
        const { data, error } = await supabase.from("projects").select("*").eq("user_id", userId);
        if (error) {
          console.error("Failed to load routines:", error);
          return [];
        }
        return data;
      })()
    : demoStore.listProjects();
  return all.filter((p) => p.workspace_type === "routine");
}

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
    icon_type: project.icon_type || null,
    status: project.status,
    color: project.color || DEFAULT_COLOR,
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
    renderNeutral();
    return;
  }

  const session = await requireSession();
  if (!session) return;

  const userId = session.user.id;
  greetingEl.textContent = `${greetingForNow()}, Senait`;

  await migrateDemoProjects(userId);

  const state = timeState();
  if (state === "neutral") {
    renderNeutral();
    return;
  }

  const routineProjects = await fetchRoutineProjects(userId);
  const target = routineProjects.find(
    (p) => p.name === (state === "morning" ? "Morning Routine" : "Night Routine")
  );

  if (!target) {
    renderNeutral();
    return;
  }

  renderFeatured(target, state === "morning");
})();
