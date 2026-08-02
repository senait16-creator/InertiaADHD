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

// hair_routine_steps and hair_products used to live here. Both are
// gone — Hair's routine is now just getOrCreateRoutine("hair") and its
// versioned items further down, and Hair's products are now Inventory items
// (listInventoryItems("hair")), same as every other care area.

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

// ---------------- Inventory items ----------------
// The reusable product identity — what do I own — shared by every area
// including Hair (area "hair"), not a per-area duplicate. See the
// README's "Inventory" section.

const INVENTORY_ITEMS_KEY = "inertiaadhd_demo_inventory_items";

function readInventoryItems() {
  try {
    const raw = localStorage.getItem(INVENTORY_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeInventoryItems(rows) {
  localStorage.setItem(INVENTORY_ITEMS_KEY, JSON.stringify(rows));
}

export function listInventoryItems(area) {
  return readInventoryItems()
    .filter((i) => i.area === area)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// Unfiltered — a Maintenance area's "use an existing item" picker draws
// from every category you own, not just the one matching this area (the
// same jar of coconut oil can be filed under Body Care in Inventory and
// still get used in a Hair routine).
export function listAllInventoryItems() {
  return readInventoryItems().sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getInventoryItem(id) {
  return readInventoryItems().find((i) => i.id === id) || null;
}

export function addInventoryItem(fields) {
  const rows = readInventoryItems();
  const item = {
    id: makeId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  rows.push(item);
  writeInventoryItems(rows);
  return item;
}

export function updateInventoryItem(id, fields) {
  const rows = readInventoryItems();
  const item = rows.find((i) => i.id === id);
  if (!item) return null;
  Object.assign(item, fields);
  item.updated_at = new Date().toISOString();
  writeInventoryItems(rows);
  return item;
}

export function deleteInventoryItem(id) {
  writeInventoryItems(readInventoryItems().filter((i) => i.id !== id));
  // Cascades, matching the real schema's "on delete cascade": a
  // purchase, usage, or photo row is meaningless without the item it's
  // about.
  writeInventoryPurchases(readInventoryPurchases().filter((p) => p.inventory_item_id !== id));
  writeMaintenanceUsage(readMaintenanceUsage().filter((u) => u.inventory_item_id !== id));
  writeInventoryItemPhotos(readInventoryItemPhotos().filter((p) => p.inventory_item_id !== id));
}

// ---------------- Inventory purchases ----------------
// One row per individually purchased container of an item — see the
// schema comment on inventory_purchases for why this is separate from
// the item's identity above.

const INVENTORY_PURCHASES_KEY = "inertiaadhd_demo_inventory_purchases";

function readInventoryPurchases() {
  try {
    const raw = localStorage.getItem(INVENTORY_PURCHASES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeInventoryPurchases(rows) {
  localStorage.setItem(INVENTORY_PURCHASES_KEY, JSON.stringify(rows));
}

export function listInventoryPurchases(itemId) {
  return readInventoryPurchases()
    .filter((p) => p.inventory_item_id === itemId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addInventoryPurchase(itemId, fields) {
  const rows = readInventoryPurchases();
  const purchase = {
    id: makeId(),
    inventory_item_id: itemId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  rows.push(purchase);
  writeInventoryPurchases(rows);
  return purchase;
}

export function updateInventoryPurchase(id, fields) {
  const rows = readInventoryPurchases();
  const purchase = rows.find((p) => p.id === id);
  if (!purchase) return null;
  Object.assign(purchase, fields);
  purchase.updated_at = new Date().toISOString();
  writeInventoryPurchases(rows);
  return purchase;
}

export function deleteInventoryPurchase(id) {
  writeInventoryPurchases(readInventoryPurchases().filter((p) => p.id !== id));
}

// ---------------- Inventory item photos ----------------
// A small gallery per item — a shoe often wants more than one angle.
// photo_url is a data: URL in demo mode (no Supabase Storage to upload
// to), same as js/hairGallery.js's demo-mode fallback.

const INVENTORY_ITEM_PHOTOS_KEY = "inertiaadhd_demo_inventory_item_photos";

function readInventoryItemPhotos() {
  try {
    const raw = localStorage.getItem(INVENTORY_ITEM_PHOTOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeInventoryItemPhotos(rows) {
  localStorage.setItem(INVENTORY_ITEM_PHOTOS_KEY, JSON.stringify(rows));
}

export function listInventoryItemPhotos(itemId) {
  return readInventoryItemPhotos()
    .filter((p) => p.inventory_item_id === itemId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addInventoryItemPhoto(itemId, photoUrl) {
  const rows = readInventoryItemPhotos();
  const photo = { id: makeId(), inventory_item_id: itemId, photo_url: photoUrl, created_at: new Date().toISOString() };
  rows.push(photo);
  writeInventoryItemPhotos(rows);
  return photo;
}

export function deleteInventoryItemPhoto(id) {
  writeInventoryItemPhotos(readInventoryItemPhotos().filter((p) => p.id !== id));
}

// ---------------- Maintenance usage ----------------
// How one Inventory item performs in one maintenance area — routine
// step, rating, performance notes, repurchase decision for THIS area,
// not the item itself. The same inventory_item_id can have a usage row
// in more than one area.

const MAINTENANCE_USAGE_KEY = "inertiaadhd_demo_maintenance_usage";

function readMaintenanceUsage() {
  try {
    const raw = localStorage.getItem(MAINTENANCE_USAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeMaintenanceUsage(rows) {
  localStorage.setItem(MAINTENANCE_USAGE_KEY, JSON.stringify(rows));
}

export function listMaintenanceUsage(area) {
  return readMaintenanceUsage()
    .filter((u) => u.area === area)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getMaintenanceUsage(id) {
  return readMaintenanceUsage().find((u) => u.id === id) || null;
}

export function getMaintenanceUsageForItem(itemId, area) {
  return readMaintenanceUsage().find((u) => u.inventory_item_id === itemId && u.area === area) || null;
}

export function listMaintenanceUsageForItem(itemId) {
  return readMaintenanceUsage().filter((u) => u.inventory_item_id === itemId);
}

export function addMaintenanceUsage(fields) {
  const rows = readMaintenanceUsage();
  const usage = {
    id: makeId(),
    repurchase: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  rows.push(usage);
  writeMaintenanceUsage(rows);
  return usage;
}

export function updateMaintenanceUsage(id, fields) {
  const rows = readMaintenanceUsage();
  const usage = rows.find((u) => u.id === id);
  if (!usage) return null;
  Object.assign(usage, fields);
  usage.updated_at = new Date().toISOString();
  writeMaintenanceUsage(rows);
  return usage;
}

export function deleteMaintenanceUsage(id) {
  writeMaintenanceUsage(readMaintenanceUsage().filter((u) => u.id !== id));
}

// ---------------- Stickers ----------------
// A small reusable image, created once and referenced from inventory
// items and routine version items rather than re-uploaded per place —
// see the README's "Stickers" section.

const STICKERS_KEY = "inertiaadhd_demo_stickers";

function readStickers() {
  try {
    const raw = localStorage.getItem(STICKERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStickers(rows) {
  localStorage.setItem(STICKERS_KEY, JSON.stringify(rows));
}

export function listStickers() {
  return readStickers().sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function getSticker(id) {
  return readStickers().find((s) => s.id === id) || null;
}

export function addSticker(fields) {
  const rows = readStickers();
  const sticker = {
    id: makeId(),
    sticker_type: "product",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  rows.push(sticker);
  writeStickers(rows);
  return sticker;
}

export function updateSticker(id, fields) {
  const rows = readStickers();
  const sticker = rows.find((s) => s.id === id);
  if (!sticker) return null;
  Object.assign(sticker, fields);
  sticker.updated_at = new Date().toISOString();
  writeStickers(rows);
  return sticker;
}

export function deleteSticker(id) {
  writeStickers(readStickers().filter((s) => s.id !== id));
}

// Checked before allowing a delete from the Sticker Library — a sticker
// still referenced anywhere should not silently vanish out from under
// whatever's using it.
export function isStickerInUse(id) {
  const usedByItem = readInventoryItems().some((i) => i.sticker_id === id);
  const usedByRoutine = readRoutineVersionItems().some((vi) => vi.sticker_id === id);
  return usedByItem || usedByRoutine;
}

// ---------------- Routines / Routine Versions / Routine Version Items ----------------
// One routine per area (e.g. the Skin Care routine), versioned rather
// than a single overwritten list — see startNewRoutineVersion below and
// the README's "Versioned Routines" section. area "hair" is Hair Lab's
// own Hair Routine panel too, same system as every other area.

const ROUTINES_KEY = "inertiaadhd_demo_routines";
const ROUTINE_VERSIONS_KEY = "inertiaadhd_demo_routine_versions";
const ROUTINE_VERSION_ITEMS_KEY = "inertiaadhd_demo_routine_version_items";

function readRoutines() {
  try {
    const raw = localStorage.getItem(ROUTINES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeRoutines(rows) {
  localStorage.setItem(ROUTINES_KEY, JSON.stringify(rows));
}
function readRoutineVersions() {
  try {
    const raw = localStorage.getItem(ROUTINE_VERSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeRoutineVersions(rows) {
  localStorage.setItem(ROUTINE_VERSIONS_KEY, JSON.stringify(rows));
}
function readRoutineVersionItems() {
  try {
    const raw = localStorage.getItem(ROUTINE_VERSION_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeRoutineVersionItems(rows) {
  localStorage.setItem(ROUTINE_VERSION_ITEMS_KEY, JSON.stringify(rows));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Creates the routine (and its first, empty, current version) on first
// use — every area gets one lazily rather than needing to be seeded.
export function getOrCreateRoutine(area) {
  const routines = readRoutines();
  let routine = routines.find((r) => r.area === area);
  if (!routine) {
    routine = { id: makeId(), area, name: `${area} routine`, created_at: new Date().toISOString() };
    routines.push(routine);
    writeRoutines(routines);
  }
  const versions = readRoutineVersions();
  const hasCurrent = versions.some((v) => v.routine_id === routine.id && !v.ended_at);
  if (!hasCurrent) {
    versions.push({
      id: makeId(),
      routine_id: routine.id,
      version_number: versions.filter((v) => v.routine_id === routine.id).length + 1,
      started_at: todayStr(),
      ended_at: null,
      notes: null,
      created_at: new Date().toISOString(),
    });
    writeRoutineVersions(versions);
  }
  return routine;
}

export function getCurrentRoutineVersion(routineId) {
  return readRoutineVersions().find((v) => v.routine_id === routineId && !v.ended_at) || null;
}

export function getRoutineVersion(id) {
  return readRoutineVersions().find((v) => v.id === id) || null;
}

export function listRoutineVersions(routineId) {
  return readRoutineVersions()
    .filter((v) => v.routine_id === routineId)
    .sort((a, b) => a.version_number - b.version_number);
}

export function listVersionItems(versionId) {
  return readRoutineVersionItems()
    .filter((i) => i.routine_version_id === versionId)
    .sort((a, b) => a.position - b.position);
}

// Which *currently active* routines include this item — used by
// inventory-item.html's "Used In" section. Closed (past) versions don't
// count here; that history lives on each area's own History page.
export function listCurrentRoutineMembershipsForItem(itemId) {
  const versions = readRoutineVersions();
  const routines = readRoutines();
  return readRoutineVersionItems()
    .filter((vi) => vi.inventory_item_id === itemId)
    .map((vi) => {
      const version = versions.find((v) => v.id === vi.routine_version_id);
      if (!version || version.ended_at) return null;
      const routine = routines.find((r) => r.id === version.routine_id);
      if (!routine) return null;
      return { area: routine.area, section: vi.section };
    })
    .filter(Boolean);
}

// Wipes and re-inserts a version's whole item list in one call — routine
// sizes are small, so "replace everything" is simpler and safer than
// diffing inserts/moves/deletes against what was there before.
export function replaceVersionItems(versionId, items) {
  const others = readRoutineVersionItems().filter((i) => i.routine_version_id !== versionId);
  const rows = items.map((it) => ({
    id: makeId(),
    routine_version_id: versionId,
    created_at: new Date().toISOString(),
    ...it,
  }));
  writeRoutineVersionItems([...others, ...rows]);
  return rows;
}

// "Update current version": edits apply in place, no new version row.
export function updateCurrentVersionItems(versionId, items, notes) {
  if (notes !== undefined) {
    const versions = readRoutineVersions();
    const v = versions.find((x) => x.id === versionId);
    if (v) {
      v.notes = notes;
      writeRoutineVersions(versions);
    }
  }
  return replaceVersionItems(versionId, items);
}

// "Start a new version": closes the current version (ended_at = today)
// and opens a fresh one holding the edited items — the closed version's
// own items are never touched, so it stays an accurate historical
// snapshot forever.
export function startNewRoutineVersion(routineId, items, notes) {
  const versions = readRoutineVersions();
  const current = versions.find((v) => v.routine_id === routineId && !v.ended_at);
  if (current) current.ended_at = todayStr();
  const maxVersion = Math.max(0, ...versions.filter((v) => v.routine_id === routineId).map((v) => v.version_number));
  const next = {
    id: makeId(),
    routine_id: routineId,
    version_number: maxVersion + 1,
    started_at: todayStr(),
    ended_at: null,
    notes: notes || null,
    created_at: new Date().toISOString(),
  };
  versions.push(next);
  writeRoutineVersions(versions);
  replaceVersionItems(next.id, items);
  return next;
}

// ---------------- Maintenance logs ----------------
// One entry per day per area — locked to whichever routine version was
// active when saved (routine_version_id), never the live current one.

const MAINTENANCE_LOGS_KEY = "inertiaadhd_demo_maintenance_logs";

function readMaintenanceLogs() {
  try {
    const raw = localStorage.getItem(MAINTENANCE_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeMaintenanceLogs(rows) {
  localStorage.setItem(MAINTENANCE_LOGS_KEY, JSON.stringify(rows));
}

export function listMaintenanceLogs(area) {
  return readMaintenanceLogs()
    .filter((l) => l.area === area)
    .sort((a, b) => b.log_date.localeCompare(a.log_date));
}

export function addMaintenanceLog(fields) {
  const rows = readMaintenanceLogs();
  const log = {
    id: makeId(),
    log_date: todayStr(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...fields,
  };
  rows.push(log);
  writeMaintenanceLogs(rows);
  return log;
}
