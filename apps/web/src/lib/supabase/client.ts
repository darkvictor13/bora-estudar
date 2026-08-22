"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@bora/database";

import { env } from "@/lib/env";

/**
 * Cliente para Client Components.
 *
 * Só enxerga o que a RLS permitir e só escreve por RPC — as tabelas
 * transacionais não têm grant de INSERT/UPDATE/DELETE para `authenticated`.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
}
