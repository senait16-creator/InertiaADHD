// A single person's relationship profile — see relationships.html for
// the list this links from. No health score, no streak: every field
// here is a description of the present (Season) or an intention
// (Investment Intention, Relationship Intention), not a grade.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { CIRCLES, SEASONS, INVESTMENT_INTENTIONS, FEELINGS } from "./relationshipOptions.js";

const params = new URLSearchParams(window.location.search);
const personId = params.get("id");

const pageTitleEl = document.getElementById("page-title");
const overflowBtn = document.getElementById("overflow-btn");
const formEl = document.getElementById("person-form");
const nameInput = document.getElementById("person-name");
const lastConnectionInput = document.getElementById("person-last-connection");
const intentionTextInput = document.getElementById("person-intention-text");
const notesInput = document.getElementById("person-notes");

const actionModal = document.getElementById("person-action-modal");
const actionMenuTitle = document.getElementById("action-menu-title");
const actionDeleteBtn = document.getElementById("action-delete-btn");
const actionCancelBtn1 = document.getElementById("action-cancel-btn-1");
const actionCancelBtn2 = document.getElementById("action-cancel-btn-2");
const actionMenuView = document.getElementById("action-menu-view");
const actionConfirmView = document.getElementById("action-confirm-view");
const confirmText = document.getElementById("confirm-text");
const actionConfirmDeleteBtn = document.getElementById("action-confirm-delete-btn");

let currentPerson = null;

// A tap-to-select chip row. `multi: true` lets several stay selected at
// once (Season, Feelings); otherwise selecting one clears the rest, and
// tapping the already-selected chip again clears it (Circle, Investment
// Intention are both optional, not required-single-choice).
function initChipGroup(container, options, { multi }) {
  container.innerHTML = options
    .map(
      (opt) =>
        `<button type="button" class="chip" data-value="${opt}" role="${multi ? "checkbox" : "radio"}" aria-checked="false">${opt}</button>`
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

const circlePicker = initChipGroup(document.getElementById("circle-group"), CIRCLES, { multi: false });
const seasonPicker = initChipGroup(document.getElementById("season-group"), SEASONS, { multi: true });
const intentionPicker = initChipGroup(document.getElementById("intention-group"), INVESTMENT_INTENTIONS, { multi: false });
const feelingsPicker = initChipGroup(document.getElementById("feelings-group"), FEELINGS, { multi: true });

function fillForm(person) {
  nameInput.value = person.name || "";
  circlePicker.set(person.circle);
  seasonPicker.set(person.season);
  intentionPicker.set(person.investment_intention);
  feelingsPicker.set(person.feelings);
  lastConnectionInput.value = person.last_connection_at || "";
  intentionTextInput.value = person.intention || "";
  notesInput.value = person.notes || "";
}

function collectFields() {
  return {
    name: nameInput.value.trim(),
    circle: circlePicker.get(),
    season: seasonPicker.get(),
    investment_intention: intentionPicker.get(),
    feelings: feelingsPicker.get(),
    last_connection_at: lastConnectionInput.value || null,
    intention: intentionTextInput.value.trim() || null,
    notes: notesInput.value.trim() || null,
  };
}

async function loadPerson() {
  if (!personId) return;

  const data = isConfigured
    ? await (async () => {
        const { data, error } = await supabase.from("relationships").select("*").eq("id", personId).single();
        if (error) console.error("Failed to load person:", error);
        return data;
      })()
    : demoStore.getRelationship(personId);

  if (!data) {
    window.location.href = "relationships.html";
    return;
  }

  currentPerson = data;
  pageTitleEl.textContent = data.name;
  overflowBtn.hidden = false;
  fillForm(data);
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fields = collectFields();
  if (!fields.name) return;

  if (currentPerson) {
    if (isConfigured) {
      const { error } = await supabase.from("relationships").update(fields).eq("id", currentPerson.id);
      if (error) {
        console.error("Failed to save person:", error);
        alert("Could not save changes.");
        return;
      }
    } else {
      demoStore.updateRelationship(currentPerson.id, fields);
    }
  } else {
    let created;
    if (isConfigured) {
      const session = await requireSession();
      if (!session) return;
      const { data, error } = await supabase
        .from("relationships")
        .insert({ ...fields, user_id: session.user.id })
        .select()
        .single();
      if (error) {
        console.error("Failed to add person:", error);
        alert("Could not add this person.");
        return;
      }
      created = data;
    } else {
      created = demoStore.addRelationship(fields);
    }
    currentPerson = created;
  }

  window.location.href = "relationships.html";
});

function openActionMenu() {
  actionMenuTitle.textContent = currentPerson.name;
  actionMenuView.hidden = false;
  actionConfirmView.hidden = true;
  actionModal.classList.add("open");
}

function closeActionModal() {
  actionModal.classList.remove("open");
}

overflowBtn.addEventListener("click", openActionMenu);
actionCancelBtn1.addEventListener("click", closeActionModal);
actionCancelBtn2.addEventListener("click", closeActionModal);
actionModal.addEventListener("click", (e) => {
  if (e.target === actionModal) closeActionModal();
});

actionDeleteBtn.addEventListener("click", () => {
  confirmText.textContent = `Delete "${currentPerson.name}"?`;
  actionMenuView.hidden = true;
  actionConfirmView.hidden = false;
});

actionConfirmDeleteBtn.addEventListener("click", async () => {
  if (isConfigured) {
    const { error } = await supabase.from("relationships").delete().eq("id", currentPerson.id);
    if (error) {
      console.error("Failed to delete person:", error);
      alert("Could not delete this person.");
      return;
    }
  } else {
    demoStore.deleteRelationship(currentPerson.id);
  }
  window.location.href = "relationships.html";
});

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
  }
  await loadPerson();
})();
