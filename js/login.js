import { supabase, isConfigured } from "./supabaseClient.js";

const emailForm = document.getElementById("email-form");
const emailInput = document.getElementById("email");
const codeForm = document.getElementById("code-form");
const codeInput = document.getElementById("code");
const resendBtn = document.getElementById("resend-code");
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

  let pendingEmail = "";

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    pendingEmail = emailInput.value.trim();
    statusEl.textContent = "Sending code...";

    const { error } = await supabase.auth.signInWithOtp({ email: pendingEmail });

    if (error) {
      statusEl.textContent = `Error: ${error.message}`;
      return;
    }

    statusEl.textContent = `Enter the code sent to ${pendingEmail}.`;
    emailForm.hidden = true;
    codeForm.hidden = false;
    codeInput.focus();
  });

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Verifying...";

    const { error } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: codeInput.value.trim(),
      type: "email",
    });

    if (error) {
      statusEl.textContent = `Error: ${error.message}`;
      return;
    }

    window.location.href = "index.html";
  });

  resendBtn.addEventListener("click", () => {
    codeForm.hidden = true;
    codeForm.reset();
    emailForm.hidden = false;
    statusEl.textContent = "";
    emailInput.focus();
  });
}
