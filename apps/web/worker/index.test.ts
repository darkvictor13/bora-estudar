import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authCookieName, gate, readAccessToken, type Env } from "./index.ts";

const URL_ = "https://abcd1234.supabase.co";
const COOKIE = "sb-abcd1234-auth-token";

function session(token: string): string {
  return "base64-" + Buffer.from(JSON.stringify({ access_token: token, refresh_token: "r" })).toString("base64url");
}

function env(overrides: Partial<Env> = {}): Env & { assetCalls: number } {
  const state = { assetCalls: 0 };
  return Object.assign(state, {
    ASSETS: {
      fetch: async () => {
        state.assetCalls += 1;
        return new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } });
      },
    },
    SUPABASE_URL: URL_,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    ...overrides,
  });
}

/** Um Supabase de mentira: responde a cada RPC com o que o teste mandar. */
function supabase(answers: Record<string, { status?: number; body?: unknown }>) {
  const seen: { rpc: string; token: string; apikey: string }[] = [];
  const fetchImpl = async (input: string, init: RequestInit) => {
    const rpc = input.split("/rpc/")[1]!;
    const headers = init.headers as Record<string, string>;
    seen.push({ rpc, token: headers["authorization"]!, apikey: headers["apikey"]! });
    const answer = answers[rpc] ?? { status: 500 };
    return new Response(JSON.stringify(answer.body ?? null), { status: answer.status ?? 200 });
  };
  return { fetchImpl, seen };
}

const request = (cookie?: string, init: RequestInit = {}) =>
  new Request("https://app.example/materials/prf/informatica/aula.pdf", {
    ...init,
    headers: cookie ? { cookie } : {},
  });

describe("authCookieName", () => {
  it("é o primeiro rótulo do host, como o supabase-js monta", () => {
    assert.equal(authCookieName(URL_), COOKIE);
    assert.equal(authCookieName("http://127.0.0.1:54321"), "sb-127-auth-token");
  });
});

describe("readAccessToken", () => {
  it("lê o valor base64- do cookie inteiro", () => {
    assert.equal(readAccessToken(`${COOKIE}=${session("tok")}`, COOKIE), "tok");
  });

  it("junta os pedaços .0, .1… na ordem", () => {
    const value = session("tok-longo");
    const half = Math.floor(value.length / 2);
    const header = `${COOKIE}.1=${value.slice(half)}; outro=1; ${COOKIE}.0=${value.slice(0, half)}`;
    assert.equal(readAccessToken(header, COOKIE), "tok-longo");
  });

  it("não junta pedaços com buraco na sequência", () => {
    const value = session("tok");
    assert.equal(readAccessToken(`${COOKIE}.0=${value.slice(0, 8)}; ${COOKIE}.2=${value.slice(8)}`, COOKIE), null);
  });

  it("aceita JSON cru e valor com percent-encoding", () => {
    assert.equal(readAccessToken(`${COOKIE}=${encodeURIComponent(JSON.stringify({ access_token: "cru" }))}`, COOKIE), "cru");
  });

  it("ignora o cookie de OUTRO projeto, porque o nome vem da URL configurada", () => {
    assert.equal(readAccessToken(`sb-evil-auth-token=${session("tok")}`, COOKIE), null);
  });

  it("devolve null para ausente, ilegível e sem access_token", () => {
    assert.equal(readAccessToken(null, COOKIE), null);
    assert.equal(readAccessToken("a=b", COOKIE), null);
    assert.equal(readAccessToken(`${COOKIE}=base64-%%%`, COOKIE), null);
    assert.equal(readAccessToken(`${COOKIE}=${encodeURIComponent('{"x":1}')}`, COOKIE), null);
    assert.equal(readAccessToken(`${COOKIE}=${encodeURIComponent('{"access_token":""}')}`, COOKIE), null);
  });
});

describe("gate", () => {
  it("o que não é /materials/ passa direto, sem perguntar ao banco", async () => {
    const e = env();
    const { fetchImpl, seen } = supabase({});
    const response = await gate(new Request("https://app.example/aluno"), e, fetchImpl);
    assert.equal(response.status, 200);
    assert.equal(seen.length, 0);
  });

  it("sem cookie: 401, e o arquivo não é buscado", async () => {
    const e = env();
    const response = await gate(request(), e, supabase({}).fetchImpl);
    assert.equal(response.status, 401);
    assert.equal(e.assetCalls, 0);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("aluno com acesso vigente: entrega o PDF, sem cache compartilhado, com o token e a chave certos", async () => {
    const e = env();
    const { fetchImpl, seen } = supabase({ has_active_access: { body: true } });
    const response = await gate(request(`${COOKIE}=${session("tok")}`), e, fetchImpl);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "%PDF-1.7");
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(seen, [{ rpc: "has_active_access", token: "Bearer tok", apikey: "sb_publishable_x" }]);
  });

  it("professor sem acesso de aluno também abre", async () => {
    const e = env();
    const { fetchImpl, seen } = supabase({ has_active_access: { body: false }, is_teacher: { body: true } });
    const response = await gate(request(`${COOKIE}=${session("tok")}`), e, fetchImpl);
    assert.equal(response.status, 200);
    assert.deepEqual(seen.map((call) => call.rpc), ["has_active_access", "is_teacher"]);
  });

  it("logado sem acesso vigente e sem ser professor: 403, e o arquivo não é buscado", async () => {
    const e = env();
    const { fetchImpl } = supabase({ has_active_access: { body: false }, is_teacher: { body: false } });
    const response = await gate(request(`${COOKIE}=${session("tok")}`), e, fetchImpl);
    assert.equal(response.status, 403);
    assert.equal(e.assetCalls, 0);
  });

  it("token vencido ou adulterado: 401", async () => {
    const e = env();
    const { fetchImpl } = supabase({ has_active_access: { status: 401 } });
    const response = await gate(request(`${COOKIE}=${session("velho")}`), e, fetchImpl);
    assert.equal(response.status, 401);
    assert.equal(e.assetCalls, 0);
  });

  it("Supabase fora do ar: 503, FALHA FECHADA", async () => {
    const e = env();
    assert.equal((await gate(request(`${COOKIE}=${session("t")}`), e, supabase({ has_active_access: { status: 500 } }).fetchImpl)).status, 503);
    const boom = async () => { throw new Error("rede"); };
    assert.equal((await gate(request(`${COOKIE}=${session("t")}`), e, boom)).status, 503);
    assert.equal(e.assetCalls, 0);
  });

  it("sem as variáveis do Supabase: 503, e nunca entrega", async () => {
    const e = env({ SUPABASE_URL: undefined });
    const response = await gate(request(`${COOKIE}=${session("t")}`), e, supabase({ has_active_access: { body: true } }).fetchImpl);
    assert.equal(response.status, 503);
    assert.equal(e.assetCalls, 0);
  });

  it("só GET e HEAD: o resto é 405", async () => {
    const response = await gate(request(`${COOKIE}=${session("t")}`, { method: "POST" }), env(), supabase({}).fetchImpl);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
  });
});
