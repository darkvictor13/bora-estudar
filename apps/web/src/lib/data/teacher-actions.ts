"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import type { FormState } from "@/lib/auth/actions";
import type { Enum } from "@bora/database";
import { buildWeek } from "@/lib/domain/week-planner";

/**
 * Id do lote, derivado do próprio lote.
 *
 * `apply_study_plan_batch` faz o replay pela chave do lote: reenviar o mesmo
 * `p_batch_id` é no-op. Gerar um UUID novo a cada submissão — que era o que
 * acontecia aqui — transforma essa proteção em decoração, porque todo reenvio
 * chega ao banco como lote inédito e as metas somam de novo. É a armadilha
 * descrita no CLAUDE.md.
 *
 * Derivando o id do conteúdo, "o mesmo lote" passa a ser literalmente o mesmo
 * id, e a promessa da tela vira verdade por construção. Uma seleção diferente
 * — outro dia, outro bloco, outro modo — continua sendo um lote novo.
 *
 * Formatado como UUID v8 (versão 8, variante RFC 4122) porque a coluna é uuid.
 */
function batchIdFor(parts: readonly (string | number | boolean)[]): string {
  const hex = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
  const bytes = [...hex];
  bytes[12] = "8"; // versão
  bytes[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16); // variante
  const v = bytes.join("");
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}

export async function generateWeek(_prev: FormState, data: FormData): Promise<FormState> {
  await requireRole("teacher");

  const studyPlanId = String(data.get("studyPlanId") ?? "");
  const week = Number(data.get("week"));
  const minutes = Number(data.get("minutes")) || 60;
  const mode = String(data.get("mode") ?? "append") as Enum<"batch_mode">;
  const withTheory = data.get("withTheory") === "on";
  const weekdays = data.getAll("weekdays").map(Number).filter((n) => n >= 0 && n <= 6);
  const blockIds = data.getAll("blocks").map(String).filter(Boolean);

  if (!studyPlanId) return { error: "Selecione um planejamento." };
  if (!Number.isInteger(week) || week < 1) return { error: "Informe a semana." };
  if (!weekdays.length) return { error: "Escolha pelo menos um dia de estudo." };
  if (!blockIds.length) return { error: "Escolha pelo menos um bloco." };

  const supabase = await createServerSupabaseClient();
  const { data: blocks, error: blocksError } = await supabase
    .from("study_plan_blocks")
    .select("id,name,subject_name")
    .eq("study_plan_id", studyPlanId)
    .in("id", blockIds)
    .is("deleted_at", null)
    .order("subject_order")
    .order("block_order");

  if (blocksError) return { error: `Não foi possível ler os blocos: ${blocksError.message}` };
  if (!blocks?.length) return { error: "Os blocos escolhidos não pertencem a este planejamento." };

  const sortedWeekdays = [...weekdays].sort((a, b) => a - b);
  const goals = buildWeek(blocks, sortedWeekdays, minutes, withTheory);

  // Os blocos entram pela ordem que o banco devolveu, não pela ordem em que
  // vieram do formulário: é essa ordem que decide em que dia cada bloco cai,
  // então é ela que define o lote.
  const batchId = batchIdFor([
    studyPlanId,
    week,
    mode,
    minutes,
    withTheory,
    sortedWeekdays.join(","),
    blocks.map((b) => b.id).join(","),
  ]);

  const { data: result, error } = await supabase.rpc("apply_study_plan_batch", {
    p_batch_id: batchId,
    p_study_plan_id: studyPlanId,
    p_week: week,
    p_mode: mode,
    p_goals: goals,
  });

  if (error) return { error: error.message };

  const outcome = result as { goals_inserted?: number; replay?: boolean } | null;
  const inserted = outcome?.goals_inserted ?? 0;
  revalidatePath(ROUTES.teacher.goals);
  revalidatePath(ROUTES.teacher.students);

  // O formulário do professor não some com a revalidação — ele não depende de
  // nenhum dado que mudou —, então a mensagem pode voltar como estado da action.
  return {
    success: outcome?.replay
      ? `Este lote já tinha sido aplicado: as ${inserted} meta(s) da semana ${week} continuam como estavam.`
      : `${inserted} meta(s) criada(s) na semana ${week}.`,
  };
}
