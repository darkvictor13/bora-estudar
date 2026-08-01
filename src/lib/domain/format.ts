export type FeedbackTone = "danger" | "info" | "success" | "warning";

const statusLabels: Record<string, string> = {
  ativo: "Ativo",
  aguardando: "Aguardando",
  arquivado: "Arquivado",
  bloqueado: "Bloqueado",
  cancelada: "Cancelada",
  cancelado: "Cancelado",
  concluida: "Concluída",
  concluido: "Concluído",
  contatado: "Contatado",
  convertido: "Convertido",
  em_andamento: "Em andamento",
  encerrado: "Encerrado",
  expirado: "Expirado",
  pausado: "Pausado",
  pendente: "Pendente",
  pulada: "Pulada",
};

export function statusLabel(status: string | null | undefined) {
  if (!status) return "Não informado";
  return statusLabels[status] ?? status.replaceAll("_", " ");
}

export function statusTone(status: string | null | undefined): FeedbackTone {
  if (["ativo", "concluida", "concluido", "convertido"].includes(status ?? "")) return "success";
  if (["bloqueado", "cancelada", "cancelado", "expirado"].includes(status ?? "")) return "danger";
  if (["aguardando", "contatado", "em_andamento", "pausado", "pendente", "pulada"].includes(status ?? "")) return "warning";
  return "info";
}

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { day: value("day"), month: value("month"), year: value("year") };
}

export function formatDate(value: string | null | undefined, includeTime = false, timeZone = "America/Sao_Paulo") {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      ...(includeTime ? { timeStyle: "short" as const } : {}),
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      ...(includeTime ? { timeStyle: "short" as const } : {}),
      timeZone: "America/Sao_Paulo",
    }).format(date);
  }
}

export function formatMinutes(value: number | null | undefined) {
  if (!value) return "0 min";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}

export function errorMessage(error: unknown, fallback = "Não foi possível concluir a operação.") {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : error instanceof Error
        ? error.message
        : "";

  if (!message) return fallback;
  if (/permission|permissão|row-level|rls/i.test(message)) return "Você não possui permissão para realizar esta operação.";
  if (/duplicate|unique|unicidade/i.test(message)) return "Já existe um registro com essas informações.";
  if (/network|fetch|connection|conexão/i.test(message)) return "Não foi possível conectar ao serviço. Tente novamente.";
  return message;
}

export function todayInTimeZone(timeZone = "America/Sao_Paulo") {
  try {
    const { day, month, year } = datePartsInTimeZone(new Date(), timeZone);
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  } catch {
    return todayInTimeZone("America/Sao_Paulo");
  }
}

export function currentDayInTimeZone(timeZone = "America/Sao_Paulo") {
  const [year, month, day] = todayInTimeZone(timeZone).split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function currentPlanningWeek(startDate: string | null | undefined, timeZone = "America/Sao_Paulo") {
  if (!startDate) return 1;
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = todayInTimeZone(timeZone).split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const days = Math.floor((today - start) / 86_400_000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

export function dayLabel(day: number) {
  return ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"][day] ?? `Dia ${day}`;
}
