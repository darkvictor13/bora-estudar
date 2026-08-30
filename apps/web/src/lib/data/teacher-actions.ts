import { supabase } from "@/lib/supabase/client";
import { requireRole } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/actions";
import type { Enum } from "@bora/database";
import { buildWeek } from "@/lib/domain/week-planner";
import { getCatalogBlocks } from "@/lib/data/teacher";
import { ROUTES } from "@/lib/routes";

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
 *
 * Assíncrona porque no navegador o SHA-256 é `crypto.subtle.digest`, que
 * devolve promessa: o `createHash` síncrono do `node:crypto` não existe aqui. A
 * Web Crypto exige contexto seguro, condição que localhost e https satisfazem.
 */
async function batchIdFor(parts: readonly (string | number | boolean)[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);

  const chars = [...hex];
  chars[12] = "8"; // versão
  chars[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16); // variante
  const value = chars.join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
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
  const batchId = await batchIdFor([
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

  // O formulário do professor não some com a revalidação — ele não depende de
  // nenhum dado que mudou —, então a mensagem pode voltar como estado da
  // action. Ver `success` em `useFormActionState`: é ele que revalida os
  // loaders da tela, no lugar do `revalidatePath` que estava aqui.
  return {
    success: outcome?.replay
      ? `Este lote já tinha sido aplicado: as ${inserted} meta(s) da semana ${week} continuam como estavam.`
      : `${inserted} meta(s) criada(s) na semana ${week}.`,
  };
}

// ---------------------------------------------------------------------------
// Vínculo e liberação de acesso — spec docs/specs/13-vinculo-e-liberacao-de-acesso.md
// ---------------------------------------------------------------------------

/** Meses oferecidos na liberação. O padrão, 3, é o da v96. */
export const ACCESS_MONTHS = [1, 3, 6, 12] as const;

function translateAccessError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("somente professor pode vincular")) {
    return "Só um professor pode vincular alunos.";
  }
  if (m.includes("ja tem professor vigente")) {
    return "Este aluno já tem professor. Atualize a página para ver a lista atual.";
  }
  if (m.includes("so e possivel vincular um perfil de aluno")) {
    return "Este perfil não é de aluno.";
  }
  if (m.includes("aluno nao encontrado")) return "Aluno não encontrado.";
  if (m.includes("ja utilizado com outro payload")) {
    return "Este envio já foi usado com outros dados. Atualize a página.";
  }
  // 42501 do WITH CHECK de subscriptions: liberar exige vínculo vigente.
  if (m.includes("row-level security") || m.includes("violates row-level")) {
    return "Vincule o aluno a você antes de liberar o acesso.";
  }
  if (m.includes("duplicate key") || m.includes("active_subscription_uidx")) {
    return "Este aluno já tem uma assinatura ativa. Atualize a página.";
  }
  return message;
}

/**
 * Vincula um candidato da lista de espera ao professor autenticado.
 *
 * O `requestId` é gerado uma vez por submissão: um duplo clique chega ao banco
 * como a mesma operação e `reserve_operation` devolve o vínculo já criado, em
 * vez de esbarrar no índice `active_link_uidx`.
 */
export async function linkStudent(_prev: FormState, data: FormData): Promise<FormState> {
  await requireRole("teacher");

  const studentId = String(data.get("studentId") ?? "");
  if (!studentId) return { error: "Aluno não identificado." };

  const { error } = await supabase.rpc("link_student", {
    p_student_id: studentId,
    p_request_id: crypto.randomUUID(),
  });

  if (error) return { error: translateAccessError(error.message) };

  return { success: "Aluno vinculado. Libere o acesso para ele entrar nas telas de estudo." };
}

/**
 * Libera ou estende o acesso do aluno.
 *
 * Não é RPC: `subscriptions` está na linha de planejamento da tabela de
 * fronteira do `CLAUDE.md` e já tem as três defesas — `WITH CHECK` com
 * `is_teacher_of` e `grant update` por coluna, com `student_id` de fora.
 *
 * **Estende a linha ativa em vez de inserir outra** (R-VINC-17): o índice
 * parcial `active_subscription_uidx` recusaria a segunda, e um histórico de
 * linhas ativas paralelas é justamente o estado que ele torna inexprimível.
 */
export async function grantAccess(_prev: FormState, data: FormData): Promise<FormState> {
  await requireRole("teacher");

  const studentId = String(data.get("studentId") ?? "");
  const months = Number(data.get("months"));
  if (!studentId) return { error: "Aluno não identificado." };
  if (!ACCESS_MONTHS.includes(months as (typeof ACCESS_MONTHS)[number])) {
    return { error: "Escolha um período de acesso válido." };
  }

  const until = new Date();
  until.setMonth(until.getMonth() + months);
  // `daterange` fechado no início e aberto no fim, como o resto do schema.
  const validity = `[${new Date().toISOString().slice(0, 10)},${until.toISOString().slice(0, 10)})`;

  const { data: current } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  const { error } = current
    ? await supabase.from("subscriptions").update({ validity }).eq("id", current.id)
    : await supabase
        .from("subscriptions")
        .insert({ student_id: studentId, status: "active", plan: "turma", validity });

  if (error) return { error: translateAccessError(error.message) };

  return {
    success: current
      ? `Acesso estendido por ${months} ${months === 1 ? "mês" : "meses"}.`
      : `Acesso liberado por ${months} ${months === 1 ? "mês" : "meses"}.`,
  };
}

/**
 * Suspende o acesso.
 *
 * A vigência é **preservada**: `active_subscription_has_validity` só a exige
 * para `active`, e manter a data é o que permite reativar sem redigitar e o que
 * torna auditável até quando o acesso valia (R-VINC-18).
 */
export async function suspendAccess(_prev: FormState, data: FormData): Promise<FormState> {
  await requireRole("teacher");

  const studentId = String(data.get("studentId") ?? "");
  if (!studentId) return { error: "Aluno não identificado." };

  const { error, count } = await supabase
    .from("subscriptions")
    .update({ status: "suspended" }, { count: "exact" })
    .eq("student_id", studentId)
    .eq("status", "active");

  if (error) return { error: translateAccessError(error.message) };
  // UPDATE filtra em silêncio: sem vínculo, a RLS devolve zero linhas e nenhum
  // erro. Contar é o que transforma isso em mensagem em vez de sucesso falso.
  if (count === 0) return { error: "Este aluno não tem acesso ativo para suspender." };

  return { success: "Acesso suspenso. O aluno volta para a lista de espera." };
}

// ---------------------------------------------------------------------------
// Gestão do planejamento — spec docs/specs/14-gestao-do-planejamento.md
// ---------------------------------------------------------------------------

function translatePlanError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("study_plan_name_unique") || m.includes("duplicate key")) {
    return "Este aluno já tem um planejamento com esse nome. Escolha outro.";
  }
  if (m.includes("row-level security") || m.includes("violates row-level")) {
    return "Vincule o aluno a você antes de criar o planejamento.";
  }
  if (m.includes("active_study_plan_uidx")) {
    return "Este aluno já tem um planejamento ativo. Ative este para trocar.";
  }
  if (m.includes("planejamento nao encontrado")) return "Planejamento não encontrado.";
  if (m.includes("somente o professor responsavel")) {
    return "Este planejamento é de outro professor.";
  }
  if (m.includes("weekly_goals")) return "As metas por semana precisam ficar entre 1 e 200.";
  return message;
}

/**
 * Cria o planejamento e materializa os blocos do catálogo escolhido.
 *
 * Nasce `draft`, nunca `active` (R-GPLAN-01): criar já ativo esbarraria em
 * `active_study_plan_uidx` quando o aluno já tem um, e a troca atômica é o que
 * `activate_study_plan` existe para fazer.
 *
 * As duas escritas não são uma transação — o PostgREST não oferece isso — e o
 * modo de falha é assumido: se a segunda falhar, sobra um rascunho sem blocos,
 * visível e corrigível. O inverso, bloco órfão, é impossível: a FK composta
 * `study_plan_block_context_fk` exige o pai.
 */
export async function createStudyPlan(_prev: FormState, data: FormData): Promise<FormState> {
  const session = await requireRole("teacher");

  const studentId = String(data.get("studentId") ?? "");
  const catalogKey = String(data.get("catalogKey") ?? "");
  const name = String(data.get("name") ?? "").trim();
  const weeklyGoals = Number(data.get("weeklyGoals")) || 24;

  if (!studentId) return { error: "Escolha o aluno." };
  if (!catalogKey) return { error: "Escolha o catálogo." };
  if (name.length < 3) return { error: "Dê um nome ao planejamento (mínimo 3 caracteres)." };
  if (weeklyGoals < 1 || weeklyGoals > 200) {
    return { error: "As metas por semana precisam ficar entre 1 e 200." };
  }

  const { data: plan, error } = await supabase
    .from("study_plans")
    .insert({
      student_id: studentId,
      teacher_id: session.profileId,
      name,
      area: String(data.get("area") ?? "").trim() || null,
      target_exam: String(data.get("targetExam") ?? "").trim() || null,
      stage: String(data.get("stage") ?? "").trim() || null,
      study_model: String(data.get("studyModel") ?? "").trim() || null,
      weekly_goals: weeklyGoals,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: translatePlanError(error.message) };

  const blocks = await getCatalogBlocks(catalogKey);
  if (!blocks.length) {
    return {
      success: `Planejamento "${name}" criado como rascunho. O catálogo escolhido não tem blocos ativos — configure os cadernos antes de gerar metas.`,
    };
  }

  // subject_order é a posição da disciplina na ordem em que o catálogo veio;
  // block_order é a posição dentro dela. É o par que
  // study_plan_block_order_uidx exige ser único.
  const subjectOrder = new Map<string, number>();
  const blockOrder = new Map<string, number>();
  const rows = blocks.map((block) => {
    if (!subjectOrder.has(block.subject_name)) subjectOrder.set(block.subject_name, subjectOrder.size);
    const within = blockOrder.get(block.subject_name) ?? 0;
    blockOrder.set(block.subject_name, within + 1);
    return {
      study_plan_id: plan.id,
      student_id: studentId,
      teacher_id: session.profileId,
      catalog_block_id: block.id,
      subject_name: block.subject_name,
      subject_target: 80,
      name: block.name,
      question_count: block.question_count,
      subject_order: subjectOrder.get(block.subject_name)!,
      block_order: within,
    };
  });

  const { error: blocksError } = await supabase.from("study_plan_blocks").insert(rows);
  if (blocksError) {
    return {
      error: `Planejamento criado, mas os blocos falharam: ${translatePlanError(blocksError.message)}`,
    };
  }

  return {
    success: `Planejamento "${name}" criado como rascunho, com ${rows.length} bloco(s). Ative-o para o aluno começar.`,
  };
}

/**
 * Ativa o planejamento, arquivando o anterior do mesmo aluno.
 *
 * A troca inteira mora em `activate_study_plan`, numa transação só. A v96 fazia
 * isso com um UPDATE em massa no cliente mais um fallback para 'pausado' quando
 * a constraint reclamava.
 *
 * Naturalmente idempotente (R-GPLAN-03): ativar o que já está ativo chega ao
 * mesmo estado, e o update que arquiva os demais exclui o próprio id. Por isso
 * não recebe `request_id`.
 */
export async function activateStudyPlan(_prev: FormState, data: FormData): Promise<FormState> {
  await requireRole("teacher");

  const planId = String(data.get("planId") ?? "");
  if (!planId) return { error: "Planejamento não identificado." };

  const { error } = await supabase.rpc("activate_study_plan", { p_study_plan_id: planId });
  if (error) return { error: translatePlanError(error.message) };

  // Não pode voltar como `success`: a revalidação re-renderiza a linha, o botão
  // "Ativar" some — que é o efeito desejado — e leva junto o `useActionState`
  // que mostraria a mensagem. Quem sobrevive é a página. Mesmo motivo de
  // `registerQuizTime` e `completeGoal`.
  return { redirectTo: `${ROUTES.teacher.plans}?feito=ativado` };
}

/** Arquiva. Metas e baterias continuam existindo (R-GPLAN-17). */
export async function archiveStudyPlan(_prev: FormState, data: FormData): Promise<FormState> {
  await requireRole("teacher");

  const planId = String(data.get("planId") ?? "");
  if (!planId) return { error: "Planejamento não identificado." };

  const { error, count } = await supabase
    .from("study_plans")
    .update({ status: "archived" }, { count: "exact" })
    .eq("id", planId)
    .is("deleted_at", null);

  if (error) return { error: translatePlanError(error.message) };
  // UPDATE filtra em silêncio: sem a contagem, arquivar o planejamento de outro
  // professor diria "arquivado" sem ter arquivado nada.
  if (count === 0) return { error: "Planejamento não encontrado ou de outro professor." };

  return { redirectTo: `${ROUTES.teacher.plans}?feito=arquivado` };
}
