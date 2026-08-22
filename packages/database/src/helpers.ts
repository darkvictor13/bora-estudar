import type { Database } from "./schema.gen.ts";

type Public = Database["public"];

/** Linha de uma tabela: `Linha<"metas">`. */
export type Linha<T extends keyof Public["Tables"]> = Public["Tables"][T]["Row"];

/** Linha de uma view: `LinhaView<"vw_meta_desempenho">`. */
export type LinhaView<T extends keyof Public["Views"]> = Public["Views"][T]["Row"];

/** Argumentos de uma RPC: `ArgsRpc<"iniciar_bateria">`. */
export type ArgsRpc<T extends keyof Public["Functions"]> = Public["Functions"][T]["Args"];

/** Retorno de uma RPC: `RetornoRpc<"iniciar_bateria">`. */
export type RetornoRpc<T extends keyof Public["Functions"]> = Public["Functions"][T]["Returns"];

/** Valor de um enum do banco: `Enum<"status_bateria">`. */
export type Enum<T extends keyof Public["Enums"]> = Public["Enums"][T];
