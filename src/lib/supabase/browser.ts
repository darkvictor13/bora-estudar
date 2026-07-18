"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

let browserClient: SupabaseClient | undefined;

export function getSupabaseBrowserClient() {
  browserClient ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return browserClient;
}
