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

// Every step across every routine project — used by js/insights.js
// (reports across all routines at once) and by fetchOpenContinuations
// in js/routineBoard.js (a continuation card can live in a different
// project than the phased step it continues).
export function listAllSteps() {
  return readAllSteps();
}

// Creates a continuation card (see continuation_of in supabase/schema.sql)
// — the only in-app way a routine step gets created; every other step
// still comes from a SQL seed.
export function addStep(fields) {
  const steps = readAllSteps();
  const step = {
    id: makeId(),
    active: false,
    status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  steps.push(step);
  writeAllSteps(steps);
  return step;
}

export function deleteStep(id) {
  writeAllSteps(readAllSteps().filter((s) => s.id !== id));
}

export function reorderSteps(projectId, orderedIds) {
  const steps = readAllSteps();
  orderedIds.forEach((id, index) => {
    const step = steps.find((s) => s.id === id && s.project_id === projectId);
    if (step) step.sort_order = index;
  });
  writeAllSteps(steps);
}

// Marks a step "Ready" (up next). Not exclusive — several steps can be
// Ready at once, so this only ever touches the one step, not its siblings.
export function setActiveStep(id) {
  const steps = readAllSteps();
  const step = steps.find((s) => s.id === id);
  if (!step) return null;
  step.active = true;
  writeAllSteps(steps);
  return step;
}

export function setStepStatus(id, updates) {
  const steps = readAllSteps();
  const step = steps.find((s) => s.id === id);
  if (!step) return null;
  Object.assign(step, updates);
  step.updated_at = new Date().toISOString();
  if (updates.status) step.active = false;
  writeAllSteps(steps);
  return step;
}

// Saves the "Edit Routine Item" modal's fields (duration tracking,
// subtitle) in one go.
export function setStepEdits(id, updates) {
  const steps = readAllSteps();
  const step = steps.find((s) => s.id === id);
  if (!step) return null;
  Object.assign(step, updates);
  writeAllSteps(steps);
  return step;
}

// ---------------- Routine completions (see js/insights.js) ----------------
// A permanent log of every time a step was tapped complete — unlike
// routine_steps itself (today's live state, reset daily), this never
// resets, so the Insights page has history to read.

const COMPLETIONS_KEY = "inertiaadhd_demo_routine_completions";

function readAllCompletions() {
  try {
    const raw = localStorage.getItem(COMPLETIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAllCompletions(rows) {
  localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(rows));
}

export function addRoutineCompletion(entry) {
  const rows = readAllCompletions();
  rows.push({ id: makeId(), created_at: new Date().toISOString(), ...entry });
  writeAllCompletions(rows);
}

export function listRoutineCompletions() {
  return readAllCompletions();
}

// ---------------- Routine skips (see js/insights.js) ----------------
// A permanent log of every time a step was marked "Not Today" — same
// shape/purpose as routine completions above, just for the opposite event.

const SKIPS_KEY = "inertiaadhd_demo_routine_skips";

function readAllSkips() {
  try {
    const raw = localStorage.getItem(SKIPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAllSkips(rows) {
  localStorage.setItem(SKIPS_KEY, JSON.stringify(rows));
}

export function addRoutineSkip(entry) {
  const rows = readAllSkips();
  rows.push({ id: makeId(), created_at: new Date().toISOString(), ...entry });
  writeAllSkips(rows);
}

export function listRoutineSkips() {
  return readAllSkips();
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
// so this is mostly read-only parity — a demo-mode project never actually
// gets workspace_type 'nav' set, same as 'routine' above. setNavItemStatus
// exists because a 'status' kind panel's tap-to-cycle needs somewhere to
// persist to even in preview mode.

const NAV_ITEMS_KEY = "inertiaadhd_demo_nav_items";

function readAllNavItems() {
  try {
    const raw = localStorage.getItem(NAV_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAllNavItems(items) {
  localStorage.setItem(NAV_ITEMS_KEY, JSON.stringify(items));
}

export function listNavItems(projectId) {
  return readAllNavItems()
    .filter((item) => item.project_id === projectId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function setNavItemStatus(id, status) {
  const items = readAllNavItems();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  item.status = status;
  writeAllNavItems(items);
  return item;
}

// ---------------- Relationships (see relationships.html/js/person.js) ----------------

const RELATIONSHIPS_KEY = "inertiaadhd_demo_relationships";

function readAllRelationships() {
  try {
    const raw = localStorage.getItem(RELATIONSHIPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAllRelationships(people) {
  localStorage.setItem(RELATIONSHIPS_KEY, JSON.stringify(people));
}

export function listRelationships() {
  return readAllRelationships().sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
  );
}

export function getRelationship(id) {
  return readAllRelationships().find((p) => p.id === id) || null;
}

export function addRelationship(fields) {
  const people = readAllRelationships();
  const person = {
    id: makeId(),
    name: fields.name,
    circle: fields.circle || null,
    season: fields.season || [],
    investment_intention: fields.investment_intention || null,
    feelings: fields.feelings || [],
    last_connection_at: fields.last_connection_at || null,
    intention: fields.intention || null,
    notes: fields.notes || null,
    sort_order: people.length,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  people.push(person);
  writeAllRelationships(people);
  return person;
}

export function updateRelationship(id, fields) {
  const people = readAllRelationships();
  const person = people.find((p) => p.id === id);
  if (!person) return null;
  Object.assign(person, fields);
  person.updated_at = new Date().toISOString();
  writeAllRelationships(people);
  return person;
}

export function deleteRelationship(id) {
  writeAllRelationships(readAllRelationships().filter((p) => p.id !== id));
}

// ---------------- Routine step videos (see js/routineBoard.js) ----------------
// Video cards for a 'video_panel' kind step — first used for Stretch.

const STEP_VIDEOS_KEY = "inertiaadhd_demo_step_videos";

function readAllStepVideos() {
  try {
    const raw = localStorage.getItem(STEP_VIDEOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAllStepVideos(videos) {
  localStorage.setItem(STEP_VIDEOS_KEY, JSON.stringify(videos));
}

export function listStepVideos(stepId) {
  return readAllStepVideos()
    .filter((v) => v.step_id === stepId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function addStepVideo(fields) {
  const videos = readAllStepVideos();
  const video = {
    id: makeId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  videos.push(video);
  writeAllStepVideos(videos);
  return video;
}

export function updateStepVideo(id, fields) {
  const videos = readAllStepVideos();
  const video = videos.find((v) => v.id === id);
  if (!video) return null;
  Object.assign(video, fields);
  video.updated_at = new Date().toISOString();
  writeAllStepVideos(videos);
  return video;
}

export function deleteStepVideo(id) {
  writeAllStepVideos(readAllStepVideos().filter((v) => v.id !== id));
}

// ==================== Hair (see js/hair.js and friends) ====================

// ---------------- Hair routine steps ----------------

const HAIR_ROUTINE_KEY = "inertiaadhd_demo_hair_routine";

function readHairRoutine() {
  try {
    const raw = localStorage.getItem(HAIR_ROUTINE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHairRoutine(steps) {
  localStorage.setItem(HAIR_ROUTINE_KEY, JSON.stringify(steps));
}

export function listHairRoutineSteps() {
  return readHairRoutine().sort((a, b) => a.sort_order - b.sort_order);
}

export function addHairRoutineStep(name) {
  const steps = readHairRoutine();
  const step = {
    id: makeId(),
    name,
    sort_order: steps.length,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  steps.push(step);
  writeHairRoutine(steps);
  return step;
}

export function updateHairRoutineStep(id, name) {
  const steps = readHairRoutine();
  const step = steps.find((s) => s.id === id);
  if (!step) return null;
  step.name = name;
  step.updated_at = new Date().toISOString();
  writeHairRoutine(steps);
  return step;
}

export function deleteHairRoutineStep(id) {
  writeHairRoutine(readHairRoutine().filter((s) => s.id !== id));
}

export function reorderHairRoutineSteps(orderedIds) {
  const steps = readHairRoutine();
  orderedIds.forEach((id, index) => {
    const step = steps.find((s) => s.id === id);
    if (step) step.sort_order = index;
  });
  writeHairRoutine(steps);
}

// ---------------- Hair products ----------------

const HAIR_PRODUCTS_KEY = "inertiaadhd_demo_hair_products";

function readHairProducts() {
  try {
    const raw = localStorage.getItem(HAIR_PRODUCTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHairProducts(products) {
  localStorage.setItem(HAIR_PRODUCTS_KEY, JSON.stringify(products));
}

export function listHairProducts() {
  return readHairProducts().sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getHairProduct(id) {
  return readHairProducts().find((p) => p.id === id) || null;
}

export function addHairProduct(fields) {
  const products = readHairProducts();
  const product = {
    id: makeId(),
    favorite: false,
    repurchase: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  products.push(product);
  writeHairProducts(products);
  return product;
}

export function updateHairProduct(id, fields) {
  const products = readHairProducts();
  const product = products.find((p) => p.id === id);
  if (!product) return null;
  Object.assign(product, fields);
  product.updated_at = new Date().toISOString();
  writeHairProducts(products);
  return product;
}

export function deleteHairProduct(id) {
  writeHairProducts(readHairProducts().filter((p) => p.id !== id));
}

// ---------------- Hair wash log ----------------

const HAIR_WASH_LOG_KEY = "inertiaadhd_demo_hair_wash_log";

function readHairWashLog() {
  try {
    const raw = localStorage.getItem(HAIR_WASH_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHairWashLog(rows) {
  localStorage.setItem(HAIR_WASH_LOG_KEY, JSON.stringify(rows));
}

export function listHairWashLog() {
  return readHairWashLog().sort((a, b) => b.wash_date.localeCompare(a.wash_date));
}

export function addHairWashLogEntry(fields) {
  const rows = readHairWashLog();
  const entry = {
    id: makeId(),
    product_ids: [],
    experiment_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  rows.push(entry);
  writeHairWashLog(rows);
  return entry;
}

export function updateHairWashLogEntry(id, fields) {
  const rows = readHairWashLog();
  const entry = rows.find((r) => r.id === id);
  if (!entry) return null;
  Object.assign(entry, fields);
  entry.updated_at = new Date().toISOString();
  writeHairWashLog(rows);
  return entry;
}

// ---------------- Hair experiments ----------------

const HAIR_EXPERIMENTS_KEY = "inertiaadhd_demo_hair_experiments";

function readHairExperiments() {
  try {
    const raw = localStorage.getItem(HAIR_EXPERIMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHairExperiments(rows) {
  localStorage.setItem(HAIR_EXPERIMENTS_KEY, JSON.stringify(rows));
}

export function listHairExperiments() {
  return readHairExperiments().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getHairExperiment(id) {
  return readHairExperiments().find((e) => e.id === id) || null;
}

export function addHairExperiment(fields) {
  const rows = readHairExperiments();
  const experiment = {
    id: makeId(),
    product_ids: [],
    liked: [],
    disliked: [],
    wash_log_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  rows.push(experiment);
  writeHairExperiments(rows);
  return experiment;
}

export function updateHairExperiment(id, fields) {
  const rows = readHairExperiments();
  const experiment = rows.find((e) => e.id === id);
  if (!experiment) return null;
  Object.assign(experiment, fields);
  experiment.updated_at = new Date().toISOString();
  writeHairExperiments(rows);
  return experiment;
}

export function deleteHairExperiment(id) {
  writeHairExperiments(readHairExperiments().filter((e) => e.id !== id));
}

// ---------------- Hair lessons ----------------

const HAIR_LESSONS_KEY = "inertiaadhd_demo_hair_lessons";

function readHairLessons() {
  try {
    const raw = localStorage.getItem(HAIR_LESSONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHairLessons(rows) {
  localStorage.setItem(HAIR_LESSONS_KEY, JSON.stringify(rows));
}

export function listHairLessons() {
  return readHairLessons().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addHairLesson(text) {
  const rows = readHairLessons();
  const lesson = { id: makeId(), text, created_at: new Date().toISOString() };
  rows.push(lesson);
  writeHairLessons(rows);
  return lesson;
}

// ---------------- Hair notes & resources ----------------

const HAIR_NOTES_KEY = "inertiaadhd_demo_hair_notes";

function readHairNotes() {
  try {
    const raw = localStorage.getItem(HAIR_NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHairNotes(rows) {
  localStorage.setItem(HAIR_NOTES_KEY, JSON.stringify(rows));
}

export function listHairNotes() {
  return readHairNotes().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addHairNote(type, text) {
  const rows = readHairNotes();
  const note = { id: makeId(), type, text, created_at: new Date().toISOString() };
  rows.push(note);
  writeHairNotes(rows);
  return note;
}

// ---------------- Hair results gallery ----------------

const HAIR_GALLERY_KEY = "inertiaadhd_demo_hair_gallery";

function readHairGallery() {
  try {
    const raw = localStorage.getItem(HAIR_GALLERY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHairGallery(rows) {
  localStorage.setItem(HAIR_GALLERY_KEY, JSON.stringify(rows));
}

export function listHairGallery() {
  return readHairGallery().sort((a, b) => b.photo_date.localeCompare(a.photo_date));
}

// photo_url is a data: URL in demo mode (no Supabase Storage to upload
// to) — fine at the small sizes this app resizes photos to before
// saving, see readAndResizeImage in js/hairGallery.js.
export function addHairGalleryPhoto(fields) {
  const rows = readHairGallery();
  const entry = { id: makeId(), experiment_id: null, created_at: new Date().toISOString(), ...fields };
  rows.push(entry);
  writeHairGallery(rows);
  return entry;
}

// ---------------- Hair settings (panel order) ----------------

const HAIR_SETTINGS_KEY = "inertiaadhd_demo_hair_settings";

export function getHairSettings() {
  try {
    const raw = localStorage.getItem(HAIR_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveHairPanelOrder(panelOrder) {
  localStorage.setItem(HAIR_SETTINGS_KEY, JSON.stringify({ panel_order: panelOrder }));
}
