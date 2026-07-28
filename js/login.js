import { supabase, isConfigured } from "./supabaseClient.js";

const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const statusEl = document.getElementById("status");

if (!isConfigured) {
  // No backend configured yet — the app runs in local preview mode and
  // doesn't need sign-in. See js/demoStore.js.
  window.location.href = "index.html";
} else {
  (async function redirectIfSignedIn() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      window.location.href = "index.html";
    }
  })();

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Signing in...";

    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });

    if (error) {
      statusEl.textContent = `Error: ${error.message}`;
      return;
    }

    window.location.href = "index.html";
  });
}
