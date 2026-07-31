// Shared pieces across the Hair pages (js/hair.js and friends) — an
// experimentation framework, not a tracker, so most of what's here is
// the vocabulary of an experiment (SECTIONS, MOISTURE, DRYING, ...)
// reused across the Wash Log, Experiments list, and Experiment form.
// Kept in one place because that reuse is real here, unlike most
// small helpers in this app which are just duplicated per file.

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// Single or multi-select chip group — identical contract to
// initChipGroup in js/person.js (get/set), copied rather than imported
// since person.js doesn't export it.
export function initChipGroup(container, options, { multi }) {
  container.innerHTML = options
    .map(
      (opt) =>
        `<button type="button" class="chip" data-value="${escapeHtml(opt)}" role="${multi ? "checkbox" : "radio"}" aria-checked="false">${escapeHtml(opt)}</button>`
    )
    .join("");

  const buttons = Array.from(container.querySelectorAll(".chip"));
  let selected = multi ? new Set() : null;

  function refresh() {
    for (const btn of buttons) {
      const isSelected = multi ? selected.has(btn.dataset.value) : selected === btn.dataset.value;
      btn.setAttribute("aria-checked", String(isSelected));
    }
  }

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const value = btn.dataset.value;
    if (multi) {
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
    } else {
      selected = selected === value ? null : value;
    }
    refresh();
  });

  return {
    get: () => (multi ? Array.from(selected) : selected),
    set: (value) => {
      selected = multi ? new Set(value || []) : value || null;
      refresh();
    },
  };
}

export const SECTIONS = ["Front", "Crown", "Back", "Nape", "Whole Head"];
export const CONDITIONS = ["Freshly Washed", "One Week Old", "Two Weeks Old"];
export const MOISTURE = ["Soaking Wet", "Very Damp", "Damp", "Almost Dry", "Dry"];
export const DRYING = ["Air Dry", "RevAir", "Diffuser", "Hooded Dryer", "Blow Dryer", "Other"];
export const HEAT = ["None", "Low", "Medium", "High"];
export const PROTECTIVE = ["Twists", "Braids", "Bun", "Puff", "None"];
export const CHANGING_OPTIONS = ["Moisture level", "Leave-In", "Drying method", "Product amount", "Custom..."];
export const NOTE_TYPES = ["Link", "Video", "Product Recommendation", "Idea", "Future Experiment"];
export const RESULT_FIELDS = [
  ["result_definition", "Definition"],
  ["result_volume", "Volume"],
  ["result_softness", "Softness"],
  ["result_frizz", "Frizz"],
  ["result_shrinkage", "Shrinkage"],
  ["result_longevity", "Longevity"],
];
export const DEFAULT_PANEL_ORDER = ["routine", "products", "washlog", "experiments", "gallery", "learned", "notes"];
export const PANEL_META = {
  routine: { label: "Hair Routine", color: "sage", icon: "clipboard-check", stage: "Routine", href: "hair-routine.html" },
  products: { label: "Products", color: "lavender", icon: "bottle", stage: null, href: "hair-products.html" },
  washlog: { label: "Wash Log", color: "blue", icon: "history", stage: "Observation", href: "hair-washlog.html" },
  experiments: { label: "Experiments", color: "amber", icon: "flask", stage: "Experiment", href: "hair-experiments.html" },
  gallery: { label: "Results Gallery", color: "blue", icon: "photo", stage: "Observation", href: "hair-gallery.html" },
  learned: { label: "What I've Learned", color: "green", icon: "book-open", stage: "Learning", href: "hair-learned.html" },
  notes: { label: "Notes & Resources", color: "sage", icon: "file-text", stage: null, href: "hair-notes.html" },
};

// Session-only hand-off from the "Start an Experiment" modal (see
// hair.js/hairExperiments.js) to hair-experiment.html's new-experiment
// form, so the two-step flow doesn't need a real draft row in the
// database for an experiment someone might abandon immediately.
const DRAFT_KEY = "inertiaadhd_hair_experiment_draft";

export function stashExperimentDraft(draft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function takeExperimentDraft() {
  const raw = sessionStorage.getItem(DRAFT_KEY);
  sessionStorage.removeItem(DRAFT_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Wires up the "Start an Experiment" modal — same markup duplicated on
// hair.html, hair-washlog.html, and hair-experiments.html (each is a
// reasonable place to kick one off), sharing this one bit of logic
// rather than the DOM itself. extra is merged into the stashed draft,
// so a wash-log entry can carry its products/date/link along for the
// ride without the modal needing to know about wash logs at all.
export function wireStartExperimentModal({ open, close, getExtra } = {}) {
  const modal = document.getElementById("start-exp-modal");
  const cancelBtn = document.getElementById("start-exp-cancel");
  const continueBtn = document.getElementById("start-exp-continue");
  const questionInput = document.getElementById("start-question");
  const successInput = document.getElementById("start-success");
  const changingGroup = document.getElementById("start-changing-group");
  const changingCustom = document.getElementById("start-changing-custom");

  changingGroup.innerHTML = CHANGING_OPTIONS.map(
    (o) => `<button type="button" class="chip" data-value="${escapeHtml(o)}" role="radio" aria-checked="false">${escapeHtml(o)}</button>`
  ).join("");

  let selected = null;
  changingGroup.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    selected = selected === chip.dataset.value ? null : chip.dataset.value;
    changingGroup
      .querySelectorAll(".chip")
      .forEach((c) => c.setAttribute("aria-checked", String(c === chip && selected === c.dataset.value)));
    changingCustom.hidden = selected !== "Custom...";
  });

  function reset() {
    selected = null;
    changingGroup.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", "false"));
    changingCustom.hidden = true;
    changingCustom.value = "";
    questionInput.value = "";
    successInput.value = "";
  }

  function show() {
    reset();
    modal.classList.add("open");
    if (open) open();
  }
  function hide() {
    modal.classList.remove("open");
    if (close) close();
  }
  cancelBtn.addEventListener("click", hide);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hide();
  });
  continueBtn.addEventListener("click", () => {
    let changing = selected || "";
    if (changing === "Custom...") changing = changingCustom.value.trim();
    stashExperimentDraft({
      changing,
      goal: questionInput.value.trim(),
      success: successInput.value.trim(),
      ...(getExtra ? getExtra() : {}),
    });
    window.location.href = "hair-experiment.html";
  });

  return { show, hide };
}
