/**
 * AS REGRAS QUE AS DUAS IMPLEMENTAÇÕES CUMPREM IGUAL.
 *
 * Validação de formulário é parte do contrato, não detalhe de quem o cumpre:
 * se a fixture recusa nome curto com uma frase e o Supabase com outra, a tela
 * construída contra a fixture mostra um texto em desenvolvimento e outro em
 * produção — e o teste que fixou a primeira frase passa a mentir.
 *
 * Por isso as mensagens moram aqui, uma vez. `fixtures.ts` e `supabase.ts`
 * chamam as mesmas funções antes de qualquer ida ao servidor, o que também
 * significa que nome curto não gasta uma viagem de rede para ser recusado.
 */
import { MAX_LINK_LENGTH, validateHttpsLink } from "../domain/lesson-resources.ts";
import type {
  ApiError,
  ClassInput,
  Credentials,
  ExtraStudyInput,
  GenerateWeekInput,
  IsoDate,
  Notebook,
  SignUpInput,
  StudyPlanInput,
  WaitlistInput,
} from "./contract.ts";

/**
 * Os tetos de texto (D-06). Cada um é o número de uma CHECK de
 * `char_length(<coluna>) <= N` — a regra mora nos dois lugares, e a varredura de
 * `supabase/tests/07_schema.sql` falha com a coluna que o banco deixou sem teto.
 * As telas leem daqui, pelo `lib/api`, e nunca escrevem `maxLength` literal.
 *
 * Toda medida usa `value.trim().length`, que é o que os adaptadores gravam.
 */
export const MAX_NAME_LENGTH = 120;
export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTE_LENGTH = 2000;
/** O assunto do deck pessoal: `personal_flashcard_decks_title_check`. */
export const MAX_DECK_TITLE_LENGTH = 160;
/** O WhatsApp CRU, com máscara: `waitlist_whatsapp_check`. */
export const MAX_WHATSAPP_LENGTH = 30;
/** Os dígitos do WhatsApp, sem a máscara (D-08). */
export const WHATSAPP_DIGITS = { min: 10, max: 13 } as const;
/** O nascimento vai de aqui até hoje (D-08), sem idade mínima. */
export const MIN_BIRTH_DATE = "1900-01-01";

export { MAX_LINK_LENGTH };

/** O mínimo que o GoTrue aceita, e o mesmo número que a v2 pedia. */
export const MIN_PASSWORD_LENGTH = 6;

/** O mínimo para um nome ser um nome, e não uma inicial. */
export const MIN_NAME_LENGTH = 3;

function invalid(message: string, field?: string): ApiError {
  return { code: "validation", message, ...(field ? { field } : {}) };
}

export function checkCredentials({ email, password }: Credentials): ApiError | null {
  if (!email.trim() || !password) return invalid("Informe e-mail e senha.");
  return null;
}

/**
 * O comprimento, e depois "só espaços" (QA-18). A senha que segue para o GoTrue
 * NÃO é aparada: a regra recusa o que não é senha, não reescreve o que foi
 * digitado. O login fica de fora — `checkCredentials` não muda —, para a conta
 * criada antes desta regra continuar entrando. A política do GoTrue também não
 * muda (D-10): quem chama a API direto ainda cria a conta, e o contrato é a
 * única barreira.
 */
export function checkPassword(password: string): ApiError | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return invalid(
      `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      "password",
    );
  }
  if (password.trim() === "") {
    return invalid("A senha não pode ser formada só por espaços.", "password");
  }
  return null;
}

export function checkSignUp({ name, email, password }: SignUpInput): ApiError | null {
  const nameError = checkName(name);
  if (nameError) return nameError;
  if (!email.trim()) return invalid("Informe seu e-mail.", "email");
  return checkPassword(password);
}

export function checkName(name: string): ApiError | null {
  const length = name.trim().length;
  if (length < MIN_NAME_LENGTH) return invalid("Informe seu nome completo.", "name");
  if (length > MAX_NAME_LENGTH) {
    return invalid(`O nome pode ter até ${MAX_NAME_LENGTH} caracteres.`, "name");
  }
  return null;
}

/**
 * O e-mail da busca do professor.
 *
 * Exige o `@` porque a busca casa o endereço INTEIRO: quem digita metade não
 * recebe "nenhum aluno com este e-mail", recebe a explicação de que a busca é
 * pelo endereço completo. Sem isto, a recusa do servidor e o engano de quem
 * digitou chegam com a mesma frase.
 */
export function checkStudentEmail(email: string): ApiError | null {
  const value = email.trim();
  if (!value) return invalid("Informe o e-mail do aluno.", "email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return invalid("Digite o e-mail inteiro do aluno, como ele o cadastrou.", "email");
  }
  return null;
}

/**
 * As vigências que o professor escolhe, e a `check` que o banco impõe.
 *
 * Três é o padrão — o valor que a v96 passava como literal em
 * `liberarAlunoAcesso`. Os quatro estão aqui, e não só na tela, porque
 * `access_grants_months_check` recusa qualquer outro: uma lista que exista só
 * no `<select>` diverge do banco na primeira tela nova.
 */
export const ACCESS_MONTHS: readonly number[] = [1, 3, 6, 12];
export const DEFAULT_ACCESS_MONTHS = 3;

export function checkAccessMonths(months: number): ApiError | null {
  if (!ACCESS_MONTHS.includes(months)) {
    return invalid("A vigência é de 1, 3, 6 ou 12 meses.", "months");
  }
  return null;
}

/** O nome da turma. Mesmo mínimo de um nome de pessoa: duas letras não nomeiam. */
export function checkClassName(name: string): ApiError | null {
  const length = name.trim().length;
  if (length < MIN_NAME_LENGTH) return invalid("Dê um nome à turma.", "name");
  if (length > MAX_NAME_LENGTH) {
    return invalid(`O nome da turma pode ter até ${MAX_NAME_LENGTH} caracteres.`, "name");
  }
  return null;
}

/** Nome e descrição, na ordem da tela. */
export function checkClass(input: ClassInput): ApiError | null {
  const name = checkClassName(input.name);
  if (name) return name;
  if ((input.description?.trim().length ?? 0) > MAX_NOTE_LENGTH) {
    return invalid(`A descrição pode ter até ${MAX_NOTE_LENGTH} caracteres.`, "description");
  }
  return null;
}

/**
 * O planejamento, na ordem da tela. Parcial porque `updatePlan` recebe só o que
 * mudou: o que falta não é validado.
 */
export function checkPlan(input: Partial<StudyPlanInput>): ApiError | null {
  if (input.name !== undefined) {
    const length = input.name.trim().length;
    if (length < MIN_NAME_LENGTH) return invalid("Dê um nome ao planejamento.", "name");
    if (length > MAX_NAME_LENGTH) {
      return invalid(`O nome do planejamento pode ter até ${MAX_NAME_LENGTH} caracteres.`, "name");
    }
  }
  if ((input.area?.trim().length ?? 0) > MAX_NAME_LENGTH) {
    return invalid(`A área pode ter até ${MAX_NAME_LENGTH} caracteres.`, "area");
  }
  if ((input.stage?.trim().length ?? 0) > MAX_NAME_LENGTH) {
    return invalid(`A fase pode ter até ${MAX_NAME_LENGTH} caracteres.`, "stage");
  }
  if ((input.studyModel?.trim().length ?? 0) > MAX_NAME_LENGTH) {
    return invalid(`O modelo de estudo pode ter até ${MAX_NAME_LENGTH} caracteres.`, "studyModel");
  }
  if ((input.targetExam?.trim().length ?? 0) > MAX_TITLE_LENGTH) {
    return invalid(`O concurso pode ter até ${MAX_TITLE_LENGTH} caracteres.`, "targetExam");
  }
  if (input.weeklyGoals !== undefined && (input.weeklyGoals < 1 || input.weeklyGoals > 60)) {
    return invalid("As metas por semana ficam entre 1 e 60.", "weeklyGoals");
  }
  if (input.examDate && input.startsOn && input.examDate < input.startsOn) {
    return invalid("A prova não pode ser antes do início.", "examDate");
  }
  return null;
}

/**
 * `""` passa (o caderno sem link); o resto é `https://` sem espaço, até 2048
 * (QA-24, D-09). A CHECK do banco é `^https://[^[:space:]]+$`, e `new URL`
 * aceita espaço no caminho: por isso o espaço é recusado aqui à parte. O valor
 * chega JÁ aparado — quem grava apara antes de chamar.
 */
export function checkLink(value: string, field: string): ApiError | null {
  if (value === "") return null;
  const message = /\s/.test(value) ? "Informe um link HTTPS válido." : validateHttpsLink(value);
  return message ? invalid(message, field) : null;
}

/** O caderno, na ordem da tela: nome, link, questões, meta. */
export function checkNotebook(notebook: Notebook): ApiError | null {
  const name = notebook.notebookName.trim();
  if (!name) return invalid("Dê um nome ao caderno.", "notebookName");
  if (name.length > MAX_TITLE_LENGTH) {
    return invalid(`O nome do caderno pode ter até ${MAX_TITLE_LENGTH} caracteres.`, "notebookName");
  }
  const link = checkLink(notebook.notebookLink.trim(), "notebookLink");
  if (link) return link;
  if (notebook.totalQuestions < 0) {
    return invalid("O total de questões não pode ser negativo.", "totalQuestions");
  }
  if (
    !Number.isInteger(notebook.subjectTarget) ||
    notebook.subjectTarget < 0 ||
    notebook.subjectTarget > 100
  ) {
    return invalid("A meta de acerto vai de 0 a 100%.", "subjectTarget");
  }
  return null;
}

/** O deck pessoal: disciplina de 2 a 120 e assunto de 2 a 160. */
export function checkPersonalDeck(input: { subject: string; title: string }): ApiError | null {
  const subject = input.subject.trim().length;
  const title = input.title.trim().length;
  if (subject < 2) return invalid("Informe a disciplina.", "subject");
  if (subject > MAX_NAME_LENGTH) {
    return invalid(`A disciplina pode ter até ${MAX_NAME_LENGTH} caracteres.`, "subject");
  }
  if (title < 2) return invalid("Informe o assunto do deck.", "title");
  if (title > MAX_DECK_TITLE_LENGTH) {
    return invalid(`O assunto pode ter até ${MAX_DECK_TITLE_LENGTH} caracteres.`, "title");
  }
  return null;
}

/** Dez anos de semanas. É o mesmo número de `goals_week_number_check`. */
export const MAX_WEEK_NUMBER = 520;

export function checkWeekNumber(week: number, field = "weekNumber"): ApiError | null {
  if (!Number.isInteger(week) || week < 1 || week > MAX_WEEK_NUMBER) {
    return invalid(
      field === "copyFromWeek"
        ? `A semana a copiar precisa ser um número inteiro de 1 a ${MAX_WEEK_NUMBER}.`
        : `A semana precisa ser um número inteiro de 1 a ${MAX_WEEK_NUMBER}.`,
      field,
    );
  }
  return null;
}

export function checkGenerateWeek(input: GenerateWeekInput): ApiError | null {
  return (
    checkWeekNumber(input.weekNumber) ??
    (input.copyFromWeek === undefined ? null : checkWeekNumber(input.copyFromWeek, "copyFromWeek"))
  );
}

/** O teto de um registro de estudo (D-04): o mesmo número de `goal_entries_minutes_check`. */
export const MAX_ENTRY_MINUTES = 240;
/** Idem, de `goal_entries_questions_check`. */
export const MAX_ENTRY_QUESTIONS = 500;

/**
 * As questões e os acertos de um registro, com as frases que o `checkStudyEntry`
 * fixou. Moram aqui, uma vez, porque a teoria (`checkQuestionRecord`) as repete.
 *
 * `Number.isInteger` recusa `NaN` (o `parseCount` devolve `NaN` para texto que
 * não é número inteiro) e 1.5. A frase de "acertos acima das questões" é a que o
 * e2e confere desde antes de esta regra morar aqui.
 */
function checkQuestionsAndCorrect(questions: number, correctAnswers: number): ApiError | null {
  if (!Number.isInteger(questions) || questions < 0 || questions > MAX_ENTRY_QUESTIONS) {
    return invalid(
      `Informe as questões em número inteiro, de 0 a ${MAX_ENTRY_QUESTIONS} por registro.`,
      "questions",
    );
  }
  if (!Number.isInteger(correctAnswers) || correctAnswers < 0) {
    return invalid("Informe os acertos em número inteiro, a partir de 0.", "correctAnswers");
  }
  if (correctAnswers > questions) {
    return invalid("Os acertos não podem passar do total de questões.", "correctAnswers");
  }
  return null;
}

/** Os números de um registro de estudo, na ordem em que a tela os pede. */
export function checkStudyEntry(input: {
  readonly minutes: number;
  readonly questions: number;
  readonly correctAnswers: number;
  readonly note?: string;
  readonly manualLesson?: string;
}): ApiError | null {
  const { minutes, questions, correctAnswers } = input;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_ENTRY_MINUTES) {
    return invalid(
      `Informe o tempo em minutos inteiros, de 0 a ${MAX_ENTRY_MINUTES} por registro.`,
      "minutes",
    );
  }
  const numbers = checkQuestionsAndCorrect(questions, correctAnswers);
  if (numbers) return numbers;
  if (minutes === 0 && questions === 0) {
    return invalid("Informe o tempo estudado ou as questões feitas.", "minutes");
  }
  return checkEntryText(input);
}

/**
 * A observação (2000) e a aula avulsa (200) de um registro. A RPC grava o que
 * receber, e `goal_entries_note_check` e `goal_entries_manual_lesson_check` são
 * a barreira do servidor: aqui a recusa chega com a frase certa.
 */
function checkEntryText(input: { readonly note?: string; readonly manualLesson?: string }): ApiError | null {
  if ((input.note?.trim().length ?? 0) > MAX_NOTE_LENGTH) {
    return invalid(`A observação pode ter até ${MAX_NOTE_LENGTH} caracteres.`, "note");
  }
  if ((input.manualLesson?.trim().length ?? 0) > MAX_TITLE_LENGTH) {
    return invalid(`A aula pode ter até ${MAX_TITLE_LENGTH} caracteres.`, "manualLesson");
  }
  return null;
}

/**
 * As questões da teoria, iniciais ou de revisão (R-TEO-09, R-TEO-21).
 *
 * Mesma faixa de `checkStudyEntry`, e uma regra própria: não há campo de minutos,
 * então "questão zero não é registro" — o `check_violation` das duas RPCs.
 */
export function checkQuestionRecord(input: {
  readonly questions: number;
  readonly correctAnswers: number;
}): ApiError | null {
  const { questions, correctAnswers } = input;
  if (Number.isInteger(questions) && questions < 1) {
    return invalid("Informe quantas questões você fez.", "questions");
  }
  return checkQuestionsAndCorrect(questions, correctAnswers);
}

/** `AAAA-MM-DD` que sobrevive à ida e volta por `Date`: `2026-02-30` não passa. */
function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** A data do estudo extra vai do início do planejamento até hoje (D-05, D-11). */
export function checkExtraStudyDate(
  date: string,
  planStartsOn: IsoDate,
  today: IsoDate,
): ApiError | null {
  if (!isRealIsoDate(date)) return invalid("Informe a data do estudo.", "date");
  if (date < planStartsOn || date > today) {
    return invalid("A data precisa estar entre o início do planejamento e hoje.", "date");
  }
  return null;
}

/** Na ordem dos campos do diálogo: matéria, data, números. */
export function checkExtraStudy(
  input: Pick<ExtraStudyInput, "subject" | "date" | "minutes" | "questions" | "correctAnswers" | "note">,
  planStartsOn: IsoDate,
  today: IsoDate,
): ApiError | null {
  const subject = input.subject.trim();
  if (!subject) return invalid("Informe a matéria.", "subject");
  if (subject.length > MAX_NAME_LENGTH) {
    return invalid(`A matéria pode ter até ${MAX_NAME_LENGTH} caracteres.`, "subject");
  }
  return checkExtraStudyDate(input.date, planStartsOn, today) ?? checkStudyEntry(input);
}

/**
 * `23505` de `record_goal_entry`, `record_extra_study`, `record_initial_questions`
 * e `record_review_questions`: a mesma chave com outra carga. É raro (a chave
 * nasce uma vez por abertura do diálogo), mas a frase genérica de `23505`, "Este
 * registro já existe.", mandaria a pessoa tentar de novo com a mesma chave e o
 * mesmo erro.
 */
export const STUDY_REPLAY_CONFLICT =
  "Este estudo já foi registrado com outros valores. Atualize a página para ver o que foi gravado.";

/**
 * A lista de espera, na ordem da tela: nome, WhatsApp, área, concurso, nascimento.
 * Uma faixa só (D-08, QA-19): o banco pedia 8 a 30 caracteres, o adaptador só
 * "não vazio" e a fixture 10 dígitos, cada um com uma frase.
 *
 * `today` entra por parâmetro para o teste fixar a data. O banco compara com o
 * `current_date` dele, em UTC: às 22h em Brasília já é o dia seguinte lá, então
 * o contrato recusa antes, e o contrário não acontece no Brasil.
 */
export function checkWaitlist(input: WaitlistInput, today: IsoDate): ApiError | null {
  const name = checkName(input.name);
  if (name) return name;

  const whatsapp = input.whatsapp.trim();
  if (!whatsapp) {
    return invalid("Informe um WhatsApp para o professor falar com você.", "whatsapp");
  }
  const digits = whatsapp.replace(/\D/g, "").length;
  if (
    whatsapp.length > MAX_WHATSAPP_LENGTH ||
    !/^[0-9 ()+-]+$/.test(whatsapp) ||
    digits < WHATSAPP_DIGITS.min ||
    digits > WHATSAPP_DIGITS.max
  ) {
    return invalid("Informe o WhatsApp com DDD, como (11) 90000-0000.", "whatsapp");
  }

  const area = input.interestArea.trim().length;
  if (area < 2) return invalid("Informe sua área de interesse.", "interestArea");
  if (area > MAX_NAME_LENGTH) {
    return invalid(`A área de interesse pode ter até ${MAX_NAME_LENGTH} caracteres.`, "interestArea");
  }
  const exam = input.targetExam.trim().length;
  if (exam < 2) return invalid("Informe para qual concurso você estuda.", "targetExam");
  if (exam > MAX_TITLE_LENGTH) {
    return invalid(`O concurso pode ter até ${MAX_TITLE_LENGTH} caracteres.`, "targetExam");
  }

  if (
    input.birthDate !== undefined &&
    (!isRealIsoDate(input.birthDate) || input.birthDate < MIN_BIRTH_DATE || input.birthDate > today)
  ) {
    return invalid("A data de nascimento precisa ser entre 01/01/1900 e hoje.", "birthDate");
  }
  return null;
}

/**
 * Os conflitos de nome, com a frase que as DUAS implementações devolvem. O
 * `23505` é identificado pelo NOME do índice (`isUniqueViolation`), nunca por
 * frase de interface: o deck pessoal tem PK escolhida pelo cliente, e um replay
 * com o mesmo `id` também dá `23505`, em outro índice, sem ser deck repetido.
 */
export const PLAN_NAME_TAKEN: ApiError = {
  code: "conflict",
  message: "Este aluno já tem um planejamento com esse nome.",
  field: "name",
};
export const CLASS_NAME_TAKEN: ApiError = {
  code: "conflict",
  message: "Você já tem uma turma com esse nome.",
  field: "name",
};
export const DECK_TAKEN: ApiError = {
  code: "conflict",
  message: "Você já tem um deck com essa disciplina e esse assunto.",
  field: "title",
};
