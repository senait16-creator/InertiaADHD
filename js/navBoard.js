// Navigation-hub workspace: a flat set of panels for a project with
// workspace_type === 'nav'. Three kinds:
//   - 'link'   opens an external URL in a new tab
//   - 'folder' opens another screen of panels (client-side, no page
//              reload) — for when a project's structure genuinely needs
//              nesting
//   - 'status' doesn't navigate anywhere; tapping it cycles its own
//              status instead (not started -> in progress, yellow ->
//              waiting, blue -> complete, green -> not started), the
//              same tap-to-advance idea as the routine board. This is
//              how a project's own status shows up, as one panel among
//              its others rather than a separate component.
// Used by project.js. Deliberately no task lists or notes beyond that —
// this is pure navigation plus one status panel, not a workspace with
// its own features. See supabase/seed_fidel_classroom.sql for the first
// real example of this structure.
import { supabase, isConfigured } from "./supabaseClient.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function nextStatus(status) {
  if (status === "in_progress") return "waiting";
  if (status === "waiting") return "complete";
  if (status === "complete") return null;
  return "in_progress";
}

async function fetchNavItems(projectId) {
  if (!isConfigured) return demoStore.listNavItems(projectId);

  const { data, error } = await supabase
    .from("nav_items")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load nav items:", error);
    return [];
  }
  return data;
}

async function persistStatus(item) {
  if (!isConfigured) {
    demoStore.setNavItemStatus(item.id, item.status);
    return;
  }
  try {
    await supabase.from("nav_items").update({ status: item.status }).eq("id", item.id);
  } catch (error) {
    console.error("Failed to save panel status:", error);
  }
}

export async function initNavBoard(container, project) {
  const items = await fetchNavItems(project.id);

  const childrenByParent = new Map();
  for (const item of items) {
    const key = item.parent_id || "root";
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(item);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  const board = document.createElement("div");
  board.className = "nav-board";
  container.appendChild(board);

  const stack = [];

  function currentChildren() {
    const key = stack.length ? stack[stack.length - 1].id : "root";
    return childrenByParent.get(key) || [];
  }

  function updatePanelClasses(el, item) {
    el.classList.toggle("is-inprogress", item.status === "in_progress");
    el.classList.toggle("is-waiting", item.status === "waiting");
    el.classList.toggle("is-complete", item.status === "complete");
  }

  function panelEl(item) {
    const isLink = item.kind === "link";
    const isStatus = item.kind === "status";
    const el = document.createElement(isLink ? "a" : "button");
    el.className = "nav-panel";
    el.dataset.color = item.color || "sage";

    if (isLink) {
      el.href = item.url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    } else {
      el.type = "button";
    }

    el.innerHTML = `
      <div class="icon-badge" data-color="${escapeHtml(item.color || "sage")}">${iconMarkup(item.icon || "folder")}</div>
      <div class="nav-panel-title">${escapeHtml(item.title)}</div>
      ${isStatus ? "" : `<span class="nav-panel-arrow">›</span>`}
    `;

    if (isStatus) {
      updatePanelClasses(el, item);
      el.addEventListener("click", () => {
        item.status = nextStatus(item.status);
        updatePanelClasses(el, item);
        persistStatus(item);
      });
    } else if (!isLink) {
      el.addEventListener("click", () => {
        stack.push(item);
        render();
      });
    }

    return el;
  }

  function render() {
    board.innerHTML = "";

    if (stack.length > 0) {
      // Label with where it returns to, not just "Back" — there's already
      // a page-level "‹ Back" above this one (to the Projects list), so an
      // identical second label right below it would read as a duplicate.
      const backLabel = stack.length > 1 ? stack[stack.length - 2].title : project.name;
      const back = document.createElement("button");
      back.type = "button";
      back.className = "back-link nav-back";
      back.textContent = `‹ ${backLabel}`;
      back.addEventListener("click", () => {
        stack.pop();
        render();
      });
      board.appendChild(back);
    }

    const grid = document.createElement("div");
    grid.className = "nav-panel-grid";
    for (const item of currentChildren()) {
      grid.appendChild(panelEl(item));
    }
    board.appendChild(grid);
  }

  render();
}
