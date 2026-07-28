// One-time migration tool: adds a password to the currently signed-in
// account (via updateUser, not signUp) so it can switch from emailed-code
// sign-in to email+password sign-in without creating a second account and
// orphaning existing data. Also doubles as a general "change password"
// page later, since there's no separate account settings screen yet.
import { supabase, isConfigured } from "./supabaseClient.js";
import { requireSession } from "./auth.js";

const form = document.getElementById("password-form");
const passwordInput = document.getElementById("new-password");
const statusEl = document.getElementById("status");

(async function init() {
  if (!isConfigured) {
    window.location.href = "index.html";
    return;
  }
  const session = await requireSession();
  if (!session) return;
})();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "Saving...";

  const { error } = await supabase.auth.updateUser({ password: passwordInput.value });

  if (error) {
    statusEl.textContent = `Error: ${error.message}`;
    return;
  }

  statusEl.textContent = "Password set. You can sign in with it next time.";
  form.reset();
});
