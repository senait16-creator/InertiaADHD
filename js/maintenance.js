// Calm placeholder — a visual preview only, no tracking or reminders yet.
import { isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import { iconMarkup } from "./lucideIcons.js";

const AREAS = [
  { name: "Hair", icon: "wind", color: "lavender" },
  { name: "Nails", icon: "sparkles", color: "blue" },
  { name: "Toes", icon: "sparkles", color: "green" },
  { name: "Skin", icon: "droplets", color: "sage" },
  { name: "Ears", icon: "sparkles", color: "amber" },
  { name: "Shaving", icon: "scissors", color: "lavender" },
];

document.getElementById("hero-icon").innerHTML = iconMarkup("sparkles");
document.getElementById("preview-row").innerHTML = AREAS.map(
  (area) => `
    <div class="preview-chip">
      <div class="icon-badge" data-color="${area.color}">${iconMarkup(area.icon)}</div>
      <span>${area.name}</span>
    </div>
  `
).join("");

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
  }
})();
