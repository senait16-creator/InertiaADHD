// Supabase project connection.
//
// Fill these in from your Supabase project (Project Settings > API).
// The anon key is safe to expose in client-side code — access is controlled
// by the Row Level Security policies defined in supabase/schema.sql, not by
// keeping this key secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
