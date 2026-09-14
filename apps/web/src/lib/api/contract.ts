/**
 * O CONTRATO ENTRE A INTERFACE E O BANCO.
 *
 * Este arquivo é a única coisa que as telas conhecem sobre onde os dados moram.
 * Nenhum componente importa `@supabase/supabase-js`, nenhum componente sabe que
 * existe uma tabela `goals`. Eles chamam `loadWeek` e recebem `Week`.
 *
 * ## Por que existe
 *
 * A reconstrução da v2 e a reescrita do banco correm em paralelo. Sem esta
 * camada, cada tela nasceria acoplada a um schema que ainda vai mudar, e a
 * integração seria um segundo reescrever — de telas, não de adaptadores. Com
 * ela, integrar é preencher funções cujo formato de entrada e de saída já está
 * travado por tipo e por teste.
 *
 * Duas implementações vivem atrás daqui:
 *
 * | `src/lib/api/fixtures/` | agora | constrói e testa a UI antes de o banco existir |
 * | `src/lib/api/supabase/` | depois | trocada por variável de ambiente, sem tocar em componente |
 *
 * ## Como ler
 *
 * Os tipos são os da INTERFACE, não os do banco. Onde o schema expõe
 * `weekday smallint` e `weekday_name text`, aqui há um `Weekday` e o nome sai
 * de formatação — a tela não escolhe entre duas cópias do mesmo dado. Onde o
 * schema separa `goals.spent_minutes` de `goal_entries.minutes`, aqui há um
 * número só: qual das duas colunas vale é problema do adaptador.
 *
 * O que o adaptador NÃO pode fazer é inventar. Quando uma operação daqui não
 * tiver como ser cumprida pelo schema, o lugar de resolver é o schema ou este
 * contrato — não um `any` no meio do caminho.
 *
 * ## Lacunas conhecidas no schema de 14/09/2026
 *
 * Levantadas ao escrever este arquivo contra
 * `supabase/migrations/20260914150000_initial_schema.sql`. Estão aqui porque o
 * contrato é o pedido formal à frente do banco:
 *
 * 1. **Não há onde guardar a preferência de tema.** `user_preferences` saiu e
 *    nada a substituiu. `loadThemePreference`/`saveThemePreference` precisam de
 *    uma coluna em `profiles` ou de uma tabela própria; sem isso a regra de o
 *    tema vir da CONTA, e não do aparelho, não tem como valer (R-TEMA-11).
 * 2. **Não há tabela de assinatura.** O acesso é `profiles.access_status` mais
 *    `access_expires_at`; `redeemCoupon` e `grantAccess` mexem nessas duas
 *    colunas, e `coupons` não registra quem resgatou. Se o produto precisar do
 *    histórico de resgate, falta uma tabela.
 * 3. **Substituição segura é só regra de UI hoje.** `generateWeek` promete não
 *    tocar em meta concluída (LEIA-ME v108.3); nada no schema impede. Vale a
 *    pena um índice ou um gatilho, e até lá o adaptador é o único guardião.
 */

/* ------------------------------------------------------------------ *
 * Vocabulário
 * ------------------------------------------------------------------ */

/** `2026-09-14`. Data sem hora e sem fuso — é assim que a semana é falada. */
export type IsoDate = string;
/** `2026-09-14T18:25:38.591Z`. */
export type IsoDateTime = string;
export type Uuid = string;

/** 1 = segunda, 7 = domingo. O mesmo que `goals.weekday`. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Role = "teacher" | "student";
export type AccessStatus = "pending" | "active" | "suspended" | "expired";
export type ThemePreference = "light" | "dark";

export type GoalType =
  | "theory"
  | "question_block"
  | "review"
  | "reinforcement"
  | "mock_exam"
  | "extra";

export type GoalStatus = "pending" | "in_progress" | "completed" | "skipped";

/** Onde o aluno está dentro de uma meta de teoria. */
export type TheoryStage = "reading" | "pdf_done" | "questions_in_progress" | "questions_done";

export type TheoryReviewStatus = "pending" | "in_progress" | "completed";

export type StudyPlanStatus = "active" | "paused" | "completed" | "archived";

/**
 * Como o professor classifica um aluno na lista.
 *
 * Derivado, não guardado: sai da razão entre metas concluídas e metas devidas
 * até hoje. A regra vive em `lib/domain`, e a classificação chega pronta para a
 * tela não recalcular a mesma coisa em três lugares.
 */
export type StudentPace = "on_track" | "attention" | "behind";

/* ------------------------------------------------------------------ *
 * Erros
 * ------------------------------------------------------------------ */

/**
 * O que pode dar errado, em vocabulário de PRODUTO.
 *
 * A tela decide o que mostrar a partir daqui, e não a partir de um código do
 * Postgres: `42501` não diz à pessoa que o acesso dela venceu. Traduzir é
 * trabalho do adaptador, e é onde o acoplamento ao banco termina.
 */
export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "access_expired"
  | "offline"
  | "unknown";

export interface ApiError {
  readonly code: ApiErrorCode;
  /** Texto em português, pronto para a tela. */
  readonly message: string;
  /** Campo do formulário que causou, quando `code` é `validation`. */
  readonly field?: string;
}

/**
 * Toda operação que ESCREVE devolve isto.
 *
 * Erro de escrita é caminho normal — acesso vencido, meta já concluída por
 * outra aba, rede caída — e `throw` obrigaria cada formulário a um try/catch
 * que ninguém lembra de escrever. Leitura continua lançando: loader que falha
 * é trabalho do `ErrorBoundary` da rota, não da tela.
 */
export type Result<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ApiError };

/**
 * Chave de idempotência, gerada UMA VEZ, NA ORIGEM.
 *
 * Gerá-la no ponto de uso transforma a proteção do servidor em decoração: cada
 * tentativa chega como operação nova. Já custou bateria respondida na versão
 * anterior — uma hora de estudo do aluno, que não pode ser recriada.
 */
export type RequestId = Uuid;

/* ------------------------------------------------------------------ *
 * Fase 2 — sessão, conta e tema
 * ------------------------------------------------------------------ */

export interface Session {
  readonly profileId: Uuid;
  readonly email: string;
  readonly name: string | null;
  readonly role: Role;
  readonly access: AccessStatus;
  readonly accessExpiresAt: IsoDate | null;
  /** O professor do aluno. `null` para o professor. */
  readonly teacherId: Uuid | null;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface SignUpInput extends Credentials {
  readonly name: string;
}

export interface AuthApi {
  /** `null` quando não há sessão. Nunca lança por falta de sessão. */
  loadSession(): Promise<Session | null>;
  signIn(input: Credentials): Promise<Result<Session>>;
  signUp(input: SignUpInput): Promise<Result<Session>>;
  signOut(): Promise<Result<void>>;
  requestPasswordReset(email: string): Promise<Result<void>>;
  /** Chamada com a sessão de recuperação já estabelecida pelo link do e-mail. */
  resetPassword(password: string): Promise<Result<void>>;
}

export interface AccountApi {
  loadAccount(): Promise<Account>;
  saveAccount(input: AccountInput): Promise<Result<Account>>;
  /**
   * `null` = nunca escolheu, e a ausência equivale a claro (R-TEMA-07).
   * Distinguir de `"light"` importa: é o que separa "prefere claro" de "não
   * opinou", e um dia pode virar "seguir o sistema".
   */
  loadThemePreference(): Promise<ThemePreference | null>;
  saveThemePreference(theme: ThemePreference): Promise<Result<void>>;
}

export interface Account {
  readonly profileId: Uuid;
  readonly name: string | null;
  readonly email: string;
  readonly plan: string | null;
  readonly access: AccessStatus;
  readonly accessExpiresAt: IsoDate | null;
  readonly teacherName: string | null;
}

export interface AccountInput {
  readonly name: string;
}

/* ------------------------------------------------------------------ *
 * Fase 3 — a semana do aluno
 * ------------------------------------------------------------------ */

/**
 * O cabeçalho da semana: os quatro números que o aluno vê antes das metas.
 *
 * Vem agregado do servidor, e não somado na tela, por um motivo que já
 * queimou a versão anterior: três caminhos independentes calculando o mesmo
 * número divergem, e o que diverge em silêncio é o que ninguém conserta.
 */
export interface WeekSummary {
  /** Porcentagem de acerto na semana, 0-100. `null` sem questão respondida. */
  readonly score: number | null;
  readonly studiedMinutes: number;
  readonly questionsAnswered: number;
  readonly correctAnswers: number;
  /** Dias seguidos com pelo menos um registro, contando até hoje. */
  readonly streakDays: number;
  readonly goalsTotal: number;
  readonly goalsCompleted: number;
}

/** Um registro de estudo dentro de uma meta. Append-only na tela: some por `removeStudyEntry`. */
export interface StudyEntry {
  readonly id: Uuid;
  readonly goalId: Uuid;
  readonly minutes: number;
  readonly questions: number;
  readonly correctAnswers: number;
  /** 0-100, calculado. Vem pronto porque a tela o mostra em coluna alinhada. */
  readonly score: number;
  readonly note: string | null;
  /** Preenchido quando o registro é de teoria; diz em que etapa ele entrou. */
  readonly theoryStage: TheoryStage | null;
  /** Aula digitada à mão, quando a meta não aponta para o catálogo. */
  readonly manualLesson: string | null;
  readonly createdAt: IsoDateTime;
}

export interface Goal {
  readonly id: Uuid;
  readonly type: GoalType;
  readonly status: GoalStatus;
  readonly weekday: Weekday;
  /** Ordem dentro do dia. É por ela que a lista do dia se ordena. */
  readonly dayPosition: number;
  readonly subject: string;
  readonly title: string;
  readonly description: string | null;
  /** Nome da aula, quando a meta é de teoria ou de revisão. */
  readonly lesson: string | null;
  /** Nome do bloco, quando a meta é de bateria de questões. */
  readonly block: string | null;
  readonly plannedMinutes: number;
  readonly dueOn: IsoDate | null;
  readonly completedAt: IsoDateTime | null;
  /** Soma dos registros. Zero quando não há nenhum. */
  readonly spentMinutes: number;
  readonly questionsAnswered: number;
  readonly correctAnswers: number;
  readonly entries: readonly StudyEntry[];
  /**
   * Presente só em meta de teoria — é o que o modal de teoria abre.
   * `null` nas outras, e nas de teoria cuja disciplina não está no catálogo
   * auditado (ver `TheoryGoal.diagnosis`).
   */
  readonly theory: TheoryGoalRef | null;
}

export interface TheoryGoalRef {
  readonly lessonId: Uuid;
  readonly subjectKey: string;
}

/** As metas de um dia, já agrupadas — a v2 monta a semana assim. */
export interface DayGroup {
  readonly weekday: Weekday;
  readonly date: IsoDate;
  readonly goals: readonly Goal[];
}

export interface Week {
  readonly studyPlanId: Uuid;
  readonly weekNumber: number;
  readonly startsOn: IsoDate;
  readonly endsOn: IsoDate;
  readonly summary: WeekSummary;
  readonly days: readonly DayGroup[];
}

/** Uma entrada do seletor de semanas. */
export interface WeekOption {
  readonly weekNumber: number;
  readonly startsOn: IsoDate;
  readonly endsOn: IsoDate;
  readonly isCurrent: boolean;
}

export interface WeeklyGoalsApi {
  listWeeks(studyPlanId: Uuid): Promise<readonly WeekOption[]>;
  /** `weekNumber` ausente = a semana corrente. */
  loadWeek(studyPlanId: Uuid, weekNumber?: number): Promise<Week>;

  /**
   * Registra estudo numa meta. É o `registro-modal` da v2.
   *
   * Registrar NÃO conclui: concluir é `completeGoal`, e a separação existe
   * porque uma meta pode receber vários registros antes de fechar.
   */
  recordStudy(input: RecordStudyInput): Promise<Result<Goal>>;
  removeStudyEntry(entryId: Uuid, requestId: RequestId): Promise<Result<Goal>>;

  completeGoal(goalId: Uuid, requestId: RequestId): Promise<Result<Goal>>;
  /** Desfaz o concluir. A meta volta para `pending` ou `in_progress`, conforme tenha registro. */
  reopenGoal(goalId: Uuid, requestId: RequestId): Promise<Result<Goal>>;
  skipGoal(goalId: Uuid, requestId: RequestId): Promise<Result<Goal>>;

  /**
   * Estudo FORA das metas — o `extra-modal` da v2: lei seca, Anki, simulado,
   * revisão avulsa, questões extras. Cria a meta do tipo `extra` e o registro
   * na mesma operação, porque na tela é um botão só.
   */
  recordExtraStudy(input: ExtraStudyInput): Promise<Result<Goal>>;
}

export interface RecordStudyInput {
  readonly goalId: Uuid;
  readonly requestId: RequestId;
  readonly minutes: number;
  readonly questions: number;
  readonly correctAnswers: number;
  readonly note?: string;
  readonly manualLesson?: string;
  readonly theoryStage?: TheoryStage;
}

export type ExtraStudyKind = "dry_law" | "anki" | "mock_exam" | "review" | "extra_questions";

export interface ExtraStudyInput {
  readonly studyPlanId: Uuid;
  readonly requestId: RequestId;
  readonly kind: ExtraStudyKind;
  readonly subject: string;
  readonly date: IsoDate;
  readonly minutes: number;
  readonly questions: number;
  readonly correctAnswers: number;
  readonly note?: string;
}

/* --- Planejamento e disciplinas, do lado do aluno (só leitura) --- */

export interface StudyPlanSummary {
  readonly id: Uuid;
  readonly name: string;
  readonly area: string;
  readonly targetExam: string | null;
  readonly stage: string;
  readonly studyModel: string;
  readonly weeklyGoals: number;
  readonly startsOn: IsoDate;
  readonly examDate: IsoDate | null;
  readonly status: StudyPlanStatus;
}

export interface SubjectBlock {
  readonly id: Uuid;
  readonly name: string;
  readonly position: number;
  readonly link: string | null;
}

export interface Subject {
  readonly id: Uuid;
  readonly name: string;
  readonly color: string;
  readonly weight: number;
  readonly targetScore: number;
  readonly blocks: readonly SubjectBlock[];
  readonly lessons: readonly SubjectBlock[];
}

export interface StudentPlanApi {
  /** O planejamento ativo do aluno. Lança `not_found` quando não há nenhum. */
  loadActivePlan(): Promise<StudyPlanSummary>;
  loadSubjects(studyPlanId: Uuid): Promise<readonly Subject[]>;
}

/* ------------------------------------------------------------------ *
 * Fase 4 — o fluxo inteligente da teoria
 * ------------------------------------------------------------------ */

/**
 * POR QUE UMA AULA PODE NÃO TER PÁGINA.
 *
 * O catálogo auditado não cobre todas as disciplinas — Matemática Financeira e
 * TI ficaram de fora na v108.5. A v2 recusa inventar número de página nesse
 * caso, e mostra o diagnóstico em vez do controle. A reconstrução mantém isso:
 * inventar página faz o aluno ler o PDF errado e achar que a culpa é dele.
 */
export type TheoryDiagnosis =
  | { readonly kind: "ok" }
  | { readonly kind: "subject_not_audited"; readonly subject: string }
  | { readonly kind: "lesson_without_pages"; readonly lesson: string }
  | { readonly kind: "no_catalog_linked" };

export interface TheoryLesson {
  readonly id: Uuid;
  readonly subject: string;
  readonly subjectKey: string;
  readonly lessonCode: string;
  readonly position: number;
  readonly title: string;
  readonly pdfFile: string;
  /** `null` quando a aula não tem teoria, ou quando o diagnóstico não é `ok`. */
  readonly theoryStartPage: number | null;
  readonly theoryEndPage: number | null;
  readonly pdfTotalPages: number | null;
  readonly finalQuestionsStart: number | null;
  readonly hasTheory: boolean;
  readonly note: string | null;
}

export interface TheoryProgress {
  readonly lessonId: Uuid;
  /** Página do PDF em que o aluno parou. 0 = não começou. */
  readonly currentPage: number;
  readonly theoryDone: boolean;
  readonly initialQuestionsDone: number;
  readonly initialQuestionsRequired: number;
  readonly initialQuestionsComplete: boolean;
  /** A aula inteira concluída — teoria E mínimo de questões iniciais. */
  readonly lessonDone: boolean;
}

export interface TheoryReview {
  readonly id: Uuid;
  readonly lessonId: Uuid;
  readonly lessonTitle: string;
  readonly subject: string;
  readonly reviewNumber: number;
  readonly minimumQuestions: number;
  readonly questionsAnswered: number;
  readonly status: TheoryReviewStatus;
  /** Vencida: entrou na fila e ainda não foi feita. NÃO bloqueia o avanço. */
  readonly due: boolean;
}

/** O que o modal de meta de teoria mostra, nas três abas. */
export interface TheoryGoal {
  readonly goalId: Uuid;
  readonly diagnosis: TheoryDiagnosis;
  /** `null` quando `diagnosis` não é `ok`. */
  readonly lesson: TheoryLesson | null;
  readonly progress: TheoryProgress | null;
  readonly reviews: readonly TheoryReview[];
  /**
   * A próxima aula só libera depois do mínimo de questões iniciais desta.
   * Vem calculado porque a regra é do domínio, não da tela.
   */
  readonly nextLessonUnlocked: boolean;
}

/** Uma linha do controle por disciplina, em `/aluno/teoria`. */
export interface TheorySubjectControl {
  readonly subject: string;
  readonly subjectKey: string;
  readonly diagnosis: TheoryDiagnosis;
  readonly lessonsTotal: number;
  readonly lessonsDone: number;
  readonly currentLesson: TheoryLesson | null;
  readonly reviewsDue: number;
}

export interface TheoryApi {
  loadTheoryControl(studyPlanId: Uuid): Promise<readonly TheorySubjectControl[]>;
  loadTheoryGoal(goalId: Uuid): Promise<TheoryGoal>;

  /**
   * "Salvar progresso e continuar" e "Salvar e encerrar sessão".
   *
   * ENCERRAR SESSÃO NÃO CONCLUI A AULA. É a distinção que a v108.2 introduziu e
   * a que mais se perde ao reescrever: encerrar guarda a página e fecha o
   * modal; concluir exige a teoria lida E o mínimo de questões iniciais.
   * `endSession` só muda o que a tela faz depois — o progresso é o mesmo.
   */
  saveTheoryProgress(input: SaveTheoryProgressInput): Promise<Result<TheoryProgress>>;

  /** Questões iniciais respondidas. É o que libera a próxima aula. */
  recordInitialQuestions(input: RecordInitialQuestionsInput): Promise<Result<TheoryProgress>>;

  /** A fila de revisões vencidas do aluno, entre todas as disciplinas. */
  loadDueReviews(studyPlanId: Uuid): Promise<readonly TheoryReview[]>;
  recordReviewQuestions(input: RecordReviewQuestionsInput): Promise<Result<TheoryReview>>;
}

export interface SaveTheoryProgressInput {
  readonly goalId: Uuid;
  readonly lessonId: Uuid;
  readonly requestId: RequestId;
  readonly currentPage: number;
  readonly endSession: boolean;
}

export interface RecordInitialQuestionsInput {
  readonly goalId: Uuid;
  readonly lessonId: Uuid;
  readonly requestId: RequestId;
  readonly questions: number;
  readonly correctAnswers: number;
}

export interface RecordReviewQuestionsInput {
  readonly reviewId: Uuid;
  readonly requestId: RequestId;
  readonly questions: number;
  readonly correctAnswers: number;
}

/* ------------------------------------------------------------------ *
 * Fase 5 — revisão, reforço e análise
 * ------------------------------------------------------------------ */

/**
 * REVISÃO E REFORÇO SÃO COISAS DIFERENTES, e a v2 já os separava em duas telas.
 *
 * - **Revisão** é calendário: relê o que foi estudado, no espaçamento
 *   configurado, independentemente de ter ido bem.
 * - **Reforço** é reação: nasce de desempenho baixo numa bateria.
 *
 * Juntá-los numa tela só já foi tentado e produziu uma lista em que o aluno não
 * sabia por que cada linha estava ali.
 */
export interface ReviewGridRow {
  readonly subject: string;
  readonly subjectKey: string;
  readonly lessonSpacing: number;
  readonly minimumQuestions: number;
  readonly reviews: readonly TheoryReview[];
  readonly selected: boolean;
}

export interface ReviewApi {
  loadReviewGrid(studyPlanId: Uuid): Promise<readonly ReviewGridRow[]>;
  saveReviewSpacing(input: SaveReviewSpacingInput): Promise<Result<ReviewGridRow>>;
  /** As ações rápidas da v2: "Selecionar 6 básicas", "Matérias do ciclo atual". */
  setSelectedSubjects(studyPlanId: Uuid, subjectKeys: readonly string[]): Promise<Result<void>>;
}

export interface SaveReviewSpacingInput {
  readonly studyPlanId: Uuid;
  readonly subjectKey: string;
  readonly reviewNumber: number;
  readonly lessonSpacing: number;
  readonly minimumQuestions: number;
}

export interface Reinforcement {
  readonly id: Uuid;
  readonly subject: string;
  readonly blockName: string;
  /** 0-100. O desempenho que disparou o reforço. */
  readonly sourceScore: number;
  readonly sourceErrors: number;
  readonly uniqueQuestions: number;
  readonly completedAt: IsoDateTime;
}

export interface ReinforcementApi {
  listReinforcements(studyPlanId: Uuid): Promise<readonly Reinforcement[]>;
}

/* --- Estatísticas --- */

export interface StatisticsFilter {
  readonly studyPlanId?: Uuid;
  readonly year?: number;
}

/** Um ponto de série temporal. Serve para semana, dia e mês. */
export interface SeriesPoint {
  readonly label: string;
  readonly value: number;
}

export interface SubjectPerformance {
  readonly subject: string;
  readonly questions: number;
  readonly correctAnswers: number;
  readonly score: number;
  readonly targetScore: number;
}

export interface Statistics {
  readonly score: number | null;
  readonly questionsAnswered: number;
  readonly correctAnswers: number;
  readonly studiedMinutes: number;
  readonly goalsCompleted: number;
  readonly streakDays: number;
  readonly scoreByWeek: readonly SeriesPoint[];
  readonly questionsByWeek: readonly SeriesPoint[];
  readonly minutesByDay: readonly SeriesPoint[];
  readonly minutesByMonth: readonly SeriesPoint[];
  /** Alimenta o radar por disciplina e a rosca de acerto e erro. */
  readonly bySubject: readonly SubjectPerformance[];
}

export interface StatisticsApi {
  loadStatistics(filter: StatisticsFilter): Promise<Statistics>;
}

/* --- Acesso, lista de espera e cupom --- */

export interface WaitlistInput {
  readonly name: string;
  readonly email: string;
  readonly whatsapp: string;
  readonly interestArea: string;
  readonly targetExam: string;
  readonly timezone: string;
  readonly birthDate?: IsoDate;
}

export interface WaitlistEntry extends WaitlistInput {
  readonly studentId: Uuid;
  readonly status: "waiting" | "released" | "declined";
  readonly createdAt: IsoDateTime;
}

export interface AccessApi {
  /** `null` quando a pessoa ainda não se inscreveu. */
  loadWaitlistEntry(): Promise<WaitlistEntry | null>;
  joinWaitlist(input: WaitlistInput): Promise<Result<WaitlistEntry>>;
  /** Devolve o acesso já atualizado — é o que a tela precisa para sair do bloqueio. */
  redeemCoupon(code: string): Promise<Result<Session>>;
}

/* ------------------------------------------------------------------ *
 * Fase 6 — professor
 * ------------------------------------------------------------------ */

export interface StudentCard {
  readonly studentId: Uuid;
  readonly name: string | null;
  readonly email: string;
  readonly access: AccessStatus;
  readonly accessExpiresAt: IsoDate | null;
  readonly className: string | null;
  readonly planName: string | null;
  readonly pace: StudentPace;
  /** 0-100. Metas concluídas sobre metas devidas até hoje. */
  readonly progress: number;
  readonly score: number | null;
  readonly questionsAnswered: number;
  readonly studiedMinutes: number;
  readonly lastActivityAt: IsoDateTime | null;
}

export interface StudentListFilter {
  readonly search?: string;
  readonly classId?: Uuid;
  readonly pace?: StudentPace;
  readonly access?: AccessStatus;
}

/** A ficha do aluno — na v2 era o `aluno-modal`; aqui vira rota. */
export interface StudentFile {
  readonly card: StudentCard;
  readonly plan: StudyPlanSummary | null;
  readonly statistics: Statistics;
  readonly sessions: readonly QuizSessionSummary[];
  readonly topicDifficulties: readonly TopicDifficulty[];
}

export interface QuizSessionSummary {
  readonly id: Uuid;
  readonly subject: string;
  readonly blockName: string;
  readonly status: "in_progress" | "awaiting_time" | "completed" | "cancelled" | "voided";
  readonly mainTotal: number;
  readonly mainCorrect: number;
  readonly score: number | null;
  readonly durationMinutes: number | null;
  readonly startedAt: IsoDateTime;
  readonly finishedAt: IsoDateTime | null;
}

export interface TopicDifficulty {
  readonly subject: string;
  readonly topic: string;
  readonly questions: number;
  readonly errors: number;
  readonly score: number;
}

export interface TeacherStudentsApi {
  listStudents(filter: StudentListFilter): Promise<readonly StudentCard[]>;
  loadStudentFile(studentId: Uuid): Promise<StudentFile>;
  grantAccess(input: GrantAccessInput): Promise<Result<StudentCard>>;
  revokeAccess(studentId: Uuid, requestId: RequestId): Promise<Result<StudentCard>>;
  /** Anula uma bateria — some do desempenho sem sumir do histórico. */
  voidQuizSession(input: VoidSessionInput): Promise<Result<QuizSessionSummary>>;
}

export interface GrantAccessInput {
  readonly studentId: Uuid;
  readonly requestId: RequestId;
  readonly months: number;
}

export interface VoidSessionInput {
  readonly sessionId: Uuid;
  readonly requestId: RequestId;
  readonly reason: string;
}

/* --- Planejamentos --- */

export interface StudyPlanInput {
  readonly studentId: Uuid;
  readonly name: string;
  readonly area: string;
  readonly targetExam?: string;
  readonly stage: string;
  readonly studyModel: string;
  readonly weeklyGoals: number;
  readonly startsOn: IsoDate;
  readonly examDate?: IsoDate;
  readonly classId?: Uuid;
}

export interface TeacherPlansApi {
  listPlans(studentId?: Uuid): Promise<readonly StudyPlanSummary[]>;
  createPlan(input: StudyPlanInput, requestId: RequestId): Promise<Result<StudyPlanSummary>>;
  updatePlan(
    planId: Uuid,
    input: Partial<StudyPlanInput>,
    requestId: RequestId,
  ): Promise<Result<StudyPlanSummary>>;
  /** Um planejamento ativo por aluno: ativar um arquiva o anterior. */
  activatePlan(planId: Uuid, requestId: RequestId): Promise<Result<StudyPlanSummary>>;
  archivePlan(planId: Uuid, requestId: RequestId): Promise<Result<StudyPlanSummary>>;
}

/* --- Gerar metas --- */

/**
 * A SUBSTITUIÇÃO SEGURA (LEIA-ME v108.3) É REGRA DE PRODUTO.
 *
 * - `safe` — só substitui meta `pending`, `in_progress` ou `skipped`. Meta
 *   concluída fica de pé, com os registros dela.
 * - `full` — "Replanejar semana inteira". Caminho separado, e exige
 *   confirmação na tela antes de chegar aqui.
 *
 * Um enum de dois valores em vez de um `boolean` chamado `force`: quem lê a
 * chamada precisa ver qual dos dois caminhos está sendo tomado, e `force: true`
 * não diz o que vai ser destruído.
 */
export type ReplaceMode = "safe" | "full";

export interface GenerateWeekInput {
  readonly studyPlanId: Uuid;
  readonly requestId: RequestId;
  readonly weekNumber: number;
  readonly mode: ReplaceMode;
  /** Peso por disciplina, quando o professor ajusta a distribuição. */
  readonly weights?: Readonly<Record<string, number>>;
  /** Copiar a semana anterior em vez de distribuir do zero. */
  readonly copyFromWeek?: number;
}

/**
 * O que a geração FARIA — a prévia da v2, antes de qualquer escrita.
 *
 * Existe porque gerar semana é a operação mais cara de desfazer do produto.
 */
export interface GenerateWeekPreview {
  readonly weekNumber: number;
  readonly days: readonly DayGroup[];
  readonly goalsToCreate: number;
  readonly goalsToReplace: number;
  /** Metas concluídas que o modo `safe` vai preservar. */
  readonly goalsPreserved: number;
}

export interface TeacherGoalsApi {
  previewWeek(input: GenerateWeekInput): Promise<GenerateWeekPreview>;
  generateWeek(input: GenerateWeekInput): Promise<Result<Week>>;
  /** Limpa as metas pendentes da semana, sem tocar nas concluídas. */
  clearPendingGoals(studyPlanId: Uuid, weekNumber: number, requestId: RequestId): Promise<Result<Week>>;
}

/* --- Catálogo de teoria e cadernos TEC --- */

export interface TheoryCatalog {
  readonly id: Uuid;
  readonly name: string;
  readonly key: string;
  readonly description: string | null;
  readonly active: boolean;
  readonly lessonCount: number;
  readonly subjectCount: number;
}

export interface TheorySubjectRule {
  readonly subject: string;
  readonly subjectKey: string;
  readonly initialQuestions: number;
  /** 0 a 5 revisões configuráveis, por disciplina. */
  readonly reviews: readonly TheoryReviewRule[];
  readonly active: boolean;
}

export interface TheoryReviewRule {
  readonly reviewNumber: number;
  readonly lessonSpacing: number;
  readonly minimumQuestions: number;
  readonly active: boolean;
}

/**
 * O MASTER e o catálogo de tópicos NÃO ENTRAM NO BUNDLE.
 *
 * São 1,9 MB e 152 KB de JSON. Chegam como arquivo escolhido pelo professor na
 * tela de catálogo, ou por script de seed — nunca como import do site.
 */
export interface ImportMasterInput {
  readonly catalogId: Uuid;
  readonly requestId: RequestId;
  /** O conteúdo do arquivo, já lido pelo `<input type="file">`. */
  readonly master: unknown;
}

export interface ImportMasterResult {
  readonly lessonsCreated: number;
  readonly lessonsUpdated: number;
  readonly subjectsWithoutPages: readonly string[];
}

export interface TeacherTheoryApi {
  listCatalogs(): Promise<readonly TheoryCatalog[]>;
  loadCatalogLessons(catalogId: Uuid): Promise<readonly TheoryLesson[]>;
  loadSubjectRules(catalogId: Uuid): Promise<readonly TheorySubjectRule[]>;
  saveSubjectRule(
    catalogId: Uuid,
    rule: TheorySubjectRule,
    requestId: RequestId,
  ): Promise<Result<TheorySubjectRule>>;
  saveLessonOrder(
    catalogId: Uuid,
    lessonIds: readonly Uuid[],
    requestId: RequestId,
  ): Promise<Result<void>>;
  saveLesson(lesson: TheoryLesson, requestId: RequestId): Promise<Result<TheoryLesson>>;
  importMaster(input: ImportMasterInput): Promise<Result<ImportMasterResult>>;
  /** Vincula o catálogo ao planejamento. Um catálogo por planejamento. */
  linkCatalogToPlan(studyPlanId: Uuid, catalogId: Uuid, requestId: RequestId): Promise<Result<void>>;
}

export interface Notebook {
  readonly blockId: Uuid;
  readonly subjectKey: string;
  readonly subjectName: string;
  readonly subjectColor: string;
  readonly subjectTarget: number;
  readonly notebookKey: string;
  readonly notebookName: string;
  readonly notebookLink: string;
  readonly totalQuestions: number;
  readonly subjectPosition: number;
  readonly notebookPosition: number;
  readonly active: boolean;
  /** Removido é `deleted`, não apagado: `restoreNotebook` o traz de volta. */
  readonly deleted: boolean;
}

export interface TeacherNotebooksApi {
  listNotebooks(studyPlanId: Uuid): Promise<readonly Notebook[]>;
  saveNotebook(
    studyPlanId: Uuid,
    notebook: Notebook,
    requestId: RequestId,
  ): Promise<Result<Notebook>>;
  setNotebookActive(blockId: Uuid, active: boolean, requestId: RequestId): Promise<Result<Notebook>>;
  deleteNotebook(blockId: Uuid, requestId: RequestId): Promise<Result<Notebook>>;
  restoreNotebook(blockId: Uuid, requestId: RequestId): Promise<Result<Notebook>>;
}

/* ------------------------------------------------------------------ *
 * A superfície inteira
 * ------------------------------------------------------------------ */

/**
 * O que `lib/api/index.ts` exporta, e a única coisa que a UI importa.
 *
 * É uma interface só, e não um punhado de funções soltas, por uma razão de
 * verificação: `fixtures` e `supabase` a implementam, e o compilador recusa a
 * implementação que esquecer uma operação ou mudar um tipo. Função solta
 * exportada de dois módulos não tem quem compare os dois.
 */
export interface BoraApi
  extends AuthApi,
    AccountApi,
    WeeklyGoalsApi,
    StudentPlanApi,
    TheoryApi,
    ReviewApi,
    ReinforcementApi,
    StatisticsApi,
    AccessApi,
    TeacherStudentsApi,
    TeacherPlansApi,
    TeacherGoalsApi,
    TeacherTheoryApi,
    TeacherNotebooksApi {}
