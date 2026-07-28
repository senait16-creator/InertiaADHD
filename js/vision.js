// Calm placeholder — a visual reminder to look at, not a task list.
import { isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";
import { iconMarkup } from "./lucideIcons.js";

document.getElementById("hero-icon").innerHTML = iconMarkup("compass");

(async function init() {
  if (isConfigured) {
    const session = await requireSession();
    if (!session) return;
  }
})();
