# PR 2 — Redirecionamento aberto em `/confirmar`

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-02 (o `BUG-02` de [`../relatorio-qa-2026-10-06.md`](../relatorio-qa-2026-10-06.md)) |
| Branch | `fix/qa-2-redirecionamento-aberto` |
| Depende de | — (anda em paralelo). O PR 6 reusa o validador criado aqui, para o QA-25 |
| Migration | não |

## O defeito

`apps/web/src/routes/AuthCallback.tsx:27-29` aceita qualquer `next` que comece
com `/` e não com `//`. O destino é o mesmo com código válido ou sem (`:40-45`),
então basta um link, sem login:

| `?next=` na URL | `searchParams.get("next")` | Por que sai do site |
|---|---|---|
| `/\evil.example/x` | `/\evil.example/x` | O React Router 8 trata `^[\\/]{2}` como URL absoluta (`node_modules/react-router/dist/development/lib/router/url.js:12-13`), monta `http://evil.example/x` e, com origem diferente, faz `location.assign` (`.../lib/router/router.js:1013-1019`) |
| `/%09/evil.example/x` | `/<TAB>/evil.example/x` | O regex não casa, mas o navegador descarta TAB ao resolver a URL: o `pushState` para outra origem lança e o RR cai em `window.location.assign(url)` (`.../lib/router/history.js:303-307`) |
| `/%5C%5Cevil.example` | `/\\evil.example` | O mesmo caso da primeira linha |

**Há uma quarta forma, e é a correção ingênua que a cria.**
`new URL("/.//evil.example/x", base).pathname` é `//evil.example/x`. Para o
`URL` é a mesma origem; para o React Router é URL absoluta. Pela leitura do RR,
hoje esse `next` fica no site, porque o `redirect` recebe o texto cru e o
navegador o resolve como caminho. Quem passar a devolver o `pathname`
normalizado sem conferir as duas barras abre o redirecionamento que queria
fechar. Conferido no Node: `/.//evil.example/x` e `/%2e//evil.example` viram
`//evil.example…`.

## Decisões aplicadas

- **D-15** (README): o login devolve a qualquer caminho interno que passe por
  `safeInternalPath`. A assinatura nasce aqui pensando nesse segundo uso, no
  PR 6: `safeInternalPath(next, homeForRole(role))`.
- **Tela pública nunca é destino de volta.** `next` só aponta para dentro da
  área logada. O `fallback` é escolhido pelo código, sai de `ROUTES` e não passa
  pelo validador. Em `/confirmar` o único `next` legítimo hoje é
  `/redefinir-senha` (`lib/api/supabase/auth.ts:95`), que é também o fallback:
  recusá-lo leva ao mesmo lugar. Por isso não existe lista de exceções.
- **Compara como o React Router casa a rota.** O casamento do RR ignora caixa e
  barra no fim (`.../lib/router/utils.js:528-530`) e decodifica `%xx`
  (`:532-534`). `/CONFIRMAR/` e `/confirm%61r` abrem `/confirmar`, e por isso
  precisam ser recusados.

## Passo a passo

1. **Spec e catálogo** (commit próprio, antes do código):
   - `docs/specs/01-autenticacao.md`:
     - regra nova **R-AUTH-16**: "`?next=` só aceita caminho interno de tela que
       exige sessão. Ele passa por `safeInternalPath` (`lib/routes.ts`), que
       resolve contra uma origem fictícia e recusa outra origem, caminho que
       depois de normalizado começa com duas barras, e as telas públicas.
       Recusado, vale o destino padrão de quem chama.";
     - critério **CA-16**: "`/confirmar?next=` com `/\host`, `/<TAB>/host`,
       `/\\host` ou `/.//host` termina em `/redefinir-senha`, e nenhuma
       requisição sai para o host", coberto por F-AUTH-14;
     - no cabeçalho, "Fluxos e2e" passa a incluir F-AUTH-14; em "Superfície",
       a linha Constantes ganha `safeInternalPath`.
   - `docs/fluxos-e2e.md`, tabela "Autenticação e conta": a linha
     ``| F-AUTH-14 | `/confirmar?next=` não manda para fora do site — QA-02 |``.
     O F-AUTH-13 fica reservado ao PR 6. Se ele já estiver na `main`, a linha
     entra depois da dele.

2. **O validador**, em `apps/web/src/lib/routes.ts`. O arquivo continua puro e
   sem imports, e é isso que permite testá-lo no runner do Node. Esboço:

   ```ts
   /** Telas que não exigem sessão. Nenhuma é destino de VOLTA. */
   const PUBLIC_PATHS: ReadonlySet<string> = new Set([
     ROUTES.signIn, ROUTES.signUp, ROUTES.forgotPassword,
     ROUTES.resetPassword, ROUTES.authCallback,
   ]);

   /** Só serve para o `URL` resolver o caminho. `.invalid` nunca resolve (RFC 2606). */
   const BASE = "https://app.invalid";

   export function safeInternalPath(raw: string | null | undefined, fallback: string): string {
     if (!raw || !raw.startsWith("/")) return fallback;

     let url: URL;
     try {
       url = new URL(raw, BASE);
     } catch {
       return fallback;
     }
     if (url.origin !== BASE) return fallback;
     // O mesmo teste com que o React Router decide que a URL é absoluta
     // (react-router/.../router/url.js:12-13). Pega `/.//host` normalizado.
     if (/^[\\/]{2}/.test(url.pathname)) return fallback;

     const key = routeKey(url.pathname);
     if (key === null || PUBLIC_PATHS.has(key)) return fallback;

     return url.pathname + url.search + url.hash;
   }

   /** Como o RR casa: decodificado, sem barra no fim, sem caixa. */
   function routeKey(pathname: string): string | null {
     try {
       return decodeURIComponent(pathname).replace(/\/+$/, "").toLowerCase() || "/";
     } catch {
       return null; // `%` malformado: não há caminho a devolver
     }
   }
   ```

   O comentário da função diz para que ela existe: QA-02 e, no PR 6, o QA-25.
   Diz também que a resolução contra `BASE` é o que faz `\`, TAB e `..` valerem
   o que valem no navegador.

3. **`AuthCallback.tsx`**: as linhas 25-29 viram
   `const next = safeInternalPath(url.searchParams.get("next"), ROUTES.resetPassword);`.
   O comentário aponta para `safeInternalPath` em vez de explicar a regra de novo.

4. **Teste unitário** novo, `apps/web/src/lib/routes.test.ts`. O glob
   `node --test "src/lib/**/*.test.ts"` (`apps/web/package.json`) já pega
   arquivo direto em `src/lib/`, como `content-boundary.test.ts`. O import é
   relativo e com extensão, `./routes.ts`.

5. **e2e F-AUTH-14** em `apps/e2e/tests/auth.spec.ts`, depois do
   `describe` de F-AUTH-10/11/12.

6. **Registro**: entrada `QA-02` em `docs/bugs-encontrados.md`, na seção
   "Varredura de 06/10/2026". Se a seção ainda não existir, crie-a antes de
   "Registrados, não corrigidos", no formato das entradas `BUG-NN`, com
   título, defeito e **Correção**.

## Testes

**`routes.test.ts`**, com `FALLBACK = ROUTES.resetPassword`:

| Entrada | Esperado |
|---|---|
| `"/\\evil.example/x"`, `"/\t/evil.example/x"`, `"/\\\\evil.example"` | `FALLBACK` (os três do QA) |
| `"/.//evil.example/x"`, `"/%2e//evil.example"` | `FALLBACK` (a armadilha da normalização) |
| `"//evil.example"`, `"https://evil.example"`, `"javascript:alert(1)"`, `"aluno"` | `FALLBACK` |
| `null`, `undefined`, `""` | `FALLBACK` |
| `"/confirmar"`, `"/CONFIRMAR/"`, `"/confirm%61r"`, `"/entrar"`, `"/redefinir-senha"` | `FALLBACK` |
| `"/aluno?semana=2#x"` | `"/aluno?semana=2#x"` |
| `"/aluno/../professor"` | `"/professor"` (normalizado) |
| `"/%2F%2Fevil.example"` | `"/%2F%2Fevil.example"`: é caminho interno, e o RR não o lê como absoluto |
| `"/"` | `"/"` |

**F-AUTH-14** (`describe("F-AUTH-14 · /confirmar não manda para fora do site — QA-02")`).
Um `test` por payload: `/\evil.example/x`, `/\t/evil.example/x`,
`/\\evil.example` e `/.//evil.example/x`.

```ts
const saidas: string[] = [];
await page.route((url) => url.hostname === "evil.example", async (route) => {
  saidas.push(route.request().url());
  await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>SITE EXTERNO</h1>" });
});
await page.goto(`/confirmar?next=${encodeURIComponent(payload)}`);
await expect(page).toHaveURL(/\/redefinir-senha$/);
await expect(alert(page, "warning")).toContainText("Este link expirou ou já foi usado");
expect(saidas).toEqual([]);
```

- `encodeURIComponent` no payload, e não o texto cru na URL. O que importa é
  o valor que `searchParams.get` devolve, e o Playwright e o navegador
  normalizam `\` e TAB de formas diferentes antes de ele chegar lá.
- A interceptação responde em vez de abortar. Assim, se a correção regredir,
  o teste falha em `toHaveURL`, com a URL de fora na mensagem, e não num erro
  de navegação genérico. É a mesma ideia de `fixtures/tec.ts`: nenhuma
  requisição sai da máquina.
- **Rode o F-AUTH-14 antes do passo 3.** Os três primeiros payloads precisam
  ficar vermelhos. O quarto, pela leitura do código, já passa hoje, e está ali
  para segurar a armadilha da normalização. Se algum dos três não ficar
  vermelho, o teste não reproduz o defeito: conserte o teste antes do código.

## Critério de pronto

- [ ] `npm run check` verde (inclui `routes.test.ts`, que exige Node 24).
- [ ] F-AUTH-14 vermelho antes do passo 3 nos três payloads do QA, e verde depois.
- [ ] F-AUTH-10/11/12 continuam verdes: a recuperação de senha de ponta a
      ponta ainda chega a `/redefinir-senha`.
- [ ] `grep -n 'startsWith("//")' apps/web/src` não acha nada.
- [ ] Spec 01, `fluxos-e2e.md` e `bugs-encontrados.md` no PR.

## Armadilhas

- **Normalizar sem conferir `//` abre o buraco** (ver "O defeito"). A
  conferência é sobre o `pathname` já resolvido, e não sobre o texto cru.
- **Origem fictícia, não `location.origin`.** O loader não precisa de
  `location`, e o teste roda no Node sem `window`. A comparação é
  `url.origin !== BASE`.
- **Não troque `startsWith("/")` por um `trim()`.** O navegador descarta
  espaço e controle nas pontas, e é isso que faz `" //evil"` virar
  `//evil`. Recusar o que não começa com `/` é mais curto do que reproduzir o
  parser.
- **O fallback não é validado.** É constante de `ROUTES`. Passar por
  `safeInternalPath` um valor que veio de fora, como fallback, anularia a
  proteção.
- **`page.route` e não `context.route`.** A navegação acontece na própria aba
  (`location.assign`), e é o `page` embutido que tem vídeo e trace
  configurados (ver o cabeçalho de `apps/e2e/fixtures/index.ts`).
- O cenário do arquivo é `withPlan: false` e o F-AUTH-14 não pede
  `scenario`. Ele usa só o `page` anônimo.

## Fora do escopo

- **QA-25** (o login devolver ao link profundo, com `?next=` em
  `requireSession`). É do PR 6, que importa `safeInternalPath` daqui.
- Mudar o `redirectTo` de `requestPasswordReset` (`auth.ts:95`) ou os
  comentários de `supabase/config.toml` que citam `?next=/redefinir-senha`.
  Continuam corretos.
- Lista fixa de destinos permitidos. Com o PR 6, qualquer tela da área logada
  é destino legítimo, e uma lista fixa teria de crescer a cada rota nova.
