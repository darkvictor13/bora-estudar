/**
 * AS REGRAS DA SEMANA, PURAS.
 *
 * Nada aqui toca rede, banco ou DOM: entram listas, sai o que a tela mostra.
 * Moram fora do componente e fora do adaptador por um motivo que a versão
 * anterior provou caro — três caminhos independentes calculando o mesmo número
 * divergem, e o que diverge em silêncio é o que ninguém conserta. Aqui há um
 * caminho, e ele tem teste.
 *
 * Quem chama é o ADAPTADOR, não a tela: o contrato promete `WeekSummary` já
 * agregado, e é aqui que a agregação acontece de verdade.
 */
import type { DayGroup, Goal, IsoDate, StudyEntry, Weekday, WeekSummary } from "@/lib/api";

/** `2026-09-14` + 3 = `2026-09-17`. Aritmética em UTC: data sem hora não tem fuso. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Quantos dias separam duas datas. Negativo quando `to` é anterior. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * O primeiro e o último dia de uma semana do planejamento.
 *
 * A semana 1 começa no `starts_on` do planejamento, e não na segunda-feira do
 * calendário: um planejamento que começa numa quarta tem a semana 1 de quarta a
 * terça. É como a v2 conta, e é o que faz `weekday` (1 a 7) continuar
 * significando segunda a domingo sem que a semana precise começar na segunda.
 */
export function weekBounds(
  planStartsOn: IsoDate,
  weekNumber: number,
): { startsOn: IsoDate; endsOn: IsoDate } {
  const startsOn = addDays(planStartsOn, (weekNumber - 1) * 7);
  return { startsOn, endsOn: addDays(startsOn, 6) };
}

/**
 * Em que semana do planejamento cai uma data. A primeira é 1.
 *
 * Antes do início devolve 1, e não zero nem negativo: quem abre o site antes de
 * o planejamento começar precisa ver a primeira semana, não uma tela vazia.
 */
export function weekNumberOf(planStartsOn: IsoDate, date: IsoDate): number {
  const offset = daysBetween(planStartsOn, date);
  if (offset < 0) return 1;
  return Math.floor(offset / 7) + 1;
}

/**
 * A data de um dia da semana dentro de uma semana do planejamento.
 *
 * `weekday` é 1 = segunda … 7 = domingo. A semana do planejamento pode começar
 * em qualquer dia, então a posição de um `weekday` dentro dela depende de em
 * que dia da semana o planejamento começou.
 */
export function dateOfWeekday(weekStartsOn: IsoDate, weekday: Weekday): IsoDate {
  // `getUTCDay()` é 0 = domingo; aqui 7 = domingo.
  const startWeekday = new Date(`${weekStartsOn}T00:00:00Z`).getUTCDay() || 7;
  const offset = (weekday - startWeekday + 7) % 7;
  return addDays(weekStartsOn, offset);
}

/**
 * Agrupa as metas por dia, na ordem da semana.
 *
 * DIA SEM META NÃO APARECE. A v2 mostra só os dias que têm algo, e é o que
 * mantém a semana legível: sete cartões, quatro deles vazios, fazem a pessoa
 * rolar para encontrar o que importa.
 *
 * Dentro do dia a ordem é `dayPosition`, e o desempate é o título — sem ele
 * duas metas na mesma posição trocariam de lugar entre duas leituras, e a
 * pessoa que clicou na segunda concluiria a primeira.
 */
export function groupIntoDays(
  goals: readonly Goal[],
  weekStartsOn: IsoDate,
): readonly DayGroup[] {
  const byWeekday = new Map<Weekday, Goal[]>();
  for (const goal of goals) {
    const list = byWeekday.get(goal.weekday);
    if (list) list.push(goal);
    else byWeekday.set(goal.weekday, [goal]);
  }

  return [...byWeekday.entries()]
    .map(([weekday, list]) => ({
      weekday,
      date: dateOfWeekday(weekStartsOn, weekday),
      goals: [...list].sort(
        (a, b) => a.dayPosition - b.dayPosition || a.title.localeCompare(b.title, "pt-BR"),
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Dias SEGUIDOS com pelo menos um registro, contando até hoje.
 *
 * Duas decisões que a v2 tomou e que valem manter:
 *
 * - **Hoje sem registro não zera a sequência.** O dia ainda não acabou, e
 *   zerar às 8 da manhã pune quem estuda à noite. A contagem começa em hoje se
 *   houver registro hoje, e em ontem se não houver.
 * - **A sequência é de DIAS COM REGISTRO, não de dias com meta concluída.**
 *   Quem estudou e não fechou a meta estudou.
 */
export function streakDays(dates: readonly IsoDate[], todayDate: IsoDate): number {
  const studied = new Set(dates);
  let cursor = studied.has(todayDate) ? todayDate : addDays(todayDate, -1);

  let count = 0;
  while (studied.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * O cabeçalho da semana.
 *
 * O DESEMPENHO SAI DOS REGISTROS, NÃO DAS METAS. Somar `goal.questionsAnswered`
 * daria o mesmo número enquanto as duas fontes concordassem — e elas divergem
 * no instante em que alguém apaga um registro e o contador da meta não
 * acompanha. O ledger é a fonte; a meta é o plano.
 */
export function summarizeWeek(
  goals: readonly Goal[],
  entries: readonly StudyEntry[],
  todayDate: IsoDate,
  entryDates: readonly IsoDate[],
): WeekSummary {
  const questionsAnswered = entries.reduce((sum, entry) => sum + entry.questions, 0);
  const correctAnswers = entries.reduce((sum, entry) => sum + entry.correctAnswers, 0);

  return {
    score: questionsAnswered > 0 ? Math.round((correctAnswers / questionsAnswered) * 100) : null,
    studiedMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
    questionsAnswered,
    correctAnswers,
    streakDays: streakDays(entryDates, todayDate),
    goalsTotal: goals.length,
    goalsCompleted: goals.filter((goal) => goal.status === "completed").length,
  };
}

/**
 * O estado que os REGISTROS justificam, ignorando o que a meta diz.
 *
 * É o que `reopenGoal` precisa: desfazer a conclusão não devolve a meta a
 * `pending` sempre — uma meta com registro volta para `in_progress`, senão a
 * pessoa vê "pendente" numa linha que mostra duas horas estudadas.
 */
export function statusFromEntries(entryCount: number): "pending" | "in_progress" {
  return entryCount > 0 ? "in_progress" : "pending";
}

/** `135` → `2h15`. `60` → `1h`. `45` → `45min`. É o `horaTexto` da v2. */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}
