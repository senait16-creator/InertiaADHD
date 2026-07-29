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

export function addProject({ name, icon, icon_type, status, color }) {
  const projects = readAll();
  const project = {
    id: makeId(),
    name,
    icon: icon || null,
    icon_type: icon_type || null,
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

export function updateProject(id, { name, icon, icon_type, status, color }) {
  const projects = readAll();
  const project = projects.find((item) => item.id === id);
  if (!project) return null;
  project.name = name;
  project.icon = icon || null;
  project.icon_type = icon_type || null;
  project.status = status || null;
  project.color = color || "sage";
  writeAll(projects);
  return project;
}

export function deleteProject(id) {
  writeAll(readAll().filter((project) => project.id !== id));
}

// Separate from updateProject (which overwrites name/icon/color together
// from the Edit Project form) — this only ever touches state, driven by
// tapping the Status pill on a project's page.
export function setProjectState(id, state) {
  const projects = readAll();
  const project = projects.find((item) => item.id === id);
  if (!project) return null;
  project.state = state;
  writeAll(projects);
  return project;
}

export function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------- Routine steps (see js/routineBoard.js) ----------------

const STEPS_KEY = "inertiaadhd_demo_routine_steps";

function readAllSteps() {
  try {
    const raw = localStorage.getItem(STEPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAllSteps(steps) {
  localStorage.setItem(STEPS_KEY, JSON.stringify(steps));
}

export function listSteps(projectId) {
  return readAllSteps()
    .filter((step) => step.project_id === projectId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function reorderSteps(projectId, orderedIds) {
  const steps = readAllSteps();
  orderedIds.forEach((id, index) => {
    const step = steps.find((s) => s.id === id && s.project_id === projectId);
    if (step) step.sort_order = index;
  });
  writeAllSteps(steps);
}

export function setActiveStep(projectId, id) {
  const steps = readAllSteps();
  const target = steps.find((s) => s.id === id && s.project_id === projectId);
  const turningOn = target ? !target.active : false;
  for (const step of steps) {
    if (step.project_id === projectId) step.active = false;
  }
  if (target) target.active = turningOn;
  writeAllSteps(steps);
  return turningOn;
}

export function setStepStatus(id, status) {
  const steps = readAllSteps();
  const step = steps.find((s) => s.id === id);
  if (!step) return null;
  step.status = status;
  step.updated_at = new Date().toISOString();
  if (status) step.active = false;
  writeAllSteps(steps);
  return step;
}

// ---------------- Maintenance items (see js/category.js) ----------------

const MAINTENANCE_KEY = "inertiaadhd_demo_maintenance_items";

function readAllMaintenance() {
  try {
    const raw = localStorage.getItem(MAINTENANCE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAllMaintenance(items) {
  localStorage.setItem(MAINTENANCE_KEY, JSON.stringify(items));
}

export function listMaintenanceItems(category) {
  return readAllMaintenance()
    .filter((item) => item.category === category)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function addMaintenanceItem({ category, section, title, body, url }) {
  const items = readAllMaintenance();
  const sectionCount = items.filter(
    (item) => item.category === category && item.section === section
  ).length;
  const item = {
    id: makeId(),
    category,
    section,
    title,
    body: body || null,
    url: url || null,
    sort_order: sectionCount,
    created_at: new Date().toISOString(),
  };
  items.push(item);
  writeAllMaintenance(items);
  return item;
}

export function updateMaintenanceItem(id, { title, body, url }) {
  const items = readAllMaintenance();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  item.title = title;
  item.body = body || null;
  item.url = url || null;
  writeAllMaintenance(items);
  return item;
}

export function deleteMaintenanceItem(id) {
  writeAllMaintenance(readAllMaintenance().filter((item) => item.id !== id));
}

export function reorderMaintenanceItems(category, section, orderedIds) {
  const items = readAllMaintenance();
  orderedIds.forEach((id, index) => {
    const item = items.find(
      (i) => i.id === id && i.category === category && i.section === section
    );
    if (item) item.sort_order = index;
  });
  writeAllMaintenance(items);
}

// ---------------- Navigation-hub items (see js/navBoard.js) ----------------
// No in-app creation flow yet (seeded via SQL against the real project),
// so this is read-only parity — a demo-mode project never actually gets
// workspace_type 'nav' set, same as 'routine' above.

const NAV_ITEMS_KEY = "inertiaadhd_demo_nav_items";

function readAllNavItems() {
  try {
    const raw = localStorage.getItem(NAV_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function listNavItems(projectId) {
  return readAllNavItems()
    .filter((item) => item.project_id === projectId)
    .sort((a, b) => a.sort_order - b.sort_order);
}
