// Generic product inventory, shared by Skin Care, Body Care, Nail Care,
// and Jewelry (?area=skin|body|nail|jewelry) — this is each area's
// Maintenance-tile landing page. Quick-add only captures the basics;
// purchase details, dates, rating, and notes are filled in on the
// product's own page (maintenance-product.html), same "quick add now,
// fill in later" shape as Hair Products.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { AREAS, escapeHtml, estimatedDurationDays, estimatedMonthlyCost, formatMoney } from "./maintenanceShared.js";

const params = new URLSearchParams(window.location.search);
const area = params.get("area");
const areaMeta = AREAS[area];

if (!areaMeta) {
  window.location.href = "maintenance.html";
  throw new Error("Unknown maintenance area");
}

document.getElementById("page-title").textContent = areaMeta.label;
const routineLink = document.getElementById("routine-link");
routineLink.href = `maintenance-routine.html?area=${encodeURIComponent(area)}`;
routineLink.innerHTML = `${iconMarkup("link")} ${escapeHtml(areaMeta.label)} routine`;

const listEl = document.getElementById("product-list");
const emptyNote = document.getElementById("empty-note");
const costSummary = document.getElementById("cost-summary");
const addBtn = document.getElementById("add-product-btn");
const modal = document.getElementById("add-product-modal");
const form = document.getElementById("add-product-form");
const cancelBtn = document.getElementById("add-product-cancel");
const nameInput = document.getElementById("p-name");
const brandInput = document.getElementById("p-brand");
const categoryInput = document.getElementById("p-category");
const repurchaseGroup = document.getElementById("p-repurchase");

let userId = null;
let products = [];

async function fetchProducts() {
  if (!isConfigured) return demoStore.listMaintenanceProducts(area);
  const { data, error } = await supabase.from("maintenance_products").select("*").eq("user_id", userId).eq("area", area);
  if (error) {
    console.error("Failed to load products:", error);
    return [];
  }
  return data.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function persistAdd(fields) {
  if (!isConfigured) return demoStore.addMaintenanceProduct({ area, ...fields });
  const { data, error } = await supabase
    .from("maintenance_products")
    .insert({ user_id: userId, area, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to add product:", error);
    return null;
  }
  return data;
}

function render() {
  emptyNote.hidden = products.length > 0;

  let costTotal = 0;
  let costCount = 0;
  for (const p of products) {
    const days = estimatedDurationDays(p.date_started, p.date_finished);
    const monthly = estimatedMonthlyCost(p.purchase_price, days);
    if (monthly != null) {
      costTotal += monthly;
      costCount++;
    }
  }
  costSummary.hidden = costCount === 0;
  if (costCount > 0) {
    costSummary.innerHTML = `${iconMarkup("sparkles")} <span>Estimated ${formatMoney(costTotal)}/month based on ${costCount} product${costCount === 1 ? "" : "s"} with a known lifespan.</span>`;
  }

  listEl.innerHTML = products
    .map((p) => {
      const repeatClass = p.repurchase === "Yes" ? "repeat-yes" : p.repurchase === "Maybe" ? "repeat-maybe" : "repeat-no";
      const days = estimatedDurationDays(p.date_started, p.date_finished);
      const monthly = estimatedMonthlyCost(p.purchase_price, days);
      return `
      <a class="card-row clickable" href="maintenance-product.html?id=${encodeURIComponent(p.id)}&area=${encodeURIComponent(area)}" style="display:block; text-decoration:none; color:inherit;">
        <div class="card-title">${escapeHtml(p.name)}</div>
        <div class="card-sub">${escapeHtml(p.category || "")}${p.brand ? " · " + escapeHtml(p.brand) : ""}</div>
        <div class="card-meta-row">
          ${p.repurchase ? `<span class="tag ${repeatClass}">Repurchase: ${escapeHtml(p.repurchase)}</span>` : ""}
          ${monthly != null ? `<span class="tag">${formatMoney(monthly)}/mo</span>` : ""}
          ${p.rating != null ? `<span class="tag">${p.rating}/10</span>` : ""}
        </div>
      </a>
    `;
    })
    .join("");
}

function openModal() {
  form.reset();
  repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === "Maybe")));
  modal.classList.add("open");
  nameInput.focus();
}
function closeModal() {
  modal.classList.remove("open");
}
addBtn.addEventListener("click", openModal);
cancelBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
repurchaseGroup.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  repurchaseGroup.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", "true");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  const fields = {
    name,
    brand: brandInput.value.trim() || null,
    category: categoryInput.value.trim() || null,
    repurchase: repurchaseGroup.querySelector('button[aria-pressed="true"]')?.dataset.value || "Maybe",
  };
  const created = await persistAdd(fields);
  if (created) {
    products.push(created);
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
  products = await fetchProducts();
  render();
})();
