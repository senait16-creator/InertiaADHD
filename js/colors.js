// Small fixed palette for the optional project color tint. Kept to five
// soft options — a color pick, not a color system.
export const PROJECT_COLORS = ["sage", "green", "blue", "amber", "lavender"];
export const DEFAULT_COLOR = "sage";

export function normalizeColor(color) {
  return PROJECT_COLORS.includes(color) ? color : DEFAULT_COLOR;
}

// Wires up a row of .color-swatch buttons (role="radio") as a single-select
// group. Returns { get, set } to read/write the selected color.
export function initColorPicker(container) {
  const swatches = Array.from(container.querySelectorAll(".color-swatch"));
  let selected = DEFAULT_COLOR;

  function select(color) {
    selected = normalizeColor(color);
    for (const swatch of swatches) {
      swatch.setAttribute("aria-checked", String(swatch.dataset.color === selected));
    }
  }

  for (const swatch of swatches) {
    swatch.addEventListener("click", () => select(swatch.dataset.color));
  }

  select(DEFAULT_COLOR);

  return {
    get: () => selected,
    set: select,
  };
}
