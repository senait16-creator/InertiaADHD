// The core of Hair: one experiment, one isolated variable. New
// experiments arrive here via a stashed draft from the "Start an
// Experiment" modal (see wireStartExperimentModal in js/hairShared.js);
// existing ones load by ?id=. Saving an observation can also become a
// permanent lesson right here (see the "Save as a lesson" button) —
// the literal Experiment -> Observation -> Learning path, not just a
// philosophy.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import {
  escapeHtml,
  initChipGroup,
  takeExperimentDraft,
  SECTIONS,
  CONDITIONS,
  MOISTURE,
  DRYING,
  HEAT,
  PROTECTIVE,
  RESULT_FIELDS,
} from "./hairShared.js";

const params = new URLSearchParams(window.location.search);
const experimentId = params.get("id");
const isNew = !experimentId;

const pageTitleEl = document.getElementById("page-title");
const testingBannerSlot = document.getElementById("testing-banner-slot");
const linkedWashSlot = document.getElementById("linked-wash-slot");
const form = document.getElementById("experiment-form");
const titleInput = document.getElementById("f-title");
const goalInput = document.getElementById("f-goal");
const successInput = document.getElementById("f-success");
const orderInput = document.getElementById("f-order");
const revairBlock = document.getElementById("revair-block");
const tensionInput = document.getElementById("f-tension");
const timeInput = document.getElementById("f-time");
const observationsInput = document.getElementById("f-observations");
const saveLessonBtn = document.getElementById("save-lesson-btn");
const nextInput = document.getElementById("f-next");
const repeatGroup = document.getElementById("f-repeat");
const resultsSlot = document.getElementById("results-slot");
const deleteBtn = document.getElementById("delete-btn");
const cancelBtn = document.getElementById("cancel-btn");
const productsEmptyNote = document.getElementById("f-products-empty");

const sectionPicker = initChipGroup(document.getElementById("f-section"), SECTIONS, { multi: false });
const conditionPicker = initChipGroup(document.getElementById("f-condition"), CONDITIONS, { multi: false });
const moisturePicker = initChipGroup(document.getElementById("f-moisture"), MOISTURE, { multi: false });
const dryingPicker = initChipGroup(document.getElementById("f-drying"), DRYING, { multi: false });
const heatPicker = initChipGroup(document.getElementById("f-heat"), HEAT, { multi: false });
const protectivePicker = initChipGroup(document.getElementById("f-protective"), PROTECTIVE, { multi: false });

let userId = null;
let products = [];
let productsPicker = null;
let existing = null;
let changing = "";
let washLogId = null;
let liked = [];
let disliked = [];
const results = {};
for (const [key] of RESULT_FIELDS) results[key] = 0;

function starRowMarkup(key, label) {
  return `
    <div class="star-row">
      <span class="star-row-label">${label}</span>
      <div class="stars" data-key="${key}">
        ${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="star-btn" data-star="${i}" aria-label="${i} star">${iconMarkup("star")}</button>`).join("")}
      </div>
    </div>
  `;
}

resultsSlot.innerHTML = RESULT_FIELDS.map(([key, label]) => starRowMarkup(key, label)).join("");
function refreshStars(key) {
  const row = resultsSlot.querySelector(`.stars[data-key="${key}"]`);
  row.querySelectorAll(".star-btn").forEach((btn, i) => btn.classList.toggle("filled", i < results[key]));
}
resultsSlot.addEventListener("click", (e) => {
  const btn = e.target.closest(".star-btn");
  if (!btn) return;
  const key = btn.closest(".stars").dataset.key;
  results[key] = Number(btn.dataset.star);
  refreshStars(key);
});

function shortListMarkup(name, items) {
  return items
    .map(
      (item, i) => `
    <div class="short-list-item">
      <span class="dot">•</span>
      <span contenteditable="true" data-list="${name}" data-idx="${i}">${escapeHtml(item)}</span>
      <button type="button" class="star-btn" data-remove-list="${name}" data-idx="${i}" aria-label="Remove">✕</button>
    </div>`
    )
    .join("");
}
function renderShortList(name) {
  const list = name === "liked" ? liked : disliked;
  const el = document.getElementById(`list-${name}`);
  el.innerHTML = shortListMarkup(name, list);
  el.querySelectorAll("[contenteditable]").forEach((span) => {
    span.addEventListener("blur", () => {
      list[Number(span.dataset.idx)] = span.textContent.trim();
    });
  });
  el.querySelectorAll("[data-remove-list]").forEach((btn) => {
    btn.addEventListener("click", () => {
      list.splice(Number(btn.dataset.idx), 1);
      renderShortList(name);
    });
  });
}
document.getElementById("add-liked").addEventListener("click", () => {
  liked.push("New note");
  renderShortList("liked");
});
document.getElementById("add-disliked").addEventListener("click", () => {
  disliked.push("New note");
  renderShortList("disliked");
});

document.getElementById("f-drying").addEventListener("click", () => {
  revairBlock.hidden = dryingPicker.get() !== "RevAir";
});

repeatGroup.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  repeatGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", "true");
});

function updateSaveLessonButton() {
  const alreadySaved = saveLessonBtn.dataset.saved === "true";
  saveLessonBtn.innerHTML = alreadySaved
    ? `${iconMarkup("check")} Added to What I've Learned`
    : `${iconMarkup("book-open")} Save as a lesson`;
  saveLessonBtn.disabled = alreadySaved;
}
updateSaveLessonButton();

saveLessonBtn.addEventListener("click", async () => {
  const text = observationsInput.value.trim();
  if (!text) return;
  if (!isConfigured) {
    demoStore.addHairLesson(text);
  } else {
    try {
      await supabase.from("hair_lessons").insert({ user_id: userId, text });
    } catch (error) {
      console.error("Failed to save lesson:", error);
      return;
    }
  }
  saveLessonBtn.dataset.saved = "true";
  updateSaveLessonButton();
});

async function fetchProducts() {
  if (!isConfigured) return demoStore.listInventoryItems("hair");
  const { data, error } = await supabase.from("inventory_items").select("*").eq("user_id", userId).eq("area", "hair");
  return error ? [] : data;
}

async function fetchExperiment(id) {
  if (!isConfigured) return demoStore.getHairExperiment(id);
  const { data, error } = await supabase.from("hair_experiments").select("*").eq("id", id).single();
  if (error) {
    console.error("Failed to load experiment:", error);
    return null;
  }
  return data;
}

async function fetchWashLogEntry(id) {
  if (!id) return null;
  if (!isConfigured) return demoStore.listHairWashLog().find((w) => w.id === id) || null;
  const { data } = await supabase.from("hair_wash_log").select("*").eq("id", id).maybeSingle();
  return data || null;
}

async function persistInsert(fields) {
  if (!isConfigured) return demoStore.addHairExperiment(fields);
  const { data, error } = await supabase
    .from("hair_experiments")
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to save experiment:", error);
    return null;
  }
  return data;
}

async function persistUpdate(id, fields) {
  if (!isConfigured) return demoStore.updateHairExperiment(id, fields);
  try {
    await supabase.from("hair_experiments").update(fields).eq("id", id);
  } catch (error) {
    console.error("Failed to save experiment:", error);
  }
}

async function persistDelete(id) {
  if (!isConfigured) {
    demoStore.deleteHairExperiment(id);
    return;
  }
  try {
    await supabase.from("hair_experiments").delete().eq("id", id);
  } catch (error) {
    console.error("Failed to delete experiment:", error);
  }
}

async function linkWashLogToExperiment(washId, experimentIdValue) {
  if (!isConfigured) {
    demoStore.updateHairWashLogEntry(washId, { experiment_id: experimentIdValue });
    return;
  }
  try {
    await supabase.from("hair_wash_log").update({ experiment_id: experimentIdValue }).eq("id", washId);
  } catch (error) {
    console.error("Failed to link wash log to experiment:", error);
  }
}

function fillForm(exp) {
  titleInput.value = exp.title || "";
  goalInput.value = exp.goal || "";
  successInput.value = exp.success || "";
  sectionPicker.set(exp.section);
  conditionPicker.set(exp.hair_condition);
  moisturePicker.set(exp.hair_moisture);
  productsPicker.set((exp.product_ids || []).map((id) => products.find((p) => p.id === id)?.name).filter(Boolean));
  orderInput.value = exp.product_order || "";
  dryingPicker.set(exp.drying_method);
  revairBlock.hidden = exp.drying_method !== "RevAir";
  heatPicker.set(exp.revair_heat || "None");
  tensionInput.value = exp.revair_tension || "";
  timeInput.value = exp.revair_time || "";
  protectivePicker.set(exp.protective_after);
  for (const [key] of RESULT_FIELDS) {
    results[key] = exp[key] || 0;
    refreshStars(key);
  }
  observationsInput.value = exp.observations || "";
  liked = [...(exp.liked || [])];
  disliked = [...(exp.disliked || [])];
  renderShortList("liked");
  renderShortList("disliked");
  nextInput.value = exp.next_try || "";
  if (exp.repeat) {
    repeatGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === exp.repeat)));
  }
  changing = exp.changing || "";
  washLogId = exp.wash_log_id || null;
}

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }

  products = await fetchProducts();
  const nameByProductId = new Map(products.map((p) => [p.id, p.name]));
  productsEmptyNote.hidden = products.length > 0;
  productsPicker = initChipGroup(
    document.getElementById("f-products"),
    products.map((p) => p.name),
    { multi: true }
  );

  let fromWashId = null;
  let draftProductIds = [];

  if (isNew) {
    pageTitleEl.textContent = "New Experiment";
    deleteBtn.hidden = true;
    const draft = takeExperimentDraft();
    if (draft) {
      changing = draft.changing || "";
      goalInput.value = draft.goal || "";
      successInput.value = draft.success || "";
      fromWashId = draft.fromWashId || null;
      draftProductIds = draft.productIds || [];
      productsPicker.set(draftProductIds.map((id) => nameByProductId.get(id)).filter(Boolean));
      washLogId = fromWashId;
    }
  } else {
    pageTitleEl.textContent = "Edit Experiment";
    deleteBtn.hidden = false;
    existing = await fetchExperiment(experimentId);
    if (!existing) {
      window.location.href = "hair-experiments.html";
      return;
    }
    fillForm(existing);
  }

  if (changing) {
    testingBannerSlot.innerHTML = `<div class="testing-banner">${iconMarkup("lock")} <span><b>Testing: ${escapeHtml(changing)}</b> — everything else stays the same.</span></div>`;
  }

  const linkedWash = await fetchWashLogEntry(washLogId);
  if (linkedWash) {
    linkedWashSlot.innerHTML = `<div class="linked-wash-chip">${iconMarkup("link")} Linked wash: ${new Date(linkedWash.wash_date + "T00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}</div>`;
  }

  cancelBtn.addEventListener("click", () => {
    window.location.href = "hair-experiments.html";
  });

  deleteBtn.addEventListener("click", async () => {
    await persistDelete(experimentId);
    window.location.href = "hair-experiments.html";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameToId = new Map(products.map((p) => [p.name, p.id]));
    const fields = {
      title: titleInput.value.trim() || "Untitled Experiment",
      changing: changing || null,
      goal: goalInput.value.trim() || null,
      success: successInput.value.trim() || null,
      section: sectionPicker.get(),
      hair_condition: conditionPicker.get(),
      hair_moisture: moisturePicker.get(),
      product_ids: productsPicker.get().map((name) => nameToId.get(name)).filter(Boolean),
      product_order: orderInput.value.trim() || null,
      drying_method: dryingPicker.get(),
      revair_heat: dryingPicker.get() === "RevAir" ? heatPicker.get() || "None" : null,
      revair_tension: dryingPicker.get() === "RevAir" ? Number(tensionInput.value) || null : null,
      revair_time: dryingPicker.get() === "RevAir" ? timeInput.value.trim() || null : null,
      protective_after: protectivePicker.get(),
      observations: observationsInput.value.trim() || null,
      liked,
      disliked,
      next_try: nextInput.value.trim() || null,
      repeat: repeatGroup.querySelector('button[aria-pressed="true"]')?.dataset.value || null,
    };
    for (const [key] of RESULT_FIELDS) fields[key] = results[key] || null;

    if (isNew) {
      if (fromWashId) fields.wash_log_id = fromWashId;
      const created = await persistInsert(fields);
      if (created) {
        if (fromWashId) await linkWashLogToExperiment(fromWashId, created.id);
        window.location.href = "hair-experiments.html";
      }
    } else {
      await persistUpdate(experimentId, fields);
      window.location.href = "hair-experiments.html";
    }
  });
})();
