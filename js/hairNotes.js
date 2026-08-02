// Notes & Resources — links, videos, product recommendations, ideas,
// and future experiments to try. Deliberately simple: no linking to
// other Hair entities, just a running list.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { escapeHtml, initChipGroup, NOTE_TYPES } from "./hairShared.js";

const listEl = document.getElementById("note-list");
const emptyNote = document.getElementById("empty-note");
const addBtn = document.getElementById("add-note-btn");
const modal = document.getElementById("add-note-modal");
const form = document.getElementById("add-note-form");
const cancelBtn = document.getElementById("add-note-cancel");
const textInput = document.getElementById("n-text");

const typePicker = initChipGroup(document.getElementById("n-type"), NOTE_TYPES, { multi: false });

let userId = null;
let notes = [];

async function fetchNotes() {
  if (!isConfigured) return demoStore.listHairNotes();
  const { data, error } = await supabase.from("hair_notes").select("*").eq("user_id", userId);
  if (error) {
    console.error("Failed to load notes:", error);
    return [];
  }
  return data.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function persistAdd(type, text) {
  if (!isConfigured) return demoStore.addHairNote(type, text);
  const { data, error } = await supabase
    .from("hair_notes")
    .insert({ user_id: userId, type, text })
    .select()
    .single();
  if (error) {
    console.error("Failed to add note:", error);
    return null;
  }
  return data;
}

function render() {
  emptyNote.hidden = notes.length > 0;
  listEl.innerHTML = notes
    .map(
      (n) => `
    <div class="lesson-card">
      ${n.type ? `<div class="card-meta-row"><span class="tag">${escapeHtml(n.type)}</span></div>` : ""}
      ${escapeHtml(n.text)}
    </div>`
    )
    .join("");
}

function openModal() {
  form.reset();
  typePicker.set(NOTE_TYPES[0]);
  modal.classList.add("open");
  textInput.focus();
}
function closeModal() {
  modal.classList.remove("open");
}
addBtn.addEventListener("click", openModal);
cancelBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;
  const created = await persistAdd(typePicker.get(), text);
  if (created) {
    notes.unshift(created);
    render();
    closeModal();
  }
});

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }
  notes = await fetchNotes();
  render();
})();
