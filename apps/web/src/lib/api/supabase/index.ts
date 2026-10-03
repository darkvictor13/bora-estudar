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
 * - **Anular bateria.** A escrita fechada de `quiz_sessions` é a defesa certa;
 *   a operação precisa nascer como RPC. Ver `teacher-students.ts`.
 * - **Resgatar cupom.** `coupons` está sem policy e sem grant, de propósito.
 *   Ver `access.ts`.
 *
 * A META NÃO APONTA PARA A AULA, e isso NÃO é lacuna: quem escolhe a aula é o
 * motor, pelo progresso do aluno no catálogo do planejamento. Ver `theory.ts`.
 */
import type { BoraApi } from "../contract.ts";
import { mockExamsApi } from "./mock-exams.ts";
import { gradeFlashcard, loadFlashcardReviews, loadFlashcardReviewsForLessons } from "./flashcards.ts";
import { gradeLibraryFlashcard, loadLibraryFlashcardCatalog, loadLibraryFlashcardDeck, loadLibraryFlashcardReviews } from "./library-flashcards.ts";
import { loadExamMaps, loadLawDocument, loadLawLibrary, loadLawMarks, saveLawMarks } from "./laws.ts";
import { loadFlashcardMarks, saveFlashcardMarks } from "./flashcard-marks.ts";
import { createPersonalFlashcard, createPersonalFlashcardDeck, gradePersonalFlashcard, listPersonalFlashcardDecks, loadPersonalFlashcardReviews } from "./personal-flashcards.ts";
import { authApi } from "./auth.ts";
import { joinWaitlist, loadWaitlistEntry, redeemCoupon } from "./access.ts";
import { loadActivePlan, loadActivePlanOrNull, loadSubjects } from "./plan.ts";
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
  findStudentByEmail,
  grantAccess,
  linkStudent,
  listStudents,
  loadStudentFile,
  revokeAccess,
  voidQuizSession,
} from "./teacher-students.ts";
import {
  createClass,
  deleteClass,
  enrollStudent,
  listClasses,
  moveStudent,
  renameClass,
  setClassTheoryCatalog,
  unenrollStudent,
} from "./teacher-classes.ts";
import {
  createDraftLesson,
  ensurePmprPilotCatalog,
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
import { loadClassQuestionDistribution, loadStatistics, loadStudentQuestionComparison, loadStudentWeeklyQuestionComparison, loadStudentSubjectPeerComparison, loadStudyDays } from "./statistics.ts";
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
 * educadamente. **Eram cinco:** `grantAccess` e `revokeAccess` saíram da lista
 * em 18/09/2026, com `set_student_access`.
 *
 * - `voidQuizSession` — `quiz_sessions` é SELECT; a RPC não foi portada.
 * - `redeemCoupon` — `coupons` está sem policy e sem grant, de propósito.
 * - `setSelectedSubjects` — a tabela de matérias do ciclo não foi portada.
 *
 * Cada uma diz o que falta, em `errors` ou no próprio módulo. Uma recusa muda
 * quando o banco mudar; uma tela que finge ter tentado, não.
 */
export const supabaseApi: BoraApi = {
  ...mockExamsApi,
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
  loadActivePlanOrNull,
  loadSubjects,

  /* --- Fase 4 --- */
  loadTheoryControl,
  loadTheoryGoal,
  loadFlashcardReviews,
  loadFlashcardReviewsForLessons,
  gradeFlashcard,
  loadLawLibrary,
  loadLawDocument,
  loadExamMaps,
  loadLawMarks,
  saveLawMarks,
  loadFlashcardMarks,
  saveFlashcardMarks,
  loadLibraryFlashcardCatalog,
  loadLibraryFlashcardDeck,
  loadLibraryFlashcardReviews,
  gradeLibraryFlashcard,
  listPersonalFlashcardDecks,
  createPersonalFlashcardDeck,
  createPersonalFlashcard,
  loadPersonalFlashcardReviews,
  gradePersonalFlashcard,
  saveTheoryProgress,
  recordInitialQuestions,
  loadDueReviews,
  recordReviewQuestions,

  /* --- Fase 5 --- */
  loadReviewGrid,
  listReinforcements,
  loadStatistics,
  loadClassQuestionDistribution,
  loadStudentQuestionComparison,
  loadStudentWeeklyQuestionComparison,
  loadStudentSubjectPeerComparison,
  loadStudyDays,
  loadWaitlistEntry,
  joinWaitlist,
  redeemCoupon,
  listNotebooks,

  /* --- Fase 6 --- */
  listStudents,
  loadStudentFile,
  findStudentByEmail,
  linkStudent,
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
  ensurePmprPilotCatalog,
  loadCatalogLessons,
  createDraftLesson,
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

  /* --- Vínculo, acesso e turmas (18/09/2026) --- */
  listClasses,
  createClass,
  renameClass,
  deleteClass,
  enrollStudent,
  moveStudent,
  setClassTheoryCatalog,
  unenrollStudent,
};
