// Calm placeholder — deliberately small, for the few things that don't
// belong inside a routine, area, or project.
import { isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import { iconMarkup } from "./lucideIcons.js";

document.getElementById("hero-icon").innerHTML = iconMarkup("bell");

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
  }
})();
