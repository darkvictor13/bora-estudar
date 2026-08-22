"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import type { FormState } from "@/lib/auth/actions";
import type { Enum } from "@bora/database";
import { buildWeek } from "@/lib/domain/week-planner";

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

  const goals = buildWeek(blocks, [...weekdays].sort((a, b) => a - b), minutes, withTheory);

  // O batch_id É a chave de idempotência: reenviar o mesmo lote é no-op.
  // Gerado aqui, uma vez por submissão.
  const { data: result, error } = await supabase.rpc("apply_study_plan_batch", {
    p_batch_id: randomUUID(),
    p_study_plan_id: studyPlanId,
    p_week: week,
    p_mode: mode,
    p_goals: goals,
  });

  if (error) return { error: error.message };

  const inserted = (result as { goals_inserted?: number } | null)?.goals_inserted ?? 0;
  revalidatePath(ROUTES.teacher.goals);
  revalidatePath(ROUTES.teacher.students);
  return { success: `${inserted} meta(s) criada(s) na semana ${week}.` };
}
