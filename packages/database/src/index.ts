/**
 * Tipos do banco, gerados a partir do schema local.
 *
 * Regenerar após qualquer migration:
 *   npm run db:types
 *
 * O arquivo gerado é versionado de propósito: o CI e o `typecheck` precisam
 * dele sem subir um Supabase, e o diff mostra o impacto de cada migration na
 * superfície de tipos.
 */

export type { Database, Json } from "./schema.gen.ts";
export * from "./helpers.ts";
