/**
 * O PORTÃO DOS MATERIAIS.
 *
 * `public/materials/` é servido como arquivo estático, e arquivo estático não
 * pergunta quem está pedindo: o PDF de uma aula paga abria para qualquer pessoa
 * com a URL, sem conta (auditoria de prontidão, M4). As telas mostram links
 * `/materials/prf/….pdf` — é o formato que o professor cola e que
 * `lib/domain/lesson-resources.ts` valida —, então o portão fica NA FRENTE do
 * caminho e não troca as URLs: só deixa passar quem tem sessão válida e acesso
 * vigente, ou é professor. É a mesma regra das tabelas de conteúdo
 * (`has_active_access() or is_teacher()`), perguntada ao próprio banco.
 *
 * Só `/materials/*` passa por aqui (`assets.run_worker_first` em
 * `wrangler.jsonc`); o resto do site continua sendo servido direto pela
 * camada de assets, sem executar este código.
 *
 * COMO A SESSÃO CHEGA: o cliente usa `@supabase/ssr`, que guarda a sessão em
 * cookie `sb-<ref>-auth-token`, em pedaços (`.0`, `.1`…) quando passa de ~3 KB,
 * com o valor em `base64-` + base64url do JSON. O navegador manda o cookie ao
 * abrir o link, então o portão não exige cabeçalho nenhum do front.
 *
 * O NOME DO COOKIE SAI DA URL DO SUPABASE CONFIGURADA, e nunca do que o
 * cliente mandou: se o portão aceitasse qualquer `sb-*-auth-token`, quem criasse
 * um projeto próprio no Supabase mandaria o token dele e seria validado contra
 * o projeto dele.
 *
 * FALHA FECHADA: sem as duas variáveis, ou com o Supabase fora do ar, responde
 * 503 e não entrega o arquivo.
 */

export interface Env {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  /** `https://<ref>.supabase.co`. Vem de `--var` no deploy, não de `wrangler.jsonc`. */
  readonly SUPABASE_URL?: string | undefined;
  readonly SUPABASE_PUBLISHABLE_KEY?: string | undefined;
}

/** As duas variáveis, já conferidas como presentes. */
interface Config {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_PUBLISHABLE_KEY: string;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type Verdict = "allowed" | "no-session" | "no-access" | "unavailable";

/** O nome-base do cookie, como o `supabase-js` o monta: o primeiro rótulo do host. */
export function authCookieName(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** O `access_token` do cookie de sessão, ou `null` se não houver ou estiver ilegível. */
export function readAccessToken(cookieHeader: string | null, baseName: string): string | null {
  if (!cookieHeader) return null;

  const cookies = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }

  let raw = cookies.get(baseName) ?? null;
  if (raw === null) {
    // Em pedaços: `.0`, `.1`… até faltar um. Um buraco na sequência é cookie
    // quebrado, e juntar o que sobrou só produziria um JSON inválido.
    const chunks: string[] = [];
    for (let i = 0; cookies.has(`${baseName}.${i}`); i += 1) chunks.push(cookies.get(`${baseName}.${i}`)!);
    if (chunks.length === 0) return null;
    raw = chunks.join("");
  }

  try {
    const text = decodeURIComponent(raw);
    const json = text.startsWith("base64-") ? decodeBase64Url(text.slice("base64-".length)) : text;
    const session: unknown = JSON.parse(json);
    const token = (session as { access_token?: unknown } | null)?.access_token;
    return typeof token === "string" && token !== "" ? token : null;
  } catch {
    return null;
  }
}

async function rpc(name: string, token: string, env: Config, fetchImpl: FetchLike) {
  return fetchImpl(`${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
}

async function judge(token: string, env: Config, fetchImpl: FetchLike): Promise<Verdict> {
  try {
    const access = await rpc("has_active_access", token, env, fetchImpl);
    // JWT vencido ou adulterado: o PostgREST recusa antes de chamar a função.
    if (access.status === 401 || access.status === 403) return "no-session";
    if (!access.ok) return "unavailable";
    if ((await access.json()) === true) return "allowed";

    const teacher = await rpc("is_teacher", token, env, fetchImpl);
    if (!teacher.ok) return "unavailable";
    return (await teacher.json()) === true ? "allowed" : "no-access";
  } catch {
    return "unavailable";
  }
}

function refuse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function gate(request: Request, env: Env, fetchImpl: FetchLike = fetch): Promise<Response> {
  if (!new URL(request.url).pathname.startsWith("/materials/")) return env.ASSETS.fetch(request);

  if (request.method !== "GET" && request.method !== "HEAD") {
    const response = refuse(405, "Método não permitido.");
    response.headers.set("allow", "GET, HEAD");
    return response;
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return refuse(503, "Materiais indisponíveis no momento. Tente novamente em instantes.");
  }
  const config = { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY };

  const token = readAccessToken(request.headers.get("cookie"), authCookieName(config.SUPABASE_URL));
  if (!token) return refuse(401, "Entre na sua conta para abrir este material.");

  const verdict = await judge(token, config, fetchImpl);
  if (verdict === "no-session") return refuse(401, "Sua sessão expirou. Entre de novo para abrir este material.");
  if (verdict === "no-access") return refuse(403, "O seu acesso não está liberado para este material.");
  if (verdict === "unavailable") return refuse(503, "Materiais indisponíveis no momento. Tente novamente em instantes.");

  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  // O que o portão libera é por pessoa: nenhum cache compartilhado pode guardar.
  headers.set("cache-control", "private, no-store");
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => gate(request, env),
};
