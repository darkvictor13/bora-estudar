/**
 * Data e instante são coisas diferentes (N-04, QA-20, D-11).
 *
 * `IsoDate` (`2026-10-06`) é um DIA do calendário, sem hora e sem fuso: fatia-se.
 * `IsoDateTime` (`2026-10-07T02:30:00+00:00`) é um INSTANTE: o dia em que ele cai
 * depende de onde a pessoa está, e fatiar o texto devolve o dia UTC — 3h
 * adiantado em Brasília, e o dia seguinte depois das 21h.
 *
 * Os dois tipos são `string`, e o compilador não separa um do outro: passar
 * instante a `formatDate` imprime a data UTC em silêncio, exatamente o defeito.
 * Quem recebe `timestamptz` usa `formatInstant`; quem recebe `date`, `formatDate`.
 *
 * Os instantes usam os getters LOCAIS do `Date`, que é o mesmo fuso do `Intl` sem
 * `timeZone` (D-11), com saída fixa — `dd/mm/aaaa` e `dd/mm/aaaa HH:MM` — que não
 * varia com a versão do ICU. Imports só de tipo e relativos: o `node --test` não
 * resolve `@/`.
 */
import type { IsoDate, IsoDateTime } from "../api/contract.ts";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026-10-06` → `06/10/2026`. Fatia, sem fuso: é um dia, não um instante. */
export function formatDate(date: IsoDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** `2026-10-06` → `06/10`. */
export function formatDayMonth(date: IsoDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/**
 * Um instante, no fuso do aparelho: `06/10/2026` ou `06/10/2026 23:30`.
 * Texto que não é data devolve como veio, em vez de imprimir `NaN/NaN`.
 */
export function formatInstant(value: IsoDateTime, style: "date" | "dateTime" = "date"): string {
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return value;
  const day = `${pad(moment.getDate())}/${pad(moment.getMonth() + 1)}/${moment.getFullYear()}`;
  if (style === "date") return day;
  return `${day} ${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
}

/** O dia LOCAL de um instante, sem passar por UTC. */
export function localDateOf(value: Date | IsoDateTime): IsoDate {
  const moment = typeof value === "string" ? new Date(value) : value;
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}

/** Hoje, no fuso de quem está usando. */
export function todayLocal(): IsoDate {
  return localDateOf(new Date());
}

/**
 * O instante já passou? A mesma fronteira de `has_active_access()`
 * (`access_expires_at > now()`): no instante exato, já venceu.
 */
export function hasExpired(value: IsoDateTime, now: number = Date.now()): boolean {
  return Date.parse(value) <= now;
}
