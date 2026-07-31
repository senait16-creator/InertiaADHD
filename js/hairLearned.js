// What I've Learned — permanent lessons. Most arrive via the "Save as
// a lesson" button on an experiment's Observations field (see
// js/hairExperiment.js); this page is also where you can add one
// directly, for a realization that didn't come from a single experiment.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { escapeHtml } from "./hairShared.js";

const listEl = document.getElementById("lesson-list");
const emptyNote = document.getElementById("empty-note");
const addBtn = document.getElementById("add-lesson-btn");
const modal = document.getElementById("add-lesson-modal");
const form = document.getElementById("add-lesson-form");
const cancelBtn = document.getElementById("add-lesson-cancel");
const textInput = document.getElementById("l-text");

let userId = null;
let lessons = [];

async function fetchLessons() {
  if (!isConfigured) return demoStore.listHairLessons();
  const { data, error } = await supabase.from("hair_lessons").select("*").eq("user_id", userId);
  if (error) {
    console.error("Failed to load lessons:", error);
    return [];
  }
  return data.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function persistAdd(text) {
  if (!isConfigured) return demoStore.addHairLesson(text);
  const { data, error } = await supabase
    .from("hair_lessons")
    .insert({ user_id: userId, text })
    .select()
    .single();
  if (error) {
    console.error("Failed to add lesson:", error);
    return null;
  }
  return data;
}

function render() {
  emptyNote.hidden = lessons.length > 0;
  listEl.innerHTML = lessons
    .map((l) => `<div class="lesson-card"><span class="lesson-quote-mark">"</span>${escapeHtml(l.text)}</div>`)
    .join("");
}

function openModal() {
  form.reset();
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
  const created = await persistAdd(text);
  if (created) {
    lessons.unshift(created);
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
  lessons = await fetchLessons();
  render();
})();
