import type { Database } from "./schema.gen.ts";

type Public = Database["public"];

/** Linha de uma tabela: `Row<"goals">`. */
export type Row<T extends keyof Public["Tables"]> = Public["Tables"][T]["Row"];

/** Payload de inserção: `Insert<"goals">`. */
export type Insert<T extends keyof Public["Tables"]> = Public["Tables"][T]["Insert"];

/** Payload de atualização: `Update<"goals">`. */
export type Update<T extends keyof Public["Tables"]> = Public["Tables"][T]["Update"];

/** Linha de uma view: `ViewRow<"vw_goal_performance">`. */
export type ViewRow<T extends keyof Public["Views"]> = Public["Views"][T]["Row"];

/** Argumentos de uma RPC: `RpcArgs<"start_quiz_session">`. */
export type RpcArgs<T extends keyof Public["Functions"]> = Public["Functions"][T]["Args"];

/** Retorno de uma RPC: `RpcReturns<"start_quiz_session">`. */
export type RpcReturns<T extends keyof Public["Functions"]> = Public["Functions"][T]["Returns"];

/** Valor de um enum do banco: `Enum<"quiz_session_status">`. */
export type Enum<T extends keyof Public["Enums"]> = Public["Enums"][T];
