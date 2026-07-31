// Wash Log — a plain history that talks to Experiments instead of
// living in its own world: a wash can link to the experiment it led to
// (see startExperimentFromWash below), so that experiment doesn't need
// its date/products typed in twice.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { escapeHtml, wireStartExperimentModal } from "./hairShared.js";

const listEl = document.getElementById("wash-list");
const emptyNote = document.getElementById("empty-note");
const addBtn = document.getElementById("add-wash-btn");
const modal = document.getElementById("add-wash-modal");
const form = document.getElementById("add-wash-form");
const cancelBtn = document.getElementById("add-wash-cancel");
const dateInput = document.getElementById("w-date");
const productsGroup = document.getElementById("w-products");
const productsEmptyNote = document.getElementById("w-products-empty");
const styleBeforeInput = document.getElementById("w-style-before");
const notesInput = document.getElementById("w-notes");

let userId = null;
let washLog = [];
let products = [];
let experiments = [];
let pendingWashLink = null;

async function fetchWashLog() {
  if (!isConfigured) return demoStore.listHairWashLog();
  const { data, error } = await supabase.from("hair_wash_log").select("*").eq("user_id", userId);
  if (error) {
    console.error("Failed to load wash log:", error);
    return [];
  }
  return data.sort((a, b) => b.wash_date.localeCompare(a.wash_date));
}

async function fetchProducts() {
  if (!isConfigured) return demoStore.listHairProducts();
  const { data, error } = await supabase.from("hair_products").select("*").eq("user_id", userId);
  return error ? [] : data;
}

async function fetchExperiments() {
  if (!isConfigured) return demoStore.listHairExperiments();
  const { data, error } = await supabase.from("hair_experiments").select("id, title").eq("user_id", userId);
  return error ? [] : data;
}

async function persistAdd(fields) {
  if (!isConfigured) return demoStore.addHairWashLogEntry(fields);
  const { data, error } = await supabase
    .from("hair_wash_log")
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to log wash:", error);
    return null;
  }
  return data;
}

function productNames(ids) {
  const byId = new Map(products.map((p) => [p.id, p.name]));
  return (ids || []).map((id) => byId.get(id)).filter(Boolean);
}

function render() {
  emptyNote.hidden = washLog.length > 0;
  const experimentById = new Map(experiments.map((e) => [e.id, e]));
  listEl.innerHTML = washLog
    .map((w) => {
      const exp = w.experiment_id ? experimentById.get(w.experiment_id) : null;
      const names = productNames(w.product_ids);
      return `
      <div class="card-row">
        <div class="card-title">${new Date(w.wash_date + "T00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}</div>
        ${w.style_before ? `<div class="card-sub">Previous style: ${escapeHtml(w.style_before)}</div>` : ""}
        ${w.notes ? `<div class="card-sub" style="margin-top:0.4rem;">${escapeHtml(w.notes)}</div>` : ""}
        ${names.length ? `<p class="field-note" style="margin:0.6rem 0 0.15rem;">Products</p><div class="checklist-row">${names.map((n) => `<div class="checklist-item">${iconMarkup("check")}${escapeHtml(n)}</div>`).join("")}</div>` : ""}
        <div class="card-meta-row">
          ${exp
            ? `<a class="link-chip" href="hair-experiment.html?id=${encodeURIComponent(exp.id)}">${iconMarkup("link")} ${escapeHtml(exp.title)}</a>`
            : `<button type="button" class="link-chip" data-start-from-wash="${w.id}">+ Start an experiment from this wash</button>`
          }
        </div>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll("[data-start-from-wash]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wash = washLog.find((w) => w.id === btn.dataset.startFromWash);
      pendingWashLink = wash;
      document.getElementById("start-from-wash-note").textContent = `Starting from the ${new Date(
        wash.wash_date + "T00:00"
      ).toLocaleDateString(undefined, { month: "long", day: "numeric" })} wash — its products will carry over.`;
      startExpModal.show();
    });
  });
}

function openAddModal() {
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  productsGroup.innerHTML = products
    .map((p) => `<button type="button" class="chip" data-id="${p.id}" role="checkbox" aria-checked="false">${escapeHtml(p.name)}</button>`)
    .join("");
  productsEmptyNote.hidden = products.length > 0;
  modal.classList.add("open");
}
function closeAddModal() {
  modal.classList.remove("open");
}
addBtn.addEventListener("click", openAddModal);
cancelBtn.addEventListener("click", closeAddModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeAddModal();
});
productsGroup.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  chip.setAttribute("aria-checked", chip.getAttribute("aria-checked") === "true" ? "false" : "true");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fields = {
    wash_date: dateInput.value,
    product_ids: [...productsGroup.querySelectorAll('.chip[aria-checked="true"]')].map((c) => c.dataset.id),
    style_before: styleBeforeInput.value.trim() || null,
    notes: notesInput.value.trim() || null,
  };
  const created = await persistAdd(fields);
  if (created) {
    washLog.unshift(created);
    render();
    closeAddModal();
  }
});

const startExpModal = wireStartExperimentModal({
  close: () => {
    pendingWashLink = null;
    document.getElementById("start-from-wash-note").textContent = "";
  },
  // product_ids, not names, so the draft handed to hair-experiment.html
  // stays consistent with how hair_experiments.product_ids references
  // hair_products throughout — a renamed product never breaks this link.
  getExtra: () => (pendingWashLink ? { fromWashId: pendingWashLink.id, productIds: pendingWashLink.product_ids || [] } : {}),
});

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }
  [washLog, products, experiments] = await Promise.all([fetchWashLog(), fetchProducts(), fetchExperiments()]);
  render();
})();
