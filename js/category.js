// A Maintenance category board (e.g. Hair): four sections, each a
// reorderable list of short text entries you add/edit/delete yourself —
// no scheduling, streaks, or history. One generic page for every category;
// which one to show comes from ?id= (see js/maintenanceAreas.js).
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { getMaintenanceArea } from "./maintenanceAreas.js";

const params = new URLSearchParams(window.location.search);
const categoryKey = params.get("id");
const area = categoryKey ? getMaintenanceArea(categoryKey) : null;

const iconEl = document.getElementById("category-icon");
const nameEl = document.getElementById("category-name");
const boardMount = document.getElementById("maintenance-board-mount");

const modal = document.getElementById("item-modal");
const modalTitleEl = document.getElementById("item-modal-title");
const itemForm = document.getElementById("item-form");
const titleInput = document.getElementById("item-title");
const bodyInput = document.getElementById("item-body");
const urlInput = document.getElementById("item-url");
const deleteBtn = document.getElementById("delete-item-btn");
const cancelBtn = document.getElementById("cancel-item");
const saveBtn = document.getElementById("save-item-btn");

const SECTIONS = [
  { key: "care", label: "Care", icon: "list-checks" },
  { key: "learn", label: "Learn / Links", icon: "sparkles" },
  { key: "products", label: "Products", icon: "package" },
  { key: "what_i_know", label: "What I Know", icon: "scroll-text" },
];

const sectionControllers = new Map();
let currentUserId = null;
let editingItem = null;
let modalSection = null;

async function fetchItems(category) {
  if (!isConfigured) return demoStore.listMaintenanceItems(category);
  const { data, error } = await supabase
    .from("maintenance_items")
    .select("*")
    .eq("category", category)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Failed to load maintenance items:", error);
    return [];
  }
  return data;
}

async function persistReorder(sectionKey, items) {
  if (!isConfigured) {
    demoStore.reorderMaintenanceItems(categoryKey, sectionKey, items.map((i) => i.id));
    return;
  }
  try {
    await Promise.all(
      items.map((item, index) =>
        supabase.from("maintenance_items").update({ sort_order: index }).eq("id", item.id)
      )
    );
  } catch (error) {
    console.error("Failed to save new order:", error);
  }
}

function makeSectionController(sectionKey, listEl) {
  const state = { items: [], nodeById: new Map() };
  let drag = null;

  function rowEl(item) {
    const el = document.createElement("div");
    el.className = "maint-row";
    el.dataset.id = item.id;
    el.innerHTML = `
      <div class="maint-row-text">
        <div class="maint-row-title"></div>
        ${item.body ? `<div class="maint-row-note"></div>` : ""}
      </div>
      ${item.url ? `<span class="maint-row-link">${iconMarkup("external-link")}</span>` : ""}
      <button type="button" class="maint-row-edit" aria-label="Edit">${iconMarkup("pencil")}</button>
    `;
    el.querySelector(".maint-row-title").textContent = item.title;
    if (item.body) el.querySelector(".maint-row-note").textContent = item.body;
    el.addEventListener("pointerdown", (e) => onPointerDown(e, item));

    const editBtn = el.querySelector(".maint-row-edit");
    editBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal(item, sectionKey);
    });

    return el;
  }

  function render() {
    for (const [id, el] of state.nodeById) {
      if (!state.items.some((item) => item.id === id)) {
        el.remove();
        state.nodeById.delete(id);
      }
    }
    for (const item of state.items) {
      let el = state.nodeById.get(item.id);
      if (!el) {
        el = rowEl(item);
        state.nodeById.set(item.id, el);
      }
      listEl.appendChild(el);
    }
  }

  function flip(mutate) {
    const before = new Map(
      Array.from(listEl.children).map((el) => [el, el.getBoundingClientRect()])
    );
    mutate();
    for (const el of listEl.children) {
      if (el.classList.contains("is-dragging")) continue;
      const b = before.get(el);
      if (!b) continue;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      if (dx || dy) {
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.22s cubic-bezier(.2,.8,.2,1)";
          el.style.transform = "";
        });
      }
    }
  }

  function onPointerDown(e, item) {
    if (e.button !== undefined && e.button > 0) return;
    const el = state.nodeById.get(item.id);
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    drag = {
      pointerId: e.pointerId,
      item,
      el,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      height: rect.height,
      dragging: false,
    };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.dragging) {
      if (Math.hypot(dx, dy) < 16) return;
      drag.dragging = true;
      drag.el.classList.add("is-dragging");
      drag.el.style.position = "fixed";
      drag.el.style.width = `${drag.width}px`;
      drag.el.style.height = `${drag.height}px`;
      drag.el.style.margin = "0";
    }

    drag.el.style.left = `${drag.originLeft + dx}px`;
    drag.el.style.top = `${drag.originTop + dy}px`;

    drag.el.style.pointerEvents = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    drag.el.style.pointerEvents = "";
    const targetRow = under && under.closest(".maint-row");
    if (targetRow && targetRow !== drag.el && listEl.contains(targetRow)) {
      const targetItem = state.items.find((i) => i.id === targetRow.dataset.id);
      const from = state.items.indexOf(drag.item);
      const to = state.items.indexOf(targetItem);
      if (from !== -1 && to !== -1 && from !== to) {
        flip(() => {
          state.items.splice(from, 1);
          state.items.splice(to, 0, drag.item);
          render();
        });
      }
    }
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { el, item, dragging } = drag;
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }

    if (dragging) {
      el.classList.remove("is-dragging");
      el.style.position = "";
      el.style.width = "";
      el.style.height = "";
      el.style.left = "";
      el.style.top = "";
      el.style.margin = "";
      flip(() => render());
      persistReorder(sectionKey, state.items);
    } else if (item.url) {
      // Rows with a link open it — that's the point of the Learn/Links
      // section. Editing still works via the pencil button on the row.
      window.open(item.url, "_blank", "noopener,noreferrer");
    } else {
      openEditModal(item, sectionKey);
    }
    drag = null;
  }

  return {
    state,
    setItems(items) {
      state.items = items;
      render();
    },
    refresh(id) {
      const el = state.nodeById.get(id);
      if (el) {
        el.remove();
        state.nodeById.delete(id);
      }
      render();
    },
  };
}

function buildBoard() {
  boardMount.innerHTML = "";
  for (const section of SECTIONS) {
    const sectionEl = document.createElement("div");
    sectionEl.className = "maint-section";
    sectionEl.innerHTML = `
      <div class="maint-section-head">
        <span class="maint-sec-icon">${iconMarkup(section.icon)}</span>
        <h2>${section.label}</h2>
      </div>
      <div class="maint-row-list"></div>
      <div class="maint-add-row"><span class="add-icon">+</span> Add to ${section.label}</div>
    `;
    boardMount.appendChild(sectionEl);

    const listEl = sectionEl.querySelector(".maint-row-list");
    sectionControllers.set(section.key, makeSectionController(section.key, listEl));
    sectionEl
      .querySelector(".maint-add-row")
      .addEventListener("click", () => openAddModal(section.key));
  }
}

async function loadItems() {
  const all = await fetchItems(categoryKey);
  for (const section of SECTIONS) {
    const items = all
      .filter((item) => item.section === section.key)
      .sort((a, b) => a.sort_order - b.sort_order);
    sectionControllers.get(section.key).setItems(items);
  }
}

function openAddModal(sectionKey) {
  editingItem = null;
  modalSection = sectionKey;
  modalTitleEl.textContent = `Add to ${SECTIONS.find((s) => s.key === sectionKey).label}`;
  saveBtn.textContent = "Add";
  deleteBtn.hidden = true;
  titleInput.value = "";
  bodyInput.value = "";
  urlInput.value = "";
  modal.classList.add("open");
  titleInput.focus();
}

function openEditModal(item, sectionKey) {
  editingItem = item;
  modalSection = sectionKey;
  modalTitleEl.textContent = "Edit item";
  saveBtn.textContent = "Save";
  deleteBtn.hidden = false;
  titleInput.value = item.title || "";
  bodyInput.value = item.body || "";
  urlInput.value = item.url || "";
  modal.classList.add("open");
}

function closeModal() {
  modal.classList.remove("open");
}

cancelBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  if (!title) return;
  const body = bodyInput.value.trim() || null;
  const url = urlInput.value.trim() || null;
  const controller = sectionControllers.get(modalSection);

  if (editingItem) {
    let data;
    if (isConfigured) {
      const { data: updated, error } = await supabase
        .from("maintenance_items")
        .update({ title, body, url })
        .eq("id", editingItem.id)
        .select()
        .single();
      if (error) {
        console.error("Failed to update item:", error);
        alert("Could not save changes.");
        return;
      }
      data = updated;
    } else {
      data = demoStore.updateMaintenanceItem(editingItem.id, { title, body, url });
    }
    Object.assign(editingItem, data);
    controller.refresh(editingItem.id);
  } else {
    let data;
    if (isConfigured) {
      const { data: inserted, error } = await supabase
        .from("maintenance_items")
        .insert({
          user_id: currentUserId,
          category: categoryKey,
          section: modalSection,
          title,
          body,
          url,
          sort_order: controller.state.items.length,
        })
        .select()
        .single();
      if (error) {
        console.error("Failed to add item:", error);
        alert("Could not add item.");
        return;
      }
      data = inserted;
    } else {
      data = demoStore.addMaintenanceItem({
        category: categoryKey,
        section: modalSection,
        title,
        body,
        url,
      });
    }
    controller.setItems([...controller.state.items, data]);
  }

  closeModal();
});

deleteBtn.addEventListener("click", async () => {
  if (!editingItem) return;
  if (!confirm(`Delete "${editingItem.title}"? This cannot be undone.`)) return;

  if (isConfigured) {
    const { error } = await supabase.from("maintenance_items").delete().eq("id", editingItem.id);
    if (error) {
      console.error("Failed to delete item:", error);
      alert("Could not delete item.");
      return;
    }
  } else {
    demoStore.deleteMaintenanceItem(editingItem.id);
  }

  const controller = sectionControllers.get(modalSection);
  controller.setItems(controller.state.items.filter((item) => item.id !== editingItem.id));
  closeModal();
});

(async function init() {
  if (!area || !area.real) {
    window.location.href = "maintenance.html";
    return;
  }

  iconEl.dataset.color = area.color;
  iconEl.innerHTML = iconMarkup(area.icon);
  nameEl.textContent = area.name;
  document.title = `${area.name} — InertiaADHD`;

  buildBoard();

  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    currentUserId = session.user.id;
  }

  await loadItems();
})();
