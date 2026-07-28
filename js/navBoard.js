// Navigation-hub workspace: a tree of folder/link panels for a project
// with workspace_type === 'nav'. A 'folder' item opens another screen of
// panels (client-side, no page reload); a 'link' item opens an external
// URL in a new tab. Used by project.js. Deliberately no task lists,
// notes, or progress tracking — this is pure navigation, not a workspace
// with its own features. See supabase/seed_fidel_classroom.sql for the
// first real example of this structure.
import { supabase, isConfigured } from "./supabaseClient.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
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

  function panelEl(item) {
    const isLink = item.kind === "link";
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
      <span class="nav-panel-arrow">›</span>
    `;

    if (!isLink) {
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
