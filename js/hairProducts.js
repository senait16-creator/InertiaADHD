// Products — a simple database (name, brand, category, notes,
// favorite, repurchase), added manually for now. A "paste a product
// URL and its details/photo appear" flow is the planned next step once
// the rest of Hair is built (see the README's Hair Lab section) —
// deliberately not this file's job yet.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { escapeHtml } from "./hairShared.js";

const listEl = document.getElementById("product-list");
const emptyNote = document.getElementById("empty-note");
const addBtn = document.getElementById("add-product-btn");
const modal = document.getElementById("add-product-modal");
const form = document.getElementById("add-product-form");
const cancelBtn = document.getElementById("add-product-cancel");
const nameInput = document.getElementById("p-name");
const brandInput = document.getElementById("p-brand");
const categoryInput = document.getElementById("p-category");
const notesInput = document.getElementById("p-notes");
const favoriteInput = document.getElementById("p-favorite");
const repurchaseGroup = document.getElementById("p-repurchase");

let userId = null;
let products = [];

async function fetchProducts() {
  if (!isConfigured) return demoStore.listHairProducts();
  const { data, error } = await supabase.from("hair_products").select("*").eq("user_id", userId);
  if (error) {
    console.error("Failed to load hair products:", error);
    return [];
  }
  return data.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function persistAdd(fields) {
  if (!isConfigured) return demoStore.addHairProduct(fields);
  const { data, error } = await supabase
    .from("hair_products")
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) {
    console.error("Failed to add hair product:", error);
    return null;
  }
  return data;
}

function render() {
  emptyNote.hidden = products.length > 0;
  listEl.innerHTML = products
    .map((p) => {
      const repeatClass = p.repurchase === "Yes" ? "repeat-yes" : p.repurchase === "Maybe" ? "repeat-maybe" : "repeat-no";
      return `
      <a class="card-row clickable" href="hair-product.html?id=${encodeURIComponent(p.id)}" style="display:block; text-decoration:none; color:inherit;">
        <div class="card-title">${p.favorite ? "★ " : ""}${escapeHtml(p.name)}</div>
        <div class="card-sub">${escapeHtml(p.category || "")}${p.brand ? " · " + escapeHtml(p.brand) : ""}</div>
        ${p.repurchase ? `<div class="card-meta-row"><span class="tag ${repeatClass}">Repurchase: ${escapeHtml(p.repurchase)}</span></div>` : ""}
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
    notes: notesInput.value.trim() || null,
    favorite: favoriteInput.checked,
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
