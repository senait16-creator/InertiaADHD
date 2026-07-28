import { supabase } from "./supabaseClient.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const statusEl = document.getElementById("status");

async function redirectIfSignedIn() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.location.href = "index.html";
  }
}
redirectIfSignedIn();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "Sending link...";

  const redirectTo = new URL("index.html", window.location.href).toString();
  const { error } = await supabase.auth.signInWithOtp({
    email: emailInput.value.trim(),
    options: { emailRedirectTo: redirectTo },
  });

  statusEl.textContent = error
    ? `Error: ${error.message}`
    : "Check your email for a sign-in link.";
});

// If the magic link callback arrives on this page, move to the dashboard.
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    window.location.href = "index.html";
  }
});
