import { supabase } from "./supabaseClient.js";

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Redirects to the sign-in screen when no session exists.
// Returns the session (or null after redirecting).
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}
