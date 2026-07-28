// Local preview data store, used only when Supabase isn't configured yet
// (see isConfigured in supabaseClient.js). Lets the interface be reviewed
// on a real device before any backend credentials exist. Projects are kept
// in this browser's localStorage only — nothing is shared or synced.
const STORAGE_KEY = "inertiaadhd_demo_projects";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function makeId() {
  return `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function listProjects() {
  return readAll().sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
  );
}

export function getProject(id) {
  return readAll().find((project) => project.id === id) || null;
}

export function addProject({ name, icon, status, color }) {
  const projects = readAll();
  const project = {
    id: makeId(),
    name,
    icon: icon || null,
    status: status || null,
    description: null,
    color: color || "sage",
    sort_order: projects.length,
    created_at: new Date().toISOString(),
  };
  projects.push(project);
  writeAll(projects);
  return project;
}

export function updateProject(id, { name, icon, status, color }) {
  const projects = readAll();
  const project = projects.find((item) => item.id === id);
  if (!project) return null;
  project.name = name;
  project.icon = icon || null;
  project.status = status || null;
  project.color = color || "sage";
  writeAll(projects);
  return project;
}

export function deleteProject(id) {
  writeAll(readAll().filter((project) => project.id !== id));
}

export function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
}
