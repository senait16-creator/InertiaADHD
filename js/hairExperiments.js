// Experiments list — see js/hairExperiment.js for the actual form.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { escapeHtml, wireStartExperimentModal } from "./hairShared.js";

const listEl = document.getElementById("experiment-list");
const emptyNote = document.getElementById("empty-note");
const newExpBtn = document.getElementById("new-exp-btn");

async function fetchExperiments(userId) {
  if (!isConfigured) return demoStore.listHairExperiments();
  const { data, error } = await supabase.from("hair_experiments").select("*").eq("user_id", userId);
  if (error) {
    console.error("Failed to load experiments:", error);
    return [];
  }
  return data.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function render(experiments) {
  emptyNote.hidden = experiments.length > 0;
  listEl.innerHTML = experiments
    .map((exp) => {
      const repeatClass = exp.repeat === "Yes" ? "repeat-yes" : exp.repeat === "Maybe" ? "repeat-maybe" : "repeat-no";
      return `
      <a class="card-row clickable" href="hair-experiment.html?id=${encodeURIComponent(exp.id)}" style="display:block; text-decoration:none; color:inherit;">
        <div class="card-title">${escapeHtml(exp.title)}</div>
        ${exp.goal ? `<div class="card-sub">${escapeHtml(exp.goal)}</div>` : ""}
        <div class="card-meta-row">
          ${exp.changing ? `<span class="tag accent">Testing: ${escapeHtml(exp.changing)}</span>` : ""}
          ${exp.section ? `<span class="tag">${escapeHtml(exp.section)}</span>` : ""}
          ${exp.repeat ? `<span class="tag ${repeatClass}">Repeat: ${escapeHtml(exp.repeat)}</span>` : ""}
        </div>
      </a>`;
    })
    .join("");
}

const startExpModal = wireStartExperimentModal();
newExpBtn.addEventListener("click", startExpModal.show);

(async function init() {
  let userId = null;
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }
  const experiments = await fetchExperiments(userId);
  render(experiments);
})();
