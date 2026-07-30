// Relationships — a list of people, not a CRM. The point is noticing
// your relationship landscape and being intentional about it, not
// tracking "performance": no health scores, streaks, or overdue
// warnings anywhere here or on person.html. See js/relationshipOptions.js
// for the fixed option lists and the (quiet, non-judgmental) Reconnect
// heuristic.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { isReconnectCandidate, avatarColorFor } from "./relationshipOptions.js";

const filterScrollEl = document.getElementById("filter-scroll");
const listEl = document.getElementById("person-list");
const emptyNoteEl = document.getElementById("empty-note");
const addBtn = document.getElementById("add-person-btn");

const actionModal = document.getElementById("person-action-modal");
const actionMenuView = document.getElementById("action-menu-view");
const actionConfirmView = document.getElementById("action-confirm-view");
const actionMenuTitle = document.getElementById("action-menu-title");
const actionEditBtn = document.getElementById("action-edit-btn");
const actionDeleteBtn = document.getElementById("action-delete-btn");
const actionCancelBtn1 = document.getElementById("action-cancel-btn-1");
const actionCancelBtn2 = document.getElementById("action-cancel-btn-2");
const confirmText = document.getElementById("confirm-text");
const actionConfirmDeleteBtn = document.getElementById("action-confirm-delete-btn");

// Each test receives the person row; label is what shows on the chip.
// Reconnect is listed last and reuses the same isReconnectCandidate
// heuristic that also drives the quiet note under each matching card.
const FILTERS = [
  { label: "All", test: () => true },
  { label: "Core / Go-To", test: (p) => p.circle === "Core / Go-To" },
  { label: "Community", test: (p) => p.circle === "Community" },
  { label: "Growing", test: (p) => (p.season || []).includes("Growing") },
  { label: "Needs Tending", test: (p) => (p.season || []).includes("Needs Tending") },
  { label: "Reconciliation", test: (p) => (p.season || []).includes("Reconciliation") },
  { label: "Boundaries", test: (p) => (p.season || []).includes("Boundaries") },
  { label: "Occasional Check-ins", test: (p) => p.investment_intention === "Occasional Check-ins" },
  { label: "Reconnect", test: isReconnectCandidate },
];

let currentUserId = null;
let people = [];
let currentFilter = "All";
let actionTarget = null;

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function initials(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function formatLastConnection(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return `Last connected ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

async function fetchPeople(userId) {
  if (!isConfigured) return demoStore.listRelationships();
  const { data, error } = await supabase
    .from("relationships")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load relationships:", error);
    return [];
  }
  return data;
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_CANCEL_PX = 10;

function attachLongPress(el, person) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button > 0) return;
    fired = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      fired = true;
      timer = null;
      openActionMenu(person);

      const swallowRelease = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      window.addEventListener("pointerup", swallowRelease, { capture: true, once: true });
    }, LONG_PRESS_MS);
  });

  el.addEventListener("pointermove", (e) => {
    if (!timer) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > LONG_PRESS_CANCEL_PX) {
      clearTimer();
    }
  });

  el.addEventListener("pointerup", clearTimer);
  el.addEventListener("pointercancel", clearTimer);
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  el.addEventListener("click", (e) => {
    if (fired) {
      e.preventDefault();
      fired = false;
    }
  });
}

function openActionMenu(person) {
  actionTarget = person;
  actionMenuTitle.textContent = person.name;
  actionMenuView.hidden = false;
  actionConfirmView.hidden = true;
  actionModal.classList.add("open");
}

function closeActionModal() {
  actionModal.classList.remove("open");
  actionTarget = null;
}

actionCancelBtn1.addEventListener("click", closeActionModal);
actionCancelBtn2.addEventListener("click", closeActionModal);
actionModal.addEventListener("click", (e) => {
  if (e.target === actionModal) closeActionModal();
});

actionEditBtn.addEventListener("click", () => {
  if (!actionTarget) return;
  window.location.href = `person.html?id=${encodeURIComponent(actionTarget.id)}`;
});

actionDeleteBtn.addEventListener("click", () => {
  if (!actionTarget) return;
  confirmText.textContent = `Delete "${actionTarget.name}"?`;
  actionMenuView.hidden = true;
  actionConfirmView.hidden = false;
});

actionConfirmDeleteBtn.addEventListener("click", async () => {
  if (!actionTarget) return;
  const { id } = actionTarget;

  if (isConfigured) {
    const { error } = await supabase.from("relationships").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete person:", error);
      alert("Could not delete this person.");
      return;
    }
  } else {
    demoStore.deleteRelationship(id);
  }

  people = people.filter((p) => p.id !== id);
  closeActionModal();
  render();
});

function personCardEl(person) {
  const link = document.createElement("a");
  link.className = "person-card";
  link.href = `person.html?id=${encodeURIComponent(person.id)}`;

  const season = (person.season || []).slice(0, 2);
  const metaParts = [person.circle, person.investment_intention].filter(Boolean);
  const lastConnection = formatLastConnection(person.last_connection_at);

  link.innerHTML = `
    <div class="person-avatar" data-color="${avatarColorFor(person.id)}">${escapeHtml(initials(person.name))}</div>
    <div class="person-info">
      <div class="person-name">${escapeHtml(person.name)}</div>
      ${metaParts.length ? `<div class="person-meta">${escapeHtml(metaParts.join(" · "))}</div>` : ""}
      ${season.length ? `<div class="person-tags">${season.map((s) => `<span class="person-tag">${escapeHtml(s)}</span>`).join("")}</div>` : ""}
      ${lastConnection ? `<div class="person-meta">${escapeHtml(lastConnection)}</div>` : ""}
      ${
        currentFilter === "Reconnect"
          ? `<div class="reconnect-note">You haven't had a meaningful connection with ${escapeHtml(person.name)} in a while.</div>`
          : ""
      }
    </div>
  `;
  attachLongPress(link, person);
  return link;
}

function render() {
  const activeFilter = FILTERS.find((f) => f.label === currentFilter) || FILTERS[0];
  const filtered = people.filter(activeFilter.test);

  listEl.innerHTML = "";
  for (const person of filtered) {
    listEl.appendChild(personCardEl(person));
  }
  emptyNoteEl.hidden = filtered.length > 0;
  emptyNoteEl.textContent =
    currentFilter === "Reconnect"
      ? "Nobody to gently reconnect with right now."
      : currentFilter === "All"
        ? "Nobody here yet."
        : "Nobody matches this filter.";
}

function renderFilters() {
  filterScrollEl.innerHTML = FILTERS.map(
    (f) =>
      `<button type="button" class="filter-chip" data-label="${escapeHtml(f.label)}" role="tab" aria-pressed="${f.label === currentFilter}">${escapeHtml(f.label)}</button>`
  ).join("");
}

filterScrollEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-chip");
  if (!btn) return;
  currentFilter = btn.dataset.label;
  for (const chip of filterScrollEl.querySelectorAll(".filter-chip")) {
    chip.setAttribute("aria-pressed", String(chip.dataset.label === currentFilter));
  }
  render();
});

addBtn.addEventListener("click", () => {
  window.location.href = "person.html";
});

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    currentUserId = session.user.id;
  }

  people = await fetchPeople(currentUserId);
  renderFilters();
  render();
})();
