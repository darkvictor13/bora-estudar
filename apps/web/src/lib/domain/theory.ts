/**
 * O MOTOR DA TEORIA, PURO — o `theory-engine.js` da v2, sem DOM e sem rede.
 *
 * O fluxo que ele governa é o da v108.2, e a ordem importa:
 *
 *     aula/PDF → progresso real por página → teoria concluída
 *              → questões iniciais → aula concluída → próxima aula
 *
 * Duas coisas que se perdem ao reescrever, e que os testes seguram:
 *
 * 1. **Encerrar a sessão não conclui a aula.** Encerrar guarda a página e
 *    fecha o modal. Concluir exige a teoria lida E o mínimo de questões
 *    iniciais. Confundir os dois faz o aluno pular metade do conteúdo achando
 *    que terminou.
 * 2. **Revisão vencida não bloqueia o avanço.** Ela entra numa fila própria.
 *    Bloquear transformaria um lembrete em muro, e quem está atrasado pararia
 *    de avançar exatamente quando mais precisa.
 */

/* ------------------------------------------------------------------ *
 * O vocabulário do motor
 * ------------------------------------------------------------------ */

export interface EngineLesson {
  readonly id: string;
  readonly subjectKey: string;
  readonly position: number;
  readonly lessonCode: string;
  readonly hasTheory: boolean;
  readonly theoryStartPage: number | null;
  readonly theoryEndPage: number | null;
}

export interface EngineProgress {
  readonly lessonId: string;
  readonly currentPage: number;
  readonly theoryDone: boolean;
  readonly initialQuestionsDone: number;
  readonly lessonDone: boolean;
}

export interface ReviewRule {
  readonly reviewNumber: number;
  /** Em AULAS CONCLUÍDAS depois da aula de origem — não em dias. */
  readonly lessonSpacing: number;
  readonly minimumQuestions: number;
}

/* ------------------------------------------------------------------ *
 * Nome de disciplina
 * ------------------------------------------------------------------ */

function withoutAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * A chave canônica de uma disciplina.
 *
 * A COMPARAÇÃO É EXATA DEPOIS DESTA ETAPA, e nunca por `includes`. Abreviações
 * curtas casam dentro de outras palavras: "ti" está em "adminisTIativo", e um
 * `includes` mandaria a aula de TI para Direito Administrativo. A v2 aprendeu
 * isso e deixou o aviso escrito; aqui ele vira teste.
 */
export function normalizeSubjectKey(name: string): string {
  const n = withoutAccents(name)
    .toLowerCase()
    .replace(/^teoria\s*[-–—:]\s*/, "")
    .replace(/^\d+[.\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  // Os apelidos que o time usa no dia a dia, mapeados para uma chave só. Sem
  // isto "AFO" e "Administração Financeira e Orçamentária" viram duas
  // disciplinas com o mesmo conteúdo.
  if (n === "portugues" || n === "lingua portuguesa") return "portugues";
  if (n === "administracao financeira e orcamentaria" || n === "afo") return "afo";
  if (n === "contabilidade de custos" || n === "custos") return "custos";
  if (n.startsWith("contabilidade geral e avancada")) return "contabilidade geral e avancada";
  if (n === "raciocinio logico e matematica" || n === "raciocinio logico matematico" || n === "rlm") {
    return "rlm";
  }
  if (n === "tecnologia da informacao" || n === "ti") return "ti";
  if (
    n === "legislacao tributaria estadual - geral" ||
    n === "legislacao tributaria estadual geral" ||
    /^lte geral(?: part i)?$/.test(n) ||
    n === "lte"
  ) {
    return "lte";
  }
  if (
    n === "legislacao tributaria municipal - geral" ||
    n === "legislacao tributaria municipal geral" ||
    /^ltm geral(?: part ii)?$/.test(n) ||
    n === "ltm"
  ) {
    return "ltm";
  }
  return n;
}

export function sameSubject(a: string, b: string): boolean {
  const ka = normalizeSubjectKey(a);
  return ka.length > 0 && ka === normalizeSubjectKey(b);
}

/* ------------------------------------------------------------------ *
 * Páginas
 * ------------------------------------------------------------------ */

function pageRange(lesson: EngineLesson): { first: number; last: number } {
  const first = lesson.theoryStartPage ?? 1;
  const last = lesson.theoryEndPage ?? first;
  return { first, last };
}

/**
 * Quanto da teoria já foi lido, em porcentagem.
 *
 * `currentPage` é a ÚLTIMA PÁGINA LIDA, e o zero natural é `first - 1`: quem
 * não começou está uma página antes da primeira, não na primeira. Sem isso,
 * abrir a aula já marcaria uma página lida.
 */
export function lessonProgressPercent(
  lesson: EngineLesson,
  progress: EngineProgress | null,
): number {
  if (!lesson.hasTheory) return progress?.theoryDone ? 100 : 0;

  const { first, last } = pageRange(lesson);
  const current = Math.max(first - 1, Math.min(progress?.currentPage ?? first - 1, last));
  const total = Math.max(1, last - first + 1);
  const read = Math.max(0, current - first + 1);
  return Math.max(0, Math.min(100, Math.round((read / total) * 100)));
}

/** A página que o aluno vai ler agora. Nunca passa do fim da teoria. */
export function nextPage(lesson: EngineLesson, progress: EngineProgress | null): number | null {
  if (!lesson.hasTheory) return null;
  const { first, last } = pageRange(lesson);
  return Math.max(first, Math.min(last, (progress?.currentPage ?? 0) + 1));
}

/** Prende a página dentro do intervalo auditado da aula. */
export function clampPage(lesson: EngineLesson, page: number): number | null {
  if (!lesson.hasTheory) return null;
  const { first, last } = pageRange(lesson);
  return Math.max(first - 1, Math.min(Number.isFinite(page) ? page : first - 1, last));
}

/** A teoria acabou quando a última página lida é a última da teoria. */
export function isTheoryDone(lesson: EngineLesson, currentPage: number): boolean {
  if (!lesson.hasTheory) return true;
  return currentPage >= pageRange(lesson).last;
}

/* ------------------------------------------------------------------ *
 * Aulas
 * ------------------------------------------------------------------ */

/** Ordena as aulas como o catálogo as numerou; o código desempata. */
export function sortLessons(lessons: readonly EngineLesson[]): readonly EngineLesson[] {
  return [...lessons].sort(
    (a, b) => a.position - b.position || a.lessonCode.localeCompare(b.lessonCode, "pt-BR"),
  );
}

export interface CurrentLesson {
  readonly lesson: EngineLesson;
  /** `true` quando TODAS as aulas da disciplina já foram concluídas. */
  readonly courseFinished: boolean;
}

/**
 * A aula em que o aluno está: a primeira que ele ainda não concluiu.
 *
 * Quando não sobra nenhuma, devolve a ÚLTIMA com `courseFinished`. Devolver
 * `null` faria a tela mostrar "sem aula" para quem terminou a disciplina — que
 * é o oposto do que aconteceu.
 */
export function currentLesson(
  lessons: readonly EngineLesson[],
  progressById: ReadonlyMap<string, EngineProgress>,
): CurrentLesson | null {
  const ordered = sortLessons(lessons);
  if (ordered.length === 0) return null;

  for (const lesson of ordered) {
    if (!progressById.get(lesson.id)?.lessonDone) return { lesson, courseFinished: false };
  }
  return { lesson: ordered[ordered.length - 1]!, courseFinished: true };
}

/**
 * A aula fecha com as DUAS coisas: teoria lida e mínimo de questões iniciais.
 *
 * É o passo 7 do piloto da v108.2, e é onde a próxima aula é liberada.
 */
export function isLessonComplete(
  lesson: EngineLesson,
  progress: EngineProgress | null,
  initialQuestionsRequired: number,
): boolean {
  if (!progress) return false;
  const theoryDone = lesson.hasTheory ? progress.theoryDone : true;
  return theoryDone && progress.initialQuestionsDone >= initialQuestionsRequired;
}

/* ------------------------------------------------------------------ *
 * Revisões
 * ------------------------------------------------------------------ */

export interface DueReview {
  readonly lesson: EngineLesson;
  readonly rule: ReviewRule;
}

/**
 * Quais revisões já venceram.
 *
 * O ESPAÇAMENTO É MEDIDO EM AULAS CONCLUÍDAS depois da aula de origem, e não em
 * dias: quem estuda em ritmo irregular revisaria cedo demais ou tarde demais se
 * a conta fosse de calendário. A revisão 1 com espaçamento 3 vence quando o
 * aluno concluir a terceira aula depois daquela.
 *
 * Quando a disciplina INTEIRA termina, as revisões restantes vencem juntas —
 * senão a matéria nunca fecharia, porque não há aula nova para empurrá-las.
 */
export function dueReviews(
  lessons: readonly EngineLesson[],
  progressById: ReadonlyMap<string, EngineProgress>,
  rules: readonly ReviewRule[],
): readonly DueReview[] {
  const ordered = sortLessons(lessons);
  if (ordered.length === 0) return [];

  const active = rules.filter((rule) => rule.lessonSpacing > 0);
  if (active.length === 0) return [];

  let highest = -1;
  ordered.forEach((lesson, index) => {
    if (progressById.get(lesson.id)?.lessonDone) highest = Math.max(highest, index);
  });

  const courseFinished =
    highest === ordered.length - 1 && ordered.every((l) => progressById.get(l.id)?.lessonDone);

  const due: DueReview[] = [];
  ordered.forEach((lesson, index) => {
    if (!progressById.get(lesson.id)?.lessonDone) return;
    for (const rule of active) {
      if (highest >= index + Math.max(1, rule.lessonSpacing) || courseFinished) {
        due.push({ lesson, rule });
      }
    }
  });
  return due;
}

/* ------------------------------------------------------------------ *
 * Diagnóstico
 * ------------------------------------------------------------------ */

export type Diagnosis =
  | { kind: "ok" }
  | { kind: "subject_not_audited"; subject: string }
  | { kind: "lesson_without_pages"; lesson: string }
  | { kind: "no_catalog_linked" };

/**
 * POR QUE UMA AULA PODE NÃO TER PÁGINA, e por que isso não é um erro a esconder.
 *
 * O catálogo auditado não cobre todas as disciplinas — Matemática Financeira e
 * TI ficaram de fora na v108.5. A v2 RECUSA INVENTAR número de página nesse
 * caso e mostra o diagnóstico no lugar do controle. Inventar faz o aluno ler o
 * PDF errado e achar que a culpa é dele.
 *
 * A falta é descoberta pelo DADO, não por uma lista de exceções escrita à mão:
 * disciplina cujas aulas todas vêm sem intervalo de teoria não foi auditada.
 * Uma lista fixa envelheceria no dia em que a auditoria cobrisse mais uma.
 */
export function diagnose(
  subject: string,
  lessons: readonly EngineLesson[],
  lesson: EngineLesson | null,
  hasCatalog: boolean,
  lessonTitle: string,
): Diagnosis {
  if (!hasCatalog) return { kind: "no_catalog_linked" };
  if (lessons.length === 0) return { kind: "subject_not_audited", subject };
  if (lessons.every((candidate) => !candidate.hasTheory)) {
    return { kind: "subject_not_audited", subject };
  }
  if (lesson && lesson.hasTheory && lesson.theoryEndPage === null) {
    return { kind: "lesson_without_pages", lesson: lessonTitle };
  }
  return { kind: "ok" };
}
