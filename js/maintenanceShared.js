// Shared pieces across the generic Maintenance product/routine pages
// (js/maintenanceHome.js and friends) — and reused by the Hair Lab's
// own product page (js/hairProduct.js) too, since Estimated Duration and
// Estimated Monthly Cost are computed the same way regardless of which
// area an inventory item/purchase belongs to. Kept separate from
// js/hairShared.js, which is scoped to Hair's own experimentation
// vocabulary (SECTIONS, MOISTURE, DRYING, ...).

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// Single or multi-select chip group — identical contract to
// initChipGroup in js/hairShared.js, copied rather than imported so this
// module has no dependency on Hair's file.
export function initChipGroup(container, options, { multi }) {
  container.innerHTML = options
    .map(
      (opt) =>
        `<button type="button" class="chip" data-value="${escapeHtml(opt)}" role="${multi ? "checkbox" : "radio"}" aria-checked="false">${escapeHtml(opt)}</button>`
    )
    .join("");

  const buttons = Array.from(container.querySelectorAll(".chip"));
  let selected = multi ? new Set() : null;

  function refresh() {
    for (const btn of buttons) {
      const isSelected = multi ? selected.has(btn.dataset.value) : selected === btn.dataset.value;
      btn.setAttribute("aria-checked", String(isSelected));
    }
  }

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const value = btn.dataset.value;
    if (multi) {
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
    } else {
      selected = selected === value ? null : value;
    }
    refresh();
  });

  return {
    get: () => (multi ? Array.from(selected) : selected),
    set: (value) => {
      selected = multi ? new Set(value || []) : value || null;
      refresh();
    },
  };
}

// The areas that use the generic Inventory/Maintenance system —
// including Hair now: Maintenance -> Hair Care is just
// maintenance-home.html?area=hair like any other area, and Hair
// Lab's own Products panel reads the same Inventory items filtered to
// area "hair". `inventoryLabel` differs slightly from `label` where the
// natural English name isn't the same on both sides (e.g. Inventory's
// "Nail Supplies" vs Maintenance's "Nail Care") — same area key either
// way, just a per-context display string. Tech and Digital have full
// Maintenance tiles too (an Active Routine can be "update firmware,
// back up, wipe old accounts" just as much as "cleanse, tone,
// moisturize" — the generic system doesn't care what's in it). Shoes is
// the one Inventory-only area (no Maintenance tile in
// js/maintenanceAreas.js) — it's "what do I own," not something with a
// care routine, so `label` here is just a fallback in case a usage
// record ever references it.
export const AREAS = {
  hair: { label: "Hair Care", inventoryLabel: "Hair Products", icon: "crown", color: "lavender" },
  skin: { label: "Skin Care", inventoryLabel: "Skin Care", icon: "droplets", color: "blue" },
  body: { label: "Body Care", inventoryLabel: "Body Care", icon: "dumbbell", color: "sage" },
  nail: { label: "Nail Care", inventoryLabel: "Nail Supplies", icon: "sparkles", color: "green" },
  jewelry: { label: "Jewelry", inventoryLabel: "Jewelry", icon: "award", color: "lavender" },
  tech: { label: "Tech", inventoryLabel: "Tech", icon: "monitor", color: "blue" },
  digital: { label: "Digital", inventoryLabel: "Digital", icon: "cloud", color: "sage" },
  shoes: { label: "Shoes", inventoryLabel: "Shoes", icon: "footprints", color: "amber" },
};

const MS_PER_DAY = 86400000;
const DAYS_PER_MONTH = 30.44;

// Only returns a value once a purchase has a full start-to-finish life
// to measure — an in-progress purchase's eventual duration isn't known
// yet, and guessing would be dishonest. Same restraint as the rest of
// this app's computed stats (see js/hairProduct.js's productInsight).
export function estimatedDurationDays(dateStarted, dateFinished) {
  if (!dateStarted || !dateFinished) return null;
  const days = Math.round((new Date(dateFinished) - new Date(dateStarted)) / MS_PER_DAY);
  return days > 0 ? days : null;
}

export function formatDuration(days) {
  if (days == null) return null;
  const months = days / DAYS_PER_MONTH;
  if (months >= 1) return `${days} days (~${Math.round(months * 10) / 10} mo)`;
  return `${days} day${days === 1 ? "" : "s"}`;
}

// Only returns a value once both a price and a measured duration exist —
// never estimated from an in-progress purchase or a guessed lifespan.
export function estimatedMonthlyCost(purchasePrice, durationDays) {
  if (purchasePrice == null || !durationDays) return null;
  const months = durationDays / DAYS_PER_MONTH;
  return purchasePrice / months;
}

export function formatMoney(amount) {
  return `$${amount.toFixed(2)}`;
}
