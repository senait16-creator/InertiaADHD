// Routine Insights — reflection, not motivation. This page only reads
// history (see supabase/routine_completions, logged by
// js/routineBoard.js's recordCompletion); it never writes anything, and
// the routine board itself never reads from here. Deliberately no
// streaks, badges, progress rings, giant percentages, or "missed day"
// warnings — just plain counts, averages, and a few small charts, in
// the app's own muted palette (one accent hue, not a rainbow per item)
// so nothing reads as a score to win or lose.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import * as demoStore from "./demoStore.js";
import { iconMarkup } from "./lucideIcons.js";
import { DEFAULT_COLOR } from "./colors.js";

const tabsEl = document.getElementById("filter-tabs");
const emptyEl = document.getElementById("insights-empty");
const sectionsEl = document.getElementById("insights-sections");

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// ---------------- Date/bucket helpers (all local time) ----------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function startOfWeek(d) {
  const s = startOfDay(d);
  return addDays(s, -s.getDay());
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

function addYears(d, n) {
  return new Date(d.getFullYear() + n, 0, 1);
}

function dayKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dayLabel(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekKey(d) {
  return dayKey(startOfWeek(d));
}

function weekLabel(d) {
  return startOfWeek(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function monthKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthLabel(d) {
  return d.toLocaleDateString(undefined, { month: "short" });
}

function yearKey(d) {
  return `${d.getFullYear()}`;
}

const FILTERS = {
  days: { bucketCount: 14, start: (now, i) => addDays(startOfDay(now), -i), key: dayKey, bucketLabel: dayLabel },
  weeks: {
    bucketCount: 8,
    start: (now, i) => addDays(startOfWeek(now), -i * 7),
    key: weekKey,
    bucketLabel: weekLabel,
  },
  months: {
    bucketCount: 12,
    start: (now, i) => addMonths(startOfMonth(now), -i),
    key: monthKey,
    bucketLabel: monthLabel,
  },
  years: { bucketCount: 3, start: (now, i) => addYears(startOfYear(now), -i), key: yearKey, bucketLabel: yearKey },
};

function buildBuckets(filterName) {
  const cfg = FILTERS[filterName];
  const now = new Date();
  const buckets = [];
  for (let i = cfg.bucketCount - 1; i >= 0; i--) {
    const date = cfg.start(now, i);
    buckets.push({ date, key: cfg.key(date), label: cfg.bucketLabel(date) });
  }
  return buckets;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatMinutesAsClock(totalMinutes) {
  if (totalMinutes == null) return null;
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${pad2(m)} ${period}`;
}

function formatMinutesDuration(totalMinutes) {
  if (totalMinutes == null) return null;
  const mins = Math.round(totalMinutes);
  if (mins < 1) return "under a min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---------------- Data fetching ----------------

async function fetchRoutineProjects(userId) {
  const all = isConfigured
    ? await (async () => {
        const { data, error } = await supabase.from("projects").select("*").eq("user_id", userId);
        if (error) {
          console.error("Failed to load projects:", error);
          return [];
        }
        return data;
      })()
    : demoStore.listProjects();
  return all.filter((p) => p.workspace_type === "routine");
}

async function fetchAllSteps(projectIds) {
  if (!isConfigured) {
    return demoStore.listAllSteps().filter((s) => projectIds.includes(s.project_id));
  }
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase.from("routine_steps").select("*").in("project_id", projectIds);
  if (error) {
    console.error("Failed to load routine steps:", error);
    return [];
  }
  return data;
}

async function fetchCompletions(userId) {
  if (!isConfigured) return demoStore.listRoutineCompletions();
  const { data, error } = await supabase
    .from("routine_completions")
    .select("*")
    .eq("user_id", userId)
    .order("completed_at", { ascending: true });
  if (error) {
    console.error("Failed to load routine completions:", error);
    return [];
  }
  return data;
}

// ---------------- Charts — plain SVG, one hue, no build step ----------------
// Single accent hue (sequential "more is more", not identity), a hairline
// baseline instead of a full axis, and a native <title> per bar for the
// value on hover/tap rather than labeling every bar inline.

function barChartSvg(buckets, counts) {
  const values = buckets.map((b) => counts.get(b.key) || 0);
  const max = Math.max(1, ...values);
  const height = 56;
  const barWidth = Math.max(6, Math.min(22, Math.floor(260 / buckets.length) - 4));
  const gap = 4;
  const width = buckets.length * (barWidth + gap);
  const bars = buckets
    .map((b, i) => {
      const v = counts.get(b.key) || 0;
      const h = v === 0 ? 2 : Math.max(4, Math.round((v / max) * (height - 6)));
      const x = i * (barWidth + gap);
      const y = height - h;
      const opacity = v === 0 ? 0.14 : 0.8;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="3" fill="var(--accent)" opacity="${opacity}"><title>${escapeHtml(b.label)}: ${v}</title></rect>`;
    })
    .join("");
  return `<svg class="insight-chart" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" role="img" aria-label="Trend over time">${bars}<line x1="0" y1="${height - 0.5}" x2="${width}" y2="${height - 0.5}" stroke="var(--border)" stroke-width="1" /></svg>`;
}

function sparklineSvg(buckets, counts) {
  const values = buckets.map((b) => counts.get(b.key) || 0);
  const max = Math.max(1, ...values);
  const height = 32;
  const width = 90;
  const step = buckets.length > 1 ? width / (buckets.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - 3 - (v / max) * (height - 8);
    return [x, y];
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return `<svg class="insight-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" role="img" aria-label="Trend over time"><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" /><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5" fill="var(--accent)" /></svg>`;
}

// ---------------- Aggregation ----------------

function computeOverall(project, completions, steps, buckets, bucketKeyFn, rangeStart) {
  const projectStepIds = new Set(steps.filter((s) => s.project_id === project.id).map((s) => s.id));
  const projectCompletions = completions.filter(
    (c) => c.project_id === project.id && new Date(c.completed_at) >= rangeStart
  );

  const byDay = new Map();
  for (const c of projectCompletions) {
    const d = new Date(c.completed_at);
    const key = dayKey(d);
    if (!byDay.has(key)) byDay.set(key, { stepIds: new Set(), times: [] });
    const entry = byDay.get(key);
    entry.stepIds.add(c.step_id);
    entry.times.push(d);
  }

  let fullDays = 0;
  const startMinutes = [];
  const endMinutes = [];
  const durationsMin = [];
  const bucketCounts = new Map(buckets.map((b) => [b.key, 0]));

  for (const entry of byDay.values()) {
    const isFull = projectStepIds.size > 0 && [...projectStepIds].every((id) => entry.stepIds.has(id));
    const sorted = entry.times.slice().sort((a, b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (isFull) {
      fullDays++;
      const bKey = bucketKeyFn(first);
      if (bucketCounts.has(bKey)) bucketCounts.set(bKey, bucketCounts.get(bKey) + 1);
    }

    startMinutes.push(first.getHours() * 60 + first.getMinutes());
    endMinutes.push(last.getHours() * 60 + last.getMinutes());
    if (sorted.length >= 2) durationsMin.push((last - first) / 60000);
  }

  const totalDays = Math.floor((startOfDay(new Date()) - rangeStart) / 86400000) + 1;

  return {
    project,
    fullDays,
    totalDays,
    avgStartMinutes: average(startMinutes),
    avgEndMinutes: average(endMinutes),
    avgDurationMinutes: average(durationsMin),
    bucketCounts,
  };
}

function computeItemStats(completions, buckets, bucketKeyFn, rangeStart, projects) {
  const inRange = completions.filter((c) => new Date(c.completed_at) >= rangeStart);
  const groups = new Map();

  for (const c of inRange) {
    const key = `${c.project_id}::${c.step_name}`;
    if (!groups.has(key)) {
      groups.set(key, { projectId: c.project_id, stepName: c.step_name, icon: c.icon, color: c.color, rows: [] });
    }
    groups.get(key).rows.push(c);
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const items = [];

  for (const group of groups.values()) {
    const rows = group.rows;
    const timesMinutes = rows.map((r) => {
      const d = new Date(r.completed_at);
      return d.getHours() * 60 + d.getMinutes();
    });
    const durations = rows.filter((r) => r.duration_seconds != null).map((r) => r.duration_seconds / 60);
    const bucketCounts = new Map(buckets.map((b) => [b.key, 0]));
    for (const r of rows) {
      const bKey = bucketKeyFn(new Date(r.completed_at));
      if (bucketCounts.has(bKey)) bucketCounts.set(bKey, bucketCounts.get(bKey) + 1);
    }

    items.push({
      projectId: group.projectId,
      projectName: projectById.get(group.projectId)?.name || "",
      stepName: group.stepName,
      icon: group.icon,
      color: group.color || DEFAULT_COLOR,
      count: rows.length,
      avgCompletionMinutes: average(timesMinutes),
      avgDurationMinutes: durations.length ? average(durations) : null,
      shortestDurationMinutes: durations.length ? Math.min(...durations) : null,
      longestDurationMinutes: durations.length ? Math.max(...durations) : null,
      totalDurationMinutes: durations.length ? durations.reduce((a, b) => a + b, 0) : null,
      bucketCounts,
    });
  }

  items.sort((a, b) => b.count - a.count);
  return items;
}

// A few plain-language observations — "little observations about your
// life," never a score. Each one only appears when there's enough data
// behind it (see the thresholds below), so a fresh routine doesn't get
// a sentence built on two data points.
function computeRoutineFlow(overallList, itemList, completions, rangeStart) {
  const sentences = [];

  for (const o of overallList) {
    if (o.fullDays >= 3 && o.avgStartMinutes != null && o.avgDurationMinutes != null) {
      sentences.push(
        `Your average ${o.project.name.toLowerCase()} starts at ${formatMinutesAsClock(
          o.avgStartMinutes
        )} and takes ${formatMinutesDuration(o.avgDurationMinutes)}.`
      );
    }
  }

  const totalDays = Math.floor((startOfDay(new Date()) - rangeStart) / 86400000) + 1;
  if (totalDays >= 7) {
    let best = null;
    for (const item of itemList) {
      const rate = item.count / totalDays;
      if (rate > 1) continue;
      if (!best || rate > best.rate) best = { item, rate };
    }
    if (best && best.rate >= 0.5) {
      const pct = Math.round(best.rate * 100);
      const routineLabel = (best.item.projectName || "routine").toLowerCase();
      sentences.push(
        pct >= 97
          ? `You complete ${best.item.stepName} on nearly every ${routineLabel} day.`
          : `You complete ${best.item.stepName} on ${pct}% of ${routineLabel} days.`
      );
    }
  }

  const byProjectDay = new Map();
  for (const c of completions) {
    if (new Date(c.completed_at) < rangeStart) continue;
    const pKey = c.project_id;
    if (!byProjectDay.has(pKey)) byProjectDay.set(pKey, new Map());
    const days = byProjectDay.get(pKey);
    const dKey = dayKey(new Date(c.completed_at));
    if (!days.has(dKey)) days.set(dKey, []);
    days.get(dKey).push(c);
  }

  let bestPair = null;
  for (const days of byProjectDay.values()) {
    const names = new Set();
    for (const rows of days.values()) for (const r of rows) names.add(r.step_name);
    const nameList = [...names];
    for (const a of nameList) {
      for (const b of nameList) {
        if (a === b) continue;
        let coOccur = 0;
        let aBeforeB = 0;
        for (const rows of days.values()) {
          const aRow = rows.find((r) => r.step_name === a);
          const bRow = rows.find((r) => r.step_name === b);
          if (aRow && bRow) {
            coOccur++;
            if (new Date(aRow.completed_at) < new Date(bRow.completed_at)) aBeforeB++;
          }
        }
        if (coOccur >= 5) {
          const consistency = aBeforeB / coOccur;
          if (
            consistency >= 0.8 &&
            (!bestPair || consistency > bestPair.consistency || (consistency === bestPair.consistency && coOccur > bestPair.coOccur))
          ) {
            bestPair = { a, b, consistency, coOccur };
          }
        }
      }
    }
  }
  if (bestPair) {
    sentences.push(`You almost always complete ${bestPair.a} before ${bestPair.b}.`);
  }

  return sentences;
}

// ---------------- Rendering ----------------

function routineFlowSectionHtml(sentences) {
  return `
    <section class="insight-section">
      <h2>Routine Flow</h2>
      ${sentences.map((s) => `<div class="flow-card">${escapeHtml(s)}</div>`).join("")}
    </section>
  `;
}

function overallSectionHtml(overallList, buckets) {
  const cards = overallList
    .map((o) => {
      const chart = barChartSvg(buckets, o.bucketCounts);
      return `
        <div class="overall-card">
          <h3>${escapeHtml(o.project.name)}</h3>
          <div class="overall-stats">
            <div>
              <div class="overall-stat-label">Completed</div>
              <div class="overall-stat-value">${o.fullDays} of ${o.totalDays} days</div>
            </div>
            <div>
              <div class="overall-stat-label">Average duration</div>
              <div class="overall-stat-value">${formatMinutesDuration(o.avgDurationMinutes) || "—"}</div>
            </div>
            <div>
              <div class="overall-stat-label">Average start time</div>
              <div class="overall-stat-value">${formatMinutesAsClock(o.avgStartMinutes) || "—"}</div>
            </div>
            <div>
              <div class="overall-stat-label">Average completion time</div>
              <div class="overall-stat-value">${formatMinutesAsClock(o.avgEndMinutes) || "—"}</div>
            </div>
          </div>
          ${chart}
        </div>
      `;
    })
    .join("");

  return `
    <section class="insight-section">
      <h2>Overall</h2>
      ${cards}
    </section>
  `;
}

function itemsSectionHtml(itemList, buckets, showProjectName) {
  const rows = itemList
    .map((item) => {
      const metaParts = [`${item.count}×`];
      if (item.avgCompletionMinutes != null) {
        metaParts.push(`avg ${formatMinutesAsClock(item.avgCompletionMinutes)}`);
      }
      if (item.avgDurationMinutes != null) {
        metaParts.push(`avg ${formatMinutesDuration(item.avgDurationMinutes)}`);
      }
      return `
        <div class="item-row">
          <div class="icon-badge" data-color="${escapeHtml(item.color)}">${iconMarkup(item.icon || "folder")}</div>
          <div class="item-info">
            <div class="item-name">${escapeHtml(item.stepName)}</div>
            ${showProjectName ? `<div class="item-project">${escapeHtml(item.projectName)}</div>` : ""}
            <div class="item-meta">${metaParts.join(" · ")}</div>
          </div>
          <div class="item-chart">${sparklineSvg(buckets, item.bucketCounts)}</div>
        </div>
      `;
    })
    .join("");

  return `
    <section class="insight-section">
      <h2>Individual Routine Items</h2>
      <div class="item-list">${rows}</div>
    </section>
  `;
}

function trackTimeSectionHtml(trackedItems) {
  const rows = trackedItems
    .map((item) => {
      return `
        <div class="item-row">
          <div class="icon-badge" data-color="${escapeHtml(item.color)}">${iconMarkup(item.icon || "clock")}</div>
          <div class="item-info">
            <div class="item-name">${escapeHtml(item.stepName)}</div>
            <div class="item-meta">
              avg ${formatMinutesDuration(item.avgDurationMinutes)} ·
              shortest ${formatMinutesDuration(item.shortestDurationMinutes)} ·
              longest ${formatMinutesDuration(item.longestDurationMinutes)}
            </div>
            <div class="item-meta">total ${formatMinutesDuration(item.totalDurationMinutes)} this range</div>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <section class="insight-section">
      <h2>Track Time</h2>
      <div class="item-list">${rows}</div>
    </section>
  `;
}

// ---------------- Init ----------------

let allCompletions = [];
let allSteps = [];
let routineProjects = [];
let currentFilter = "days";

function render() {
  const buckets = buildBuckets(currentFilter);
  const rangeStart = buckets[0].date;
  const bucketKeyFn = FILTERS[currentFilter].key;

  const hasAnyData = allCompletions.some((c) => new Date(c.completed_at) >= rangeStart);
  emptyEl.hidden = hasAnyData;
  if (!hasAnyData) {
    sectionsEl.innerHTML = "";
    return;
  }

  const namedRoutines = ["Morning Routine", "Night Routine"];
  const overallList = routineProjects
    .filter((p) => namedRoutines.includes(p.name))
    .map((p) => computeOverall(p, allCompletions, allSteps, buckets, bucketKeyFn, rangeStart))
    .filter((o) => o.totalDays > 0 && (o.fullDays > 0 || o.avgStartMinutes != null));

  const itemList = computeItemStats(allCompletions, buckets, bucketKeyFn, rangeStart, routineProjects);
  const trackedItems = itemList.filter((i) => i.avgDurationMinutes != null);
  const showProjectName = new Set(itemList.map((i) => i.projectId)).size > 1;
  const flowSentences = computeRoutineFlow(overallList, itemList, allCompletions, rangeStart);

  sectionsEl.innerHTML = [
    flowSentences.length ? routineFlowSectionHtml(flowSentences) : "",
    overallList.length ? overallSectionHtml(overallList, buckets) : "",
    itemList.length ? itemsSectionHtml(itemList, buckets, showProjectName) : "",
    trackedItems.length ? trackTimeSectionHtml(trackedItems) : "",
  ].join("");
}

function selectFilter(name) {
  currentFilter = name;
  for (const btn of tabsEl.querySelectorAll(".filter-tab")) {
    btn.setAttribute("aria-selected", String(btn.dataset.filter === name));
  }
  render();
}

tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-tab");
  if (btn) selectFilter(btn.dataset.filter);
});

(async function init() {
  let userId = null;
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
    userId = session.user.id;
  }

  routineProjects = await fetchRoutineProjects(userId);
  const projectIds = routineProjects.map((p) => p.id);
  [allSteps, allCompletions] = await Promise.all([fetchAllSteps(projectIds), fetchCompletions(userId)]);

  selectFilter("days");
})();
