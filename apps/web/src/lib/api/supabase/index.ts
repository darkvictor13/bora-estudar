/**
 * O CONTRATO, CUMPRIDO PELO SUPABASE.
 *
 * Mesmas funções que `fixtures.ts`, mesmos tipos de entrada e de saída,
 * falando com o banco de verdade. `lib/api/index.ts` escolhe entre as duas por
 * `VITE_API_IMPL`, e nenhuma tela sabe qual está atendendo.
 *
 * ## Um módulo por assunto, e a composição no fim
 *
 * `auth`, `week`, `theory`, `plan`, `review`, `statistics`, `access`,
 * `notebooks` e os quatro de professor. O arquivo que você está lendo só os
 * junta: é onde se vê, numa tela, tudo que a interface pode pedir.
 *
 * ## Duas regras que vêm do contrato
 *
 * - **Leitura lança; escrita devolve `Result`.** Loader que falha é trabalho
 *   do `ErrorBoundary` da rota. Erro de escrita — acesso vencido, meta já
 *   concluída noutra aba — é caminho normal.
 * - **O erro chega traduzido.** Ver `errors.ts`.
 *
 * ## O que o banco de 14/09/2026 ainda não permite
 *
 * - **Bateria de questões.** `quiz_sessions` e o ledger são SELECT e nada
 *   mais; a escrita é de RPC, e as RPCs não foram portadas. A tela do aluno
 *   não tem por onde começar uma bateria, e é deliberado — ver CLAUDE.md.
 * - **Idempotência de verdade.** `operations` e `reserve_operation` saíram;
 *   `idempotency.ts` cobre o clique duplo e diz o que não cobre.
 * - **Liberar acesso e anular bateria.** O grant por coluna em `profiles` e a
 *   escrita fechada de `quiz_sessions` são a defesa certa; as duas operações
 *   precisam nascer como RPC. Ver `teacher-students.ts`.
 * - **Resgatar cupom.** `coupons` está sem policy e sem grant, de propósito.
 *   Ver `access.ts`.
 *
 * A META NÃO APONTA PARA A AULA, e isso NÃO é lacuna: quem escolhe a aula é o
 * motor, pelo progresso do aluno no catálogo do planejamento. Ver `theory.ts`.
 */
import type { BoraApi } from "../contract.ts";
import { authApi } from "./auth.ts";
import { joinWaitlist, loadWaitlistEntry, redeemCoupon } from "./access.ts";
import { loadActivePlan, loadSubjects } from "./plan.ts";
import {
  deleteNotebook,
  listNotebooks,
  restoreNotebook,
  saveNotebook,
  setNotebookActive,
} from "./notebooks.ts";
import {
  clearPendingGoals,
  generateWeek,
  previewWeek,
} from "./teacher-goals.ts";
import {
  activatePlan,
  archivePlan,
  createPlan,
  listPlans,
  updatePlan,
} from "./teacher-plans.ts";
import {
  grantAccess,
  listStudents,
  loadStudentFile,
  revokeAccess,
  voidQuizSession,
} from "./teacher-students.ts";
import {
  importMaster,
  linkCatalogToPlan,
  listCatalogs,
  loadCatalogLessons,
  loadSubjectRules,
  saveLesson,
  saveLessonOrder,
  saveSubjectRule,
} from "./teacher-theory.ts";
import {
  listReinforcements,
  loadReviewGrid,
  saveReviewSpacing,
  setSelectedSubjects,
} from "./review.ts";
import { loadStatistics } from "./statistics.ts";
import {
  loadDueReviews,
  loadTheoryControl,
  loadTheoryGoal,
  recordInitialQuestions,
  recordReviewQuestions,
  saveTheoryProgress,
} from "./theory.ts";
import {
  completeGoal,
  listWeeks,
  loadWeek,
  recordExtraStudy,
  recordStudy,
  removeStudyEntry,
  reopenGoal,
  skipGoal,
} from "./week.ts";

/**
 * O QUE AINDA NÃO EXISTE, e por quê.
 *
 * A lista esvaziou na Fase 6: o adaptador cobre todas as operações do
 * contrato. O que sobrou de pendência não é fase nenhuma — são três operações
 * que ESTE SCHEMA não permite, e que LANÇAM com o motivo em vez de recusar
 * educadamente:
 *
 * - `grantAccess` / `revokeAccess` — `access_status` fica fora do GRANT UPDATE
 *   de `profiles`; liberar acesso precisa nascer como RPC.
 * - `voidQuizSession` — `quiz_sessions` é SELECT; a RPC não foi portada.
 * - `redeemCoupon` — `coupons` está sem policy e sem grant, de propósito.
 * - `setSelectedSubjects` — a tabela de matérias do ciclo não foi portada.
 *
 * Cada uma diz o que falta, em `errors` ou no próprio módulo. Uma recusa muda
 * quando o banco mudar; uma tela que finge ter tentado, não.
 */
export const supabaseApi: BoraApi = {
  /* --- Fase 2 --- */
  ...authApi,

  /* --- Fase 3 --- */
  listWeeks,
  loadWeek,
  recordStudy,
  removeStudyEntry,
  completeGoal,
  reopenGoal,
  skipGoal,
  recordExtraStudy,
  loadActivePlan,
  loadSubjects,

  /* --- Fase 4 --- */
  loadTheoryControl,
  loadTheoryGoal,
  saveTheoryProgress,
  recordInitialQuestions,
  loadDueReviews,
  recordReviewQuestions,

  /* --- Fase 5 --- */
  loadReviewGrid,
  listReinforcements,
  loadStatistics,
  loadWaitlistEntry,
  joinWaitlist,
  redeemCoupon,
  listNotebooks,

  /* --- Fase 6 --- */
  listStudents,
  loadStudentFile,
  grantAccess,
  revokeAccess,
  voidQuizSession,
  listPlans,
  createPlan,
  updatePlan,
  activatePlan,
  archivePlan,
  previewWeek,
  generateWeek,
  clearPendingGoals,
  listCatalogs,
  loadCatalogLessons,
  loadSubjectRules,
  saveSubjectRule,
  saveLessonOrder,
  saveLesson,
  importMaster,
  linkCatalogToPlan,
  saveNotebook,
  setNotebookActive,
  deleteNotebook,
  restoreNotebook,
  saveReviewSpacing,
  setSelectedSubjects,
};
