// Supabase project connection.
//
// Fill these in from your Supabase project (Project Settings > API).
// The anon key is safe to expose in client-side code — access is controlled
// by the Row Level Security policies defined in supabase/schema.sql, not by
// keeping this key secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://moiorcyltstlrhwxxuzk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q6zXZg_xJundpb38Hjqq5w_xT9u2wle";

// True once real project values replace the placeholders above.
// Until then, the app runs in local preview mode (see js/demoStore.js)
// instead of trying to connect with invalid credentials.
export const isConfigured =
  SUPABASE_URL.startsWith("https://") && !SUPABASE_ANON_KEY.startsWith("YOUR_");

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
