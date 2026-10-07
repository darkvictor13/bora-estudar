# PR 6 — Conta, acesso e datas

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-08, QA-09, QA-20, QA-21, QA-25, QA-29, N-04 |
| Branch | `fix/qa-6-conta-acesso-e-datas` |
| Depende de | PR 2 — `safeInternalPath(raw, fallback)` em `apps/web/src/lib/routes.ts` |
| Migration | não |

Caminhos sem prefixo são relativos a `apps/web/src/`. As linhas são as do
commit `1769ae2`; confira antes de editar, porque o PR 2 pode tê-las movido.

## O defeito

### QA-08 — Aluno vinculado vê "Ainda sem professor"

`lib/api/supabase/auth.ts:113-121` lê `select name from profiles where id =
<teacherId>` e descarta o `error`. A policy `profiles_select`
(`supabase/migrations/20260914150000_initial_schema.sql:1498-1499`) só libera a
própria linha e as dos próprios alunos: a consulta volta `[]`, e
`routes/student/Account.tsx:114` cai em "Ainda sem professor".

A leitura certa já existe e nunca foi chamada: `public.my_teacher()`
(`initial_schema.sql:1480-1488`) devolve `id` e `name`, tem `grant execute`
(`:1953`), tipo em `packages/database/src/schema.gen.ts:2936` (devolve ARRAY) e
teste em `supabase/tests/02_rls.sql:96-104`. A fixture
(`lib/api/fixtures.ts:751-760`) devolve "Professor de Exemplo" sempre, inclusive
sem vínculo — foi o que escondeu o defeito. A consulta de `plan` logo abaixo
(`auth.ts:125-129`) também ignora o `error`.

### QA-09 — A barra do aluno não acompanha liberar e bloquear

`studentLayoutLoader` (`routes/StudentLayout.tsx:25-39`) calcula `hasAccess`,
que habilita os itens da barra (`:53-121`) e mostra o aviso (`:151-158`). A rota
do layout (`router.tsx:112-114`) não tem caminho nem `shouldRevalidate`, e o
React Router não reexecuta o loader de uma rota que continua casada quando só o
filho muda (`node_modules/react-router/dist/development/lib/router/router.js:1960-1966`).
Liberado, o aluno segue com os itens inertes até o F5. **O inverso também
acontece:** suspenso, segue com os itens ativos, e cada clique o devolve à lista
de espera sem explicação. O comentário de `lib/auth/session.ts:36-39`, a R-ACC-08
da spec 02 e a R-AUTH-10 da spec 01 prometem o contrário.

### QA-20 — Vigência e datas em formato de máquina

- `lib/api/contract.ts:184` (`Session`), `:227` (`Account`) e `:907`
  (`StudentCard`) declaram `accessExpiresAt: IsoDate`, mas `access_expires_at` é
  `timestamptz` e o adaptador repassa o texto cru (`lib/api/supabase/session.ts:57`,
  `lib/api/supabase/teacher-students.ts:147`).
- Impresso cru: `components/teacher/AccessForm.tsx:91` ("Vigência atual até
  2027-01-06T18:37:06.167505+00:00"), `routes/teacher/Student.tsx:134` e
  `routes/teacher/Plans.tsx:239-240` (`startsOn` e `examDate` em ISO).
- `AccessForm.tsx:90-92` diz "Liberar soma ao que ainda falta" para quem já
  venceu. A RPC conta de hoje: `greatest(now(), …)` em
  `supabase/migrations/20260918120000_link_access_and_classes.sql:331`.
- `lib/api/supabase/session.ts:43` (`effectiveAccess`) compara o TEXTO do
  `timestamptz` com a data de hoje: `"2026-10-06T10:00:00+00:00" < "2026-10-06"`
  é falso, e no dia do vencimento a tela diz "Liberado" enquanto
  `has_active_access()` (`initial_schema.sql:1458-1466`, `access_expires_at > now()`)
  já recusa a escrita.
- `lib/api/supabase/teacher-students.ts:146` repassa `access_status` cru: aluno
  com a data vencida aparece "Liberado" na lista e na ficha, e o filtro
  "Vencido" não o acha — `expired` não tem escritor (spec 13, R-VINC-28).

### N-04 — Datas no fuso errado

- `routes/teacher/Student.tsx:59-61` fatia o texto UTC: "Última atividade"
  (`:127`) e o início de cada bateria (`:233`) saem 3h adiantados.
- `routes/student/Account.tsx:36-39` fatia o instante: um vencimento às 22h de
  Brasília aparece no dia seguinte.
- `routes/teacher/Plans.tsx:127` sugere `new Date().toISOString().slice(0, 10)`:
  depois das 21h, o dia seguinte.
- `lib/api/supabase/statistics.ts:391-398` agrupa `minutesByDay` e
  `minutesByMonth` por `created_at.slice(…)`, em UTC. As séries de `:357` e
  `:365`, no mesmo arquivo, já usam `localDate`.

### QA-21 — "Meus dados" do professor com os textos do aluno

`router.tsx:286-292` serve `Account` em `/professor/conta`. A tela diz "O que o
seu professor vê sobre você" (`Account.tsx:70`), "fale com seu professor"
(`:91-92`) e mostra o cartão Acesso (`:100-129`) com "Ainda sem professor · — ·
sem prazo".

### QA-25 — O login não devolve ao link aberto

`lib/auth/session.ts:73-81` (`requireSession`) manda para `/entrar` sem
destino; `lib/auth/actions.ts:38-47` (`landAfterAuth`) e
`routes/public/SignIn.tsx:12-16` (`signInLoader`) sempre vão para a casa do papel.

### QA-29 — O cadastro confirma quem já tem conta

`lib/api/supabase/errors.ts:60-61` traduz `user_already_exists` para "Já existe
uma conta com este e-mail.". Com `enable_confirmations = false`
(`supabase/config.toml:234`) o GoTrue responde 422 a QUALQUER chamador: esconder
a frase na tela não tira a informação de quem chama a API direto. Só ligar a
confirmação de e-mail corrige, e isso espera staging entregar e-mail
([`../plano-email-staging.md`](../plano-email-staging.md)). Junto:

- `auth.ts:63-64` diz que "o gatilho que cria o perfil lê `role`" do metadado —
  falso desde a migration `20260914190000`, que deixou de ler (`:32-33` dela).
  O `role: "student"` de `auth.ts:68` é ignorado pelo banco.
- O GAP-04 de `docs/bugs-encontrados.md:457-464` diz que "em produção, com
  confirmação ligada" o GoTrue esconde. Não há produção, e staging também roda
  sem confirmação.

## Decisões aplicadas

| Id | Como entra aqui |
|---|---|
| D-11 | Instante é mostrado no fuso do aparelho. |
| D-12 | `/professor/conta` sem o cartão Acesso e sem "fale com seu professor". |
| D-14 | A frase do cadastro FICA. Registrar na spec 01 e no GAP-04; links "Entrar" e "Esqueci minha senha" junto da mensagem. |
| D-15 | `?next=` no login, sempre passado por `safeInternalPath`. |

Decidido neste plano, sem mudar regra de produto:

- **Data e instante são funções diferentes.** `IsoDate` (`2026-10-06`) é
  fatiada, sem fuso. `IsoDateTime` usa os getters LOCAIS do `Date` — é o mesmo
  fuso do `Intl` sem `timeZone` (D-11), com saída fixa (`dd/mm/aaaa` e
  `dd/mm/aaaa HH:MM`) que não varia com a versão do ICU.
- **O fragmento viaja DENTRO do `next`, e só na primeira carga.** Hoje ele vai
  colado em `/entrar#…` e morre no login. `request.url` nunca traz `#`; numa
  navegação do cliente `location` é a tela anterior, e o fragmento dela não é
  deste destino.
- **`next` vai sempre**, inclusive para `/aluno`. Omitir "quando for a casa"
  exigiria saber o papel de quem não tem sessão.
- **A lista e a ficha do professor passam a usar `effectiveAccess`**: quem venceu
  aparece "Vencido", e não "Liberado".
- **Texto do e-mail para o professor:** "É o seu login. A troca de e-mail ainda
  não está disponível." Subtítulo da tela do professor: "Como os seus alunos
  veem você". Ajuste a cópia à vontade; o que não pode é mandar o professor falar
  com um professor.

## Passo a passo

1. **Spec e catálogo** — `docs: regras e ids do PR 6`.
   - `docs/specs/01-autenticacao.md`:
     - R-AUTH-06 reescrita: o destino vai em `?next=`, com o fragmento dentro
       dele, só na primeira carga;
     - R-AUTH-07 corrigida: o gatilho cria sempre aluno e IGNORA `role`;
     - **R-AUTH-17** (o R-AUTH-16 já é do PR 2, `safeInternalPath`): o login devolve ao `next`, filtrado por
       `safeInternalPath`; `next` de outro papel termina na casa do papel real,
       sem laço;
     - **R-AUTH-18**: o cadastro diz "Já existe uma conta com este e-mail."
       DE PROPÓSITO. Porquê: com a confirmação desligada a API responde 422 a
       qualquer um, e só ligá-la corrige. Mitigação: `sign_in_sign_ups = 30` por
       5 min por IP (`config.toml:215`). Revisitar quando staging entregar
       e-mail. A tela oferece "Entrar" e "Esqueci minha senha" ali mesmo;
     - no diagrama do Fluxo, `/entrar + location.hash` vira `/entrar?next=…`;
     - CA-09 ganha os dois links; CA-13 passa a "o fragmento volta junto com o
       destino"; **CA-17** (o CA-16 já é do F-AUTH-14) = F-AUTH-13; cabeçalho "F-AUTH-01 a F-AUTH-14";
     - "Confirmação de e-mail obrigatória", em Fora de escopo, aponta para
       `../plano-email-staging.md`.
   - `docs/specs/02-acesso-e-assinatura.md`, R-ACC-08: o layout do aluno
     revalida a cada troca de caminho (`shouldRevalidate`).
   - `docs/specs/10-conta-e-lista-de-espera.md`:
     - **R-CTA-15**: o professor do aluno aparece pelo nome, lido por
       `my_teacher()`, porque a policy não abre a linha dele;
     - **R-CTA-16**: "Válido até" é instante, mostrado no fuso do aparelho.
   - `docs/specs/13-vinculo-e-liberacao-de-acesso.md`:
     - **R-VINC-32**: liberar e bloquear valem na PRÓXIMA navegação do aluno
       pela barra, sem recarregar;
     - **R-VINC-33**: a vigência na ficha tem três textos — sem vigência,
       "Vigência atual até dd/mm/aaaa. Liberar soma ao que ainda falta." e
       "Venceu em dd/mm/aaaa. A liberação conta a partir de hoje.";
     - **CA-23** = F-VINC-09; **CA-24** = F-VINC-06 e F-PROF-03;
       cabeçalho "F-VINC-01 a F-VINC-09".
   - `docs/specs/27-dados-do-professor.md`:
     - R-CONTA-01 passa a "a mesma tela, com texto por papel";
     - **R-CONTA-09**: sem o cartão Acesso, sem "fale com seu professor", e o
       texto do e-mail decidido acima.
   - `docs/fluxos-e2e.md`:
     - reserve **F-AUTH-13** (o link profundo volta depois do login) e
       **F-VINC-09** (liberar e bloquear com o aluno navegando, sem F5);
     - atualize F-AUTH-09 (links) e F-CONTA-01 (os dois papéis; o nome do
       professor);
     - na tabela de testids, `account-access` em Conta e `existing-account` em
       Autenticação.
   - `docs/bugs-encontrados.md`, GAP-04: troque "Em produção, com confirmação
     ligada…" pela decisão D-14 e aponte para a R-AUTH-18.

2. **Datas no domínio** — `lib/domain/dates.ts`, novo, e `lib/domain/dates.test.ts`.
   - Imports só de tipo e relativos (`import type { IsoDate, IsoDateTime } from
     "../api/contract.ts"`): o `node --test` não resolve `@/`.
   - A API:

     | Função | Para |
     |---|---|
     | `formatDate(date: IsoDate)` | `06/10/2026`, fatiando, sem fuso |
     | `formatDayMonth(date: IsoDate)` | `06/10` |
     | `formatInstant(value: IsoDateTime, style: "date" \| "dateTime" = "date")` | `06/10/2026` ou `06/10/2026 23:30`, no fuso do aparelho |
     | `localDateOf(value: Date \| IsoDateTime): IsoDate` | o dia local de um instante |
     | `todayLocal(): IsoDate` | `localDateOf(new Date())` |
     | `hasExpired(value: IsoDateTime, now = Date.now())` | `Date.parse(value) <= now`, a mesma fronteira de `has_active_access()` |

   - `lib/domain/schedule.ts:33-35` (`localDate`) passa a delegar para
     `localDateOf`, e `lib/api/supabase/session.ts:27-31` (`today`) para
     `todayLocal`. Não renomeie os usos neste PR.

3. **Contrato, adaptador e fixtures.**
   - `contract.ts:184`, `:227` e `:907`: `accessExpiresAt: IsoDateTime | null`.
     O tipo já existe (`:62`).
   - `lib/api/supabase/session.ts:41-45`: `effectiveAccess(row: Pick<ProfileRow,
     "access_status" | "access_expires_at">)` usa `hasExpired`. Corrija o
     comentário de `:33-40`.
   - `lib/api/supabase/teacher-students.ts:146`: `access: effectiveAccess(student)`.
   - `lib/api/supabase/auth.ts`, `loadAccount`:
     - `supabase.rpc("my_teacher")` no lugar de `from("profiles")`, com
       `if (error) throwDb(error)` e `teacherName = data?.[0]?.name ?? null`;
     - a leitura de `plan` também passa por `throwDb`;
     - as duas em `Promise.all`.
   - `auth.ts:63-68`: tire `role` do `options.data` e reescreva o comentário — só
     o nome vai no metadado; o gatilho ignora `role` de propósito
     (`20260914190000`).
   - `lib/api/fixtures.ts`:
     - os `accessExpiresAt` (`:518`, `:1259`, `:1379`, `:1967`, `:1983`,
       `:1999`) viram instante — um helper `instantOf(date)` que devolve
       `${date}T12:00:00.000Z` mantém o mesmo dia em Brasília;
     - `grantAccess` (`:1376-1380`) compara por `Date.parse` e soma meses de
       calendário (`setUTCMonth`), como o `make_interval(months => …)` da RPC;
     - `loadAccount` e `saveAccount` (`:751-777`): `profileId` da sessão, e
       `teacherName` só quando `state.session?.teacherId`;
     - `setFixtureRole` (`:589-593`): `teacherId: null` para o professor.
   - `lib/api/fixtures.test.ts`:
     - `:665-708` comparam vigência por `Date.parse`;
     - caso novo: `loadAccount` devolve o nome do professor com vínculo e `null`
       depois de `setFixtureRole("teacher")`.

4. **Guardas, ações e rotas** — `lib/auth/`, `router.tsx` e todo loader.
   - **QA-09.** Na rota do layout do aluno (`router.tsx:112-114`):

     ```ts
     // Declarar DESLIGA o padrão inteiro: o `||` devolve o que o router faria
     // sozinho (revalidate(), search nova) e acrescenta a troca de tela.
     shouldRevalidate: ({ currentUrl, nextUrl, defaultShouldRevalidate }) =>
       defaultShouldRevalidate || currentUrl.pathname !== nextUrl.pathname,
     ```

     Reescreva o comentário de `lib/auth/session.ts:36-39`: a memoização em voo
     faz `requireRole` do layout e da página dividirem a mesma consulta; o que
     faz o layout perguntar de novo é o `shouldRevalidate`.
   - **QA-25.** `lib/auth/session.ts`:
     - `requireSession(request: Request)`, `requireRole(role, request)` e
       `requireStudentAccess(request)`, com o parâmetro OBRIGATÓRIO, para o
       compilador listar todo chamador;
     - o redirect vira `/entrar?next=${encodeURIComponent(destino)}`, com
       `destino = pathname + search` de `new URL(request.url)` mais
       `location.hash` SÓ quando `pathname` e `search` do pedido forem iguais
       aos de `location` (primeira carga). Um comentário diz por quê.
   - Passe `request` em TODO loader que chama as três: são 27 chamadas em
     `routes/`, incluindo `StudentLayout.tsx:26` e `TeacherLayout.tsx:22` (`npm
     run typecheck` lista todas). Siga o padrão local, `({ request }: { request: Request })`.
   - `lib/auth/actions.ts`:
     - `landAfterAuth(fallback, next = "")` devolve
       `next ? safeInternalPath(next, home) : home`, com `home =
       homeForRole(session.role)`;
     - `signIn` lê `text(data, "next")` e repassa;
     - `FormState` ganha `readonly code?: ApiErrorCode`, preenchido por `signIn`
       e `signUp` a partir do `result.error`.

5. **Telas.**
   - `routes/public/SignIn.tsx`:
     - `useSearchParams()` e `<input type="hidden" name="next" value={…} />`
       dentro do `AuthForm`;
     - `signInLoader({ request })` com sessão: `throw
       redirect(safeInternalPath(next, homeForRole(session.role)))`.
   - `routes/public/SignUp.tsx`: quando `state.code === "conflict" &&
     state.field === "email"`, um `<Box data-testid="existing-account">` logo
     abaixo do campo de e-mail, com "Entrar" (`ROUTES.signIn`) e "Esqueci minha
     senha" (`ROUTES.forgotPassword`). Decida pelo CÓDIGO, nunca pela frase.
   - **Datas** — troque cada formatador avulso:

     | Onde | O que é | Troca por | Efeito |
     |---|---|---|---|
     | `routes/student/Account.tsx:36-39`, `:116` | instante | `formatInstant(v)` | corrige o fuso |
     | `routes/teacher/Student.tsx:59-61`, `:127`, `:233` | instante | `formatInstant(v, "dateTime")` | corrige 3h |
     | `routes/teacher/Student.tsx:134` | instante | ver AccessForm abaixo | some o ISO |
     | `components/teacher/AccessForm.tsx:90-92` | instante | ver abaixo | some o ISO |
     | `routes/teacher/Plans.tsx:127` | hoje | `todayLocal()` | corrige depois das 21h |
     | `routes/teacher/Plans.tsx:239-240` | data | `formatDate` | some o ISO |
     | `lib/api/supabase/statistics.ts:391-398` | instante agrupado | **o 5a já fez** (`entryDay` na chave, no filtro e no mês); aqui só o rótulo por `formatDayMonth` | some a fatia |
     | `routes/student/Planning.tsx:29-33` | data | `formatDate` (o `—` do nulo fica na tela) | igual |
     | `routes/student/MockExams.tsx:33`, `routes/teacher/MockExams.tsx:123` | data | `formatDate` | igual |
     | `routes/student/Overview.tsx:104`, `components/student/StudyCalendar.tsx:32`, `routes/teacher/Goals.tsx:68`, `routes/student/Statistics.tsx:173` | data (dia/mês) | `formatDayMonth` | igual |
     | `components/student/LawContinuousReader.tsx:110` | data | `formatDate` (o `"2026"` do nulo fica) | igual |
     | `routes/student/Flashcards.tsx:357` | instante | `formatInstant(v, "dateTime")` | some a vírgula |
     | `components/student/StudyStreakDialog.tsx:55` (o `title`) | data | `formatDate` | igual |

     NÃO troque `components/StatisticsReferencePanels.tsx:67`: é mês/ano, outro
     caso.
   - **Vigência** (`AccessForm.tsx:89-93` e o `sub` de
     `routes/teacher/Student.tsx:134`), com `{data}` =
     `formatInstant(card.accessExpiresAt)`:
     - sem data: "Sem vigência. A primeira liberação conta a partir de hoje." /
       "Sem prazo";
     - `hasExpired`: "Venceu em {data}. A liberação conta a partir de hoje." /
       "Venceu em {data}";
     - senão: "Vigência atual até {data}. Liberar soma ao que ainda falta." /
       "Válido até {data}".
   - **Meus dados por papel** (`routes/student/Account.tsx`):
     - `accountLoader({ request })` devolve `{ account, role: session.role }`;
     - para `teacher`: o subtítulo e o `hint` do e-mail decididos acima, e o
       cartão Acesso NÃO renderiza;
     - para `student`: tudo como está;
     - o `dl` do cartão ganha `data-testid="account-access"`;
     - atualize o comentário de `router.tsx:287`.

6. **Testes e2e** — ver a seção Testes. `describe` começa pelo id e cita o `QA-NN`.

7. **Documentação.**
   - `CLAUDE.md`:
     - o parágrafo "O `redirect` do router descarta o fragmento" (`:308-314`)
       passa a dizer que `requireSession` põe o fragmento dentro do `next`, só
       na primeira carga, e por quê;
     - em "A interface", um parágrafo curto: `IsoDate` se fatia, `IsoDateTime`
       se formata no fuso do aparelho, os dois por `lib/domain/dates.ts` — os
       dois tipos são `string`, e o compilador não separa um do outro.
   - `docs/bugs-encontrados.md`: uma entrada por bug na seção "Varredura de
     06/10/2026" (crie a seção se este for o primeiro PR mergeado).

## Testes

**Unidade — `lib/domain/dates.test.ts`.** O fuso é fixado no próprio arquivo,
ANTES de importar o módulo:

```ts
process.env.TZ = "America/Sao_Paulo";
const { formatInstant, todayLocal /* … */ } = await import("./dates.ts");
```

Import estático é içado e rodaria antes da atribuição. O runner do Node isola
cada arquivo num processo (padrão do `node --test` no Node 24), então o fuso não
vaza para as outras suítes. Os dois comportamentos foram conferidos no Node 24.20.

- `formatInstant("2026-10-07T02:30:00Z")` → `06/10/2026`; com `"dateTime"` →
  `06/10/2026 23:30`;
- `formatDate("2026-10-06")` → `06/10/2026`; `formatDayMonth` → `06/10`;
- `todayLocal()` às 23:30 de Brasília é o dia 6: `t.mock.timers.enable({ apis:
  ["Date"], now: Date.parse("2026-10-07T02:30:00Z") })`;
- `localDateOf("2026-10-07T02:30:00Z")` → `2026-10-06`;
- `hasExpired`: um milissegundo antes é `false`; no instante e depois, `true`.

**Unidade — `lib/api/fixtures.test.ts`.** Os casos do passo 3.

**E2E** — Playwright roda com `timezoneId: "America/Sao_Paulo"`
(`apps/e2e/playwright.config.ts:58`).

- **F-CONTA-01** (`apps/e2e/tests/student-analysis.spec.ts:193`), QA-08 e QA-21:
  - aluno: `testId(page, "account-access")` contém `scenario.teacher.name`;
  - aluno com `withLink: false`: "Ainda sem professor";
  - professor em `/professor/conta`: h1 "Meus dados"; `cardByTitle(page,
    "Acesso")` com contagem 0 (espere o h1 antes de contar); `content(page)` sem
    "fale com seu professor" e sem "Ainda sem professor"; salvar o nome continua
    funcionando.
- **F-VINC-09** (novo, em `apps/e2e/tests/teacher.spec.ts`, junto de F-VINC-05
  `:706`), QA-09:
  - `test.use({ scenarioOptions: { access: "pending" } })`; o aluno entra e abre
    `/aluno/conta`; `navItem(page, "Minha semana")` tem `data-enabled="false"`;
  - libera pela RPC real, como em F-VINC-07: `asUser(scenario.teacher.id, (c)
    => c.query("select * from public.set_student_access($1, 'grant', 3, $2)",
    [scenario.student.id, randomUUID()]))`. É o professor em outro aparelho:
    `teacherPage` e `studentPage` são a MESMA aba;
  - clica "Lista de espera" na barra → "Minha semana" com
    `data-enabled="true"` e o aviso `alert(page, "warning")` some; clica
    "Minha semana" → h1 "Minha semana";
  - bloqueia pela RPC (`'suspend'`, `null`, `randomUUID()`), clica "Meus
    dados" → itens inertes de novo e aviso de volta. Nenhum `reload` no teste.
- **F-AUTH-13** (novo, em `apps/e2e/tests/auth.spec.ts`), QA-25:
  - anônimo em `/professor/alunos/<id>` vai a
    `/entrar?next=%2Fprofessor%2Falunos%2F<id>`; o login pelo formulário termina
    na ficha (h1 = nome do aluno). Escreva um preenchedor que NÃO navegue — o
    `signInThroughForm` (`:33-42`) abre `/entrar` e perderia o `next`;
  - aluno com `next` de professor termina em `/aluno`, sem laço;
  - `/entrar?next=https://exemplo.invalid/` termina na casa do papel;
  - navegação do cliente: aluno em `/aluno`, `page.route(/\/auth\/v1\/user/,
    401)` como em `apps/e2e/tests/theme.spec.ts:401-407`, clica "Meus dados"
    na barra → `next=%2Faluno%2Fconta`, e não `%2Faluno`. É o teste da
    pegadinha do `location`.
- **F-AUTH-01** (`auth.spec.ts:44-56`) e **F-AUTH-07** (`:162`): `/\/entrar$/`
  deixa de valer. Passam a esperar a URL exata
  `${baseURL}/entrar?next=${encodeURIComponent(route)}`, o que transforma o
  F-AUTH-01 numa verificação do `next` em toda rota protegida. F-AUTH-06
  ("/ sem sessão") e F-AUTH-07 logo depois do "Sair" (`:156`) continuam
  `/entrar$`.
- **F-AUTH-09** (`auth.spec.ts`, "e-mail já cadastrado"): além da frase,
  `testId(page, "existing-account")` com os links "Entrar" (`href="/entrar"`) e
  "Esqueci minha senha" (`href="/recuperar-senha"`). Escope pelo testid: a tela
  já tem outro "Entrar" no rodapé.
- **F-VINC-06** (`teacher.spec.ts:735`): depois da primeira liberação,
  `testId(page, "access-form")` contém "Vigência atual até <data>".
- **F-PROF-03** (`teacher.spec.ts:75`): caso novo com `access: "expired"` — a
  ficha mostra "Venceu em <data>" e "A liberação conta a partir de hoje.".
- Nas duas, a data esperada sai do banco e é formatada com
  `Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" })`. Não
  escreva a data à mão: o `2020-06-01` de `expiryFor`
  (`apps/e2e/fixtures/scenario.ts:271-275`) é meia-noite UTC e aparece como
  **31/05/2020** em Brasília — que é o certo, por D-11.

## Critério de pronto

- [ ] `npm run check` verde, com `dates.test.ts` e os casos novos de
      `fixtures.test.ts`.
- [ ] `npm run db:reset` e depois `npm run e2e` verdes, incluindo F-AUTH-01,
      F-AUTH-07, F-AUTH-09, F-AUTH-13, F-CONTA-01, F-VINC-05 a F-VINC-09,
      F-PROF-03 e o tema inteiro (F-TEMA-01 a F-TEMA-09).
- [ ] `grep -rn "slice(8, 10)\|split(\"-\").reverse" apps/web/src` só acha
      `lib/domain/dates.ts`.
- [ ] `grep -n 'from("profiles")' apps/web/src/lib/api/supabase/auth.ts` não
      mostra mais a leitura do nome do professor.
- [ ] Na mão, com `npm run dev`: o aluno do seed vê o nome da professora em
      Meus dados; o professor vê a própria conta sem cartão Acesso.
- [ ] Specs, `fluxos-e2e.md`, `bugs-encontrados.md` e `CLAUDE.md` atualizados.

## Armadilhas

- **O redirect do loader MAIS FUNDO vence.** `findRedirect`
  (`router.js:2752-2760`) percorre os resultados de trás para frente. Se só o
  layout montar o `next`, o `requireRole`/`requireStudentAccess` da página
  redireciona sem ele e é esse que vale. Por isso o parâmetro é obrigatório nas
  três guardas.
- **Dentro de um loader de navegação do cliente, `location` ainda é a tela de
  onde a pessoa saiu.** O destino vem de `request.url`. E `request.url` nunca
  traz `#` (`router.js:2604-2605`, `stripHashFromPath`).
- **`shouldRevalidate` declarado desliga o padrão inteiro.** Sem o `||
  defaultShouldRevalidate`, o `revalidate()` de "Salvar" em Meus dados deixa de
  atualizar o nome na barra (R-CTA-05).
- **O custo do QA-09 não é zero.** `requireRole` divide a consulta em voo com a
  página, mas `studentLayoutLoader` também chama `api.loadThemePreference()`, e
  no adaptador (`auth.ts:173-176`) isso é mais um `getUser` e mais um `select`
  em `profiles` por navegação dentro da área do aluno. Aceito neste PR; diga na
  descrição.
- **`IsoDate` e `IsoDateTime` são ambos `string`.** O compilador não pega
  `formatDate` recebendo instante — que imprime a data UTC em silêncio,
  exatamente o defeito. A tabela do passo 5 é a revisão; o teste é a rede.
- **Formatador `Intl` guardado no topo do módulo congela o fuso** em que foi
  criado. Com getters locais o problema não existe; se usar `Intl`, crie dentro
  da função ou importe dinamicamente no teste DEPOIS de fixar `TZ`.
- **`my_teacher()` devolve tabela.** O cliente entrega um array: `data[0]`.
- **Filtre pelo código, nunca pela frase** — `state.code === "conflict" &&
  state.field === "email"`. `conflict` sem `field` é o "Muitas tentativas"
  (`errors.ts:70-75`).
- **O `<input type="hidden" name="next">` sobrevive ao reset do React 19**:
  `AuthForm.tsx:48-55` só repõe campo VAZIO, e o `value` do escondido é o
  atributo. Confira no F-AUTH-13 errando a senha uma vez antes de acertar.
- **Não ponha `safeInternalPath` em `useFormActionState.ts:37-38`.** O
  `updatePassword` devolve `/entrar` legitimamente quando não há sessão, e o
  validador do PR 2 recusa rotas públicas. O filtro fica na origem, em
  `landAfterAuth`.
- **O PR 5a acrescenta o dia estudado a `goal_entries`** (D-18 do README): o
  estudo extra lançado para ontem conta ontem. Quem agrupa registro por dia em
  `statistics.ts` usa `studied_on` quando houver e, senão, o dia LOCAL do
  `created_at`. Se o 5a já estiver na `main`, a troca de UTC para local
  deste PR entra por dentro desse `coalesce`; se não, o 5a concilia.
- **Conflitos esperados.** O PR 2 também mexe na spec 01, no catálogo
  (F-AUTH-14) e em `lib/routes.ts`; o PR 8 mexe em `router.tsx`,
  `routes/student/Overview.tsx` e nas telas do professor; o 5a, em
  `Overview.tsx`. Rebaseie sobre a `main`, não resolva no escuro.

## Fora do escopo

- Cache de `getUser` no adaptador — cada função ainda valida a sessão por conta
  própria; é o que deixa o QA-09 mais caro do que "zero".
- O aviso do layout diz "Seu acesso ainda não foi liberado" também a quem foi
  suspenso ou venceu (`StudentLayout.tsx:151-158`).
- Melhoria de UX 8: mostrar a data nova no aviso de sucesso da liberação.
- Levar o `next` para o link "Crie a sua" do login.
- Ligar a confirmação de e-mail — [`../plano-email-staging.md`](../plano-email-staging.md).
- Tipos com marca (`branded`) para `IsoDate` e `IsoDateTime`.
- O `?semana=` e o `?plano=` das telas do professor são do PR 1 e do PR 8.
