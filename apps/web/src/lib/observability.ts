/**
 * O RELATO DE ERRO, LIGADO ANTES DE QUALQUER OUTRA COISA.
 *
 * ## Por que este módulo existe, em vez de um `Sentry.init` no `main.tsx`
 *
 * `lib/env.ts` LANÇA na avaliação do módulo quando falta uma `VITE_*`. Import é
 * hoisted: `import { router } from "@/router"` avalia `env.ts` ANTES da primeira
 * linha do corpo de `main.tsx`. Um `init` escrito lá nunca rodaria justamente no
 * deploy compilado sem as variáveis — a tela branca que `scripts/fumaca.sh`
 * existe para farejar, e o erro que mais interessa relatar.
 *
 * Por isso o init é EFEITO DE IMPORTAÇÃO deste arquivo, que o `main.tsx` importa
 * primeiro, e por isso ele NÃO importa `@/lib/env`: as variáveis são lidas aqui
 * direto de `import.meta.env`, sem passar pela validação que interrompe.
 *
 * Pelo mesmo motivo a importação é de `@/lib/api/contract` e não de `@/lib/api`:
 * o `index.ts` da API monta as duas implementações, e a do Supabase puxa
 * `lib/env.ts` junto.
 *
 * ## Sem DSN, nada acontece
 *
 * DSN vazio é o estado de desenvolvimento e o da suíte e2e: `init` não é
 * chamado, nenhuma requisição sai, e as funções abaixo devolvem `null`. É o que
 * mantém de pé a regra de a suíte não falar com terceiro, e o que impede erro de
 * desenvolvimento de poluir o painel do ambiente publicado.
 *
 * ## O que é relatado, e o que não é
 *
 * `code` de `ApiThrownError` decide. Acesso vencido, registro inexistente e rede
 * caída são ESTADOS do produto — a tela já os explica, e relatá-los encheria o
 * painel do que ninguém vai corrigir. O que sobra é o que ninguém previu.
 */
import { captureException, init, setUser, withScope } from "@sentry/react";

import { ApiThrownError, type ApiErrorCode } from "@/lib/api/contract";

/**
 * Estados do produto, não defeitos.
 *
 * `forbidden` é o acesso vencido do aluno, e seria o evento mais volumoso de
 * todos. `not_found` cobre o aluno de outro professor e o planejamento que
 * ainda não existe. `offline` é a rede de quem estuda no celular.
 */
const EXPECTED: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  "unauthenticated",
  "forbidden",
  "not_found",
  "access_expired",
  "offline",
  "validation",
]);

/**
 * Liga o relato, se houver para onde.
 *
 * Chamado na importação, e não exportado: quem importa este módulo já o ligou.
 */
function start(): boolean {
  // Acesso literal a cada `import.meta.env.VITE_*`: o Vite faz substituição
  // estática e só reconhece esta forma. Indexar por variável compila para
  // `undefined` em produção, sem aviso.
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return false;

  // O SHA do commit, que é o que liga o stack trace ao código publicado. Entra
  // por espalhamento condicional, e não como `release: valor ?? undefined`:
  // `exactOptionalPropertyTypes` recusa `undefined` numa propriedade opcional.
  const release = import.meta.env.VITE_APP_VERSION;

  init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? "desconhecido",
    ...(release ? { release } : {}),

    // NENHUM DADO PESSOAL SAI DAQUI. O produto é de estudo para concurso: nome,
    // desempenho e planejamento do aluno são dele. A identidade vai por `id` —
    // UUID, que cruza com o banco sem transportar e-mail nem IP.
    sendDefaultPii: false,

    // `tracesSampleRate` ausente desliga o tracing, e `vite.config.ts` remove o
    // código dele do bundle por `__SENTRY_TRACING__`. Session Replay não entra:
    // gravaria a tela do aluno, o que é decisão de privacidade e não de infra.
  });

  return true;
}

const enabled = start();

/**
 * O mesmo erro, relatado uma vez só.
 *
 * `RouteError` monta sob StrictMode e a mesma instância pode chegar aqui duas
 * vezes; guardar o id devolvido mantém o código que a tela mostra estável entre
 * as montagens, em vez de trocar de valor na frente de quem está lendo.
 */
const reported = new WeakMap<object, string>();

function shouldReport(error: unknown): boolean {
  // `redirect()` e o 404 de rota são Response, e passam pelo `ErrorBoundary`
  // por decisão de quem escreveu o loader — não são falha.
  if (error instanceof Response) return false;
  if (error instanceof ApiThrownError) return !EXPECTED.has(error.code);
  return true;
}

/**
 * Relata a falha que o `ErrorBoundary` da rota pegou, e devolve o código do
 * evento para a tela mostrar — `null` quando nada foi relatado.
 *
 * ESTE É O PONTO QUE UMA INSTALAÇÃO DE MANUAL NÃO TEM. O React Router em modo
 * data captura a exceção do loader e renderiza o `ErrorBoundary`: ela não é
 * relançada, e portanto não chega em `window.onerror` nem nos handlers globais
 * do SDK. Sem esta chamada, o modo de falha mais comum do produto — leitura que
 * falhou — seria o único que ninguém veria.
 */
export function captureRouteError(error: unknown): string | null {
  if (!enabled || !shouldReport(error)) return null;

  const key = typeof error === "object" && error !== null ? error : null;
  const seen = key && reported.get(key);
  if (seen) return seen;

  const eventId = withScope((scope) => {
    scope.setTag("origem", "loader");
    if (error instanceof ApiThrownError) scope.setTag("api_error_code", error.code);
    return captureException(error);
  });

  if (key) reported.set(key, eventId);
  return eventId;
}

/**
 * Relata o erro de ESCRITA que o adaptador não previu.
 *
 * O contrato manda a escrita devolver `Result` em vez de lançar, então nada
 * disto chega a um `ErrorBoundary`: sem esta chamada, uma gravação que falha por
 * motivo desconhecido é vista pela pessoa e por mais ninguém. `unknown` é
 * exatamente o `default` dos dois tradutores de `supabase/errors.ts` — a
 * afirmação, escrita pelo próprio adaptador, de que ele não sabe o que houve.
 */
export function captureUnexpectedFailure(message: string, cause?: unknown): void {
  if (!enabled) return;

  withScope((scope) => {
    scope.setTag("origem", "escrita");
    captureException(new Error(message, cause === undefined ? undefined : { cause }));
  });
}

/**
 * Quem está usando, para o erro não chegar anônimo.
 *
 * Só o `id`. `email` e `name` existem na sessão e ficam onde estão — ver
 * `sendDefaultPii` acima.
 */
export function identify(profileId: string | null): void {
  if (!enabled) return;
  setUser(profileId === null ? null : { id: profileId });
}
