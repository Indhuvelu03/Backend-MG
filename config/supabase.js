// config/supabase.js
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Admin client — full access (backend only, never expose to frontend)
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Public client — anon key (for public-facing operations)
export const supabasePublic = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
