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
import type {
  ApiError,
  Credentials,
  ExtraStudyInput,
  GenerateWeekInput,
  IsoDate,
  SignUpInput,
} from "./contract.ts";

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

export function checkPassword(password: string): ApiError | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return invalid(
      `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      "password",
    );
  }
  return null;
}

export function checkSignUp({ name, email, password }: SignUpInput): ApiError | null {
  if (name.trim().length < MIN_NAME_LENGTH) return invalid("Informe seu nome completo.", "name");
  if (!email.trim()) return invalid("Informe seu e-mail.", "email");
  return checkPassword(password);
}

export function checkName(name: string): ApiError | null {
  if (name.trim().length < MIN_NAME_LENGTH) return invalid("Informe seu nome completo.", "name");
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
  if (name.trim().length < MIN_NAME_LENGTH) return invalid("Dê um nome à turma.", "name");
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
 * Os números de um registro de estudo, na ordem em que a tela os pede.
 *
 * `Number.isInteger` recusa `NaN` (o `parseCount` devolve `NaN` para texto que
 * não é número inteiro) e 1.5. A frase de "acertos acima das questões" é a que o
 * e2e confere desde antes de esta regra morar aqui.
 */
export function checkStudyEntry(input: {
  readonly minutes: number;
  readonly questions: number;
  readonly correctAnswers: number;
}): ApiError | null {
  const { minutes, questions, correctAnswers } = input;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_ENTRY_MINUTES) {
    return invalid(
      `Informe o tempo em minutos inteiros, de 0 a ${MAX_ENTRY_MINUTES} por registro.`,
      "minutes",
    );
  }
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
  if (minutes === 0 && questions === 0) {
    return invalid("Informe o tempo estudado ou as questões feitas.", "minutes");
  }
  return null;
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
  input: Pick<ExtraStudyInput, "subject" | "date" | "minutes" | "questions" | "correctAnswers">,
  planStartsOn: IsoDate,
  today: IsoDate,
): ApiError | null {
  if (!input.subject.trim()) return invalid("Informe a matéria.", "subject");
  return checkExtraStudyDate(input.date, planStartsOn, today) ?? checkStudyEntry(input);
}

/**
 * `23505` de `record_goal_entry` e `record_extra_study`: a mesma chave com outra
 * carga. É raro (a chave nasce uma vez por abertura do diálogo), mas a frase
 * genérica de `23505`, "Este registro já existe.", mandaria a pessoa tentar de
 * novo com a mesma chave e o mesmo erro.
 */
export const STUDY_REPLAY_CONFLICT =
  "Este estudo já foi registrado com outros valores. Atualize a página para ver o que foi gravado.";
