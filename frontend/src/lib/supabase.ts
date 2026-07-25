import { createClient } from "@supabase/supabase-js";
import type { Database } from "./db.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail loudly at startup rather than letting every query return an opaque
// error later. The anon key is meant to be public; the service role key must
// never appear in this file.
if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy frontend/.env.example to frontend/.env.",
  );
}

export const supabase = createClient<Database>(url, anonKey);

export const FUNCTIONS_URL = `${url}/functions/v1`;
export const ANON_KEY = anonKey;
