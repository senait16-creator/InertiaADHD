// Home screen — five entry panels. No subtitle: the layout itself (which
// panel a tap lands on) is meant to communicate what's relevant, not a
// line of text explaining it.
//
// The first panel is dynamic instead of a static "Routines" link: in the
// morning it becomes a direct "Morning" shortcut into the Morning Routine
// board, at night a "Night" shortcut into Night Routine — skipping the
// Routines list for the two routines used constantly. Midday, or if the
// relevant routine doesn't exist yet, it falls back to a generic
// "Routines" card pointing at the full list.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { DEFAULT_COLOR } from "./colors.js";
import { iconMarkup } from "./lucideIcons.js";

const greetingEl = document.getElementById("greeting");
const demoBanner = document.getElementById("demo-banner");
const migrationNotice = document.getElementById("migration-notice");
const contentEl = document.getElementById("home-content");

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Morning/night get a direct shortcut because there's an unambiguous
// answer; the hours between fall back to the plain Routines list rather
// than guessing at a "default" routine.
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

const ROUTINES_FALLBACK = { href: "routines.html", icon: "repeat-2", color: "sage", label: "Routines" };
const OTHER_PANELS = [
  { href: "maintenance.html", icon: "sparkles", color: "lavender", label: "Maintenance" },
  { href: "projects.html", icon: "layout-grid", color: "blue", label: "Projects 2026" },
  { href: "vision.html", icon: "compass", color: "amber", label: "2026 Vision" },
];
const REMINDERS_PANEL = { href: "reminders.html", icon: "bell", color: "sage", label: "Reminders" };

function panelCardHtml(p) {
  return `
    <a class="panel-card" href="${p.href}">
      <div class="icon-badge" data-color="${p.color}">${iconMarkup(p.icon)}</div>
      <div class="panel-label">${escapeHtml(p.label)}</div>
    </a>
  `;
}

function panelBarHtml(p) {
  return `
    <a class="panel-bar" href="${p.href}">
      <div class="icon-badge" data-color="${p.color}">${iconMarkup(p.icon)}</div>
      <div class="panel-label">${escapeHtml(p.label)}</div>
      <span class="bar-arrow">›</span>
    </a>
  `;
}

function renderHome(routinesPanel) {
  contentEl.innerHTML = `
    <div class="panel-grid">${[routinesPanel, ...OTHER_PANELS].map(panelCardHtml).join("")}</div>
    ${panelBarHtml(REMINDERS_PANEL)}
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

async function resolveRoutinesPanel(userId, state) {
  if (state === "neutral") return ROUTINES_FALLBACK;

  const routineProjects = await fetchRoutineProjects(userId);
  const targetName = state === "morning" ? "Morning Routine" : "Night Routine";
  const target = routineProjects.find((p) => p.name === targetName);
  if (!target) return ROUTINES_FALLBACK;

  return {
    href: `project.html?id=${encodeURIComponent(target.id)}`,
    icon: state === "morning" ? "sunrise" : "moon-star",
    color: state === "morning" ? "amber" : "lavender",
    label: state === "morning" ? "Morning" : "Night",
  };
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
    renderHome(ROUTINES_FALLBACK);
    return;
  }

  const session = await requireSession();
  if (!session) return;

  const userId = session.user.id;
  greetingEl.textContent = `${greetingForNow()}, Senait`;

  await migrateDemoProjects(userId);

  const routinesPanel = await resolveRoutinesPanel(userId, timeState());
  renderHome(routinesPanel);
})();
