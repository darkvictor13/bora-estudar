# PR 8 — Telas do professor e casca

> Plano para uma sessão sem contexto. Leia antes o `CLAUDE.md` e o [README](README.md) desta pasta (decisões e regras comuns).

| | |
|---|---|
| Bugs | QA-13, QA-22, QA-23, QA-26, N-03 |
| Branch | `fix/qa-8-telas-e-casca` |
| Depende de | PR 1 e PR 6, que mexem nas mesmas telas (`Goals.tsx`, loaders do professor, `router.tsx`) |
| Migration | não |

Caminhos sem prefixo são relativos a `apps/web/src/`. As linhas são as do
commit `1769ae2`; confira antes de editar.

## O defeito

### QA-13 e N-03 — Parâmetro de URL derruba telas

- **Gerar metas.** `teacherGoalsLoader` (`routes/teacher/Goals.tsx:32-41`)
  aceita `?plano=` sem conferir; `:105` faz `plans.find(…) ?? null`, e `input()`
  (`:107-115`) lê `plan!.id`. O React Compiler (`react({ compiler: true })`,
  `apps/web/vite.config.ts:85`) memoiza `input` com `plan.id` como dependência e
  lê a propriedade NO RENDER: "Cannot read properties of null (reading 'id')"
  com qualquer `?plano=` que não seja de um planejamento ativo do professor.
  **N-03:** o mesmo erro com o professor SEM planejamento ativo, sem parâmetro
  nenhum — o aviso "Nenhum planejamento ativo" (`:193`) nunca é alcançado.
- **O texto da URL vai direto ao PostgREST:** `routes/teacher/Notebooks.tsx:30`
  (`?plano=`), `routes/teacher/Reviews.tsx:28` (`?plano=`) e
  `routes/teacher/Theory.tsx:42` (`?catalogo=`). Texto que não é UUID volta
  `22P02`, "invalid input syntax for type uuid"; UUID alheio em Revisões volta o
  `readFailure("Planejamento não encontrado.")` do adaptador.
- **`?ano=` aceita qualquer número**, e não está no relatório:
  `routes/teacher/Statistics.tsx:43` (`Number(…) || ano atual`) e
  `routes/student/Statistics.tsx:41-43` (`> 2000`, sem teto). `?ano=1e9` chega a
  `new Date(1e9, 0, 1).toISOString()` (`lib/api/supabase/statistics.ts:29`) e
  lança `RangeError`. `routes/teacher/Statistics.tsx:38-39` já valida `?plano=`
  e `?turma=` — é o padrão certo.
- **`?semana=1e9` derruba a semana do aluno.** `routes/student/Overview.tsx:45-47`
  aceita qualquer inteiro positivo, e `loadWeek` estoura no `Date`.
- **`?ritmo=` não é conferido** (`routes/teacher/Students.tsx:36`, um `as
  StudentPace`): valor inventado esvazia a lista e deixa o seletor em branco.
- **Ficha de aluno alheio diz "Atualize a página".** `loadStudentFile` filtra em
  memória e lança `ApiThrownError("not_found")`
  (`lib/api/supabase/teacher-students.ts:193`), mas `routes/RouteError.tsx:42`
  só reconhece `isRouteErrorResponse(…) && status === 404`; o resto cai em "Algo
  deu errado … Atualize a página" (`:67-75`). A fixture `loadStudentFile`
  (`lib/api/fixtures.ts:1282-1292`) devolve o primeiro aluno para id
  desconhecido e esconde o caso.
- `lib/api/supabase/session.ts:116` usa `readFailure` com o código padrão
  `not_found` para "Sua sessão expirou." — com a correção acima viraria uma tela
  "Não encontrado".

### QA-22 — Ids repetidos nos cartões por disciplina

`packages/ui/src/primitives/Field.tsx:42` gera `id="field-${name}"`, e `:10` tira
`id` das props. Um cartão por disciplina repete o id, e o `<label for>` do
segundo aponta para o campo do primeiro: `routes/teacher/Theory.tsx:98`
(`initialQuestions`), `:116` e `:124` (`spacing-${index}` e `minimum-${index}`,
que repetem ENTRE cartões) e `routes/teacher/Reviews.tsx:165` e `:174`
(`lessonSpacing`, `minimumQuestions`). O id padrão é contrato da suíte
(`apps/e2e/support/ui.ts:126-128`). Os "campos sem nome" do relatório são quase
todos falso positivo: o `<input aria-hidden>` que o `Select` do MUI esconde.

### QA-23 — Elementos que não cabem em 375px

- **Chip do cronômetro.** O botão de modo (`components/StudyTimer.tsx:301`) tem
  `minWidth: 0` numa linha flex sem quebra (`:259-275`). A linha não cabe em
  375px e ele é o único item que encolhe: "Livre" vaza. O `aria-label` "Modos e
  tempo do cronômetro" não contém o texto visível (WCAG 2.5.3).
- **Selects de largura mínima fixa** dentro de linhas flex. O item flex tem
  `min-width: auto` e cresce com o texto da opção escolhida:
  `routes/teacher/Theory.tsx:465` (o "Catálogo" que termina em x = 382) e o
  mesmo padrão em `Theory.tsx:513`, `:518` (260 dentro de um cartão: não cabe
  nos ~253px úteis), `:599` (290), `:650`; `Notebooks.tsx:86`;
  `Reviews.tsx:92`; `Goals.tsx:166`, `:209`; `routes/teacher/Statistics.tsx:98`,
  `:113`; `Students.tsx:166`; `routes/teacher/Student.tsx:165`.
- **O `PageHeader` já está certo** — `packages/ui/src/primitives/PageHeader.tsx:37`
  reduz o `px` abaixo de `md`. Não mexa nele.
- **O documento nunca rola na horizontal**, e por isso o defeito escapa: a casca
  é `overflow: hidden` (`components/AppShell.tsx:216`) e quem rola é o
  `<main data-testid="content">` (`:433-440`). O excesso vira rolagem DENTRO do
  `main`.

### QA-26 — A primeira carga é tela branca

A rota raiz (`router.tsx:69-73`) não tem `HydrateFallback`. Sem ele o React
Router 8.3 renderiza `null` e avisa no console ("No `HydrateFallback` element
provided…", `node_modules/react-router/dist/development/lib/hooks.js:763-776`);
`index.html:39` deixa `#root` vazio. Até a cascata sessão → perfil → loaders
terminar, branco. Se o bundle não carregar — rede, ou `lib/env.ts` lançando por
falta de `VITE_*` —, branco para sempre.

## Decisões aplicadas

| Id | Como entra aqui |
|---|---|
| D-13 | Parâmetro malformado ou alheio cai no padrão da tela, em silêncio. Ficha de aluno alheio ou malformado mostra "Não encontrado", sem "Atualize a página". |

Decidido neste plano:

- **O padrão de cada parâmetro é a primeira opção que a própria tela oferece:**
  `?plano=` (metas, cadernos, revisões), `?catalogo=`, `?ano=` e `?ritmo=` só
  valem se estiverem na lista que o loader carregou. É o que
  `routes/teacher/Students.tsx:39-45` (R-TURMA-10) já faz com `?turma=`.
- **`?semana=` fora das semanas do seletor cai na semana CORRENTE** — o padrão
  do contrato (`lib/api/contract.ts:336`, `loadWeek` sem número) e o que o
  seletor abre. A spec 03 (CA-02, e o texto de `:74-75`) diz "primeira semana
  com metas", o que nunca foi o comportamento; a spec se alinha.
  Consequência: `?semana=40` sem metas deixa de abrir "Semana 40".
- **`Field` aceita `id` opcional; o padrão continua `field-${name}`.** Os
  cartões repetidos usam `useId()` no sufixo. O `subjectKey` não serve: tem
  espaço ("ciencias forenses"), e id não pode ter espaço.
- **A tela de 375px é testada por `test.use({ viewport })` no próprio
  `describe`**, sem projeto novo no `playwright.config.ts`: o projeto rodaria a
  suíte inteira duas vezes para medir uma coisa.
- **A tela estática de `index.html` usa as cores do sistema** (`Canvas` e
  `CanvasText`) com `color-scheme: dark` sob `[data-theme="dark"]`, em vez de
  copiar os tokens: o script embutido já pôs o atributo, e o MUI emite a mesma
  declaração (`node_modules/@mui/system/cssVars/prepareCssVars.js:128-147`).
- **Nenhuma das duas telas de carregamento tem `<h1>`.** F-TEMA-03 conta zero
  `h1` durante a carga (`apps/e2e/tests/theme.spec.ts:165`).

## Passo a passo

1. **Spec e catálogo** — `docs: regras e ids do PR 8`.
   - `docs/specs/03-planejamento-e-metas.md`:
     - o parágrafo de `:74-76` passa a listar cada parâmetro e o padrão dele;
     - CA-01 inclui "professor sem planejamento ativo" (F-PROF-01);
     - CA-02 vira "cai na semana corrente" (F-META-02);
     - CA-03 cobre `?plano=`, `?catalogo=`, `?ano=` e `?ritmo=`, alheios ou
       malformados, com cobertura F-ISO-02 — o F-PROF-08 citado ali não existe;
     - CA-04 vira "mostra 'Não encontrado', sem 'Atualize a página'" (F-PROF-03).
   - `docs/specs/29-sidebar-e-senha-visivel.md`, seção nova "A casca em tela
     estreita e na primeira carga":
     - **R-UI-15**: nada passa da largura em 375px; o que não cabe quebra linha
       ou trunca com reticências;
     - **R-UI-16**: o nome acessível de um controle contém o texto visível dele;
     - **R-UI-17**: a primeira carga mostra que está carregando e o que fazer se
       não sair; sem JavaScript, `<noscript>` diz o motivo;
     - **R-UI-18**: id de campo é único na página; `field-<name>` é o padrão, e
       cartão repetido passa o próprio;
     - CA novos para F-UI-11, F-UI-12 e F-PROF-01; cabeçalho com F-UI-11 e
       F-UI-12.
     Pule R-UI-13 e R-UI-14: `Field.tsx:46` cita R-UI-14 para "começa sempre
     oculta", que na spec é a R-UI-10 — corrija o comentário no passo 2.
   - `docs/fluxos-e2e.md`:
     - reserve **F-UI-11** (nenhuma tela passa de 375px) e **F-UI-12** (a
       primeira carga mostra que está carregando);
     - atualize as linhas de F-PROF-01, F-PROF-03, F-ISO-02 e F-META-02;
     - testid `app-loading` em Casca.

2. **`Field` com `id` opcional** — `packages/ui/src/primitives/Field.tsx`.
   - `FieldProps` ganha `readonly id?: string`, desestruturado à parte — senão
     ele cai no `...rest` e vai para o `inputProps` (`:80`) — e
     ``const id = idProp ?? `field-${name}` ``. O comentário de `:38-39` passa a
     dizer que o PADRÃO é contrato.
   - Tire `'id'` do `Omit` de `:10`.
   - Corrija `R-UI-14` para `R-UI-10` em `:46`.

3. **Os cartões repetidos passam o próprio id.**
   - `routes/teacher/Theory.tsx`, `SubjectRuleCard` (`:60`): `const uid =
     useId()` e ``id={`field-initialQuestions-${uid}`}``, e o mesmo para
     `spacing-${index}` e `minimum-${index}`.
   - `routes/teacher/Reviews.tsx:163-180`: o mesmo. O cartão é um `.map` dentro
     do componente da tela; extraia o cartão para um componente, porque hook não
     roda dentro de `.map`.
   - Os `name` NÃO mudam: são o que o `FormData` lê.

4. **Os loaders conferem o parâmetro contra a lista** — padrão de
   `Students.tsx:39-45`.
   - `Goals.tsx:32-41`: `planId = plans.some((p) => p.id === asked) ? asked :
     plans[0]?.id ?? null`. Não mexa em `?semana=` aqui: é do PR 1 (QA-17).
   - `Notebooks.tsx:26-37` (contra `plans`, todos os status), `Reviews.tsx:24-45`
     (contra os ativos) e `Theory.tsx:38-56` (`?catalogo=` contra `catalogs`).
   - `routes/teacher/Statistics.tsx`: o loader passa a montar `years` (hoje no
     componente, `:82`) e só aceita `?ano=` que esteja nele; devolve `years`.
   - `routes/student/Statistics.tsx:34-56`: calcule `years` ANTES das leituras e
     só aceite `?ano=` que esteja nele.
   - `routes/teacher/Students.tsx:36`: `?ritmo=` só se for um dos três valores
     de `StudentPace`.
   - `routes/student/Overview.tsx:39-55`: leia `listWeeks` primeiro e só passe
     `weekNumber` se ele estiver na lista; senão `undefined`. As duas leituras
     deixam de correr em paralelo — o mesmo preço que `Students.tsx:39-45`
     paga, pelo mesmo motivo.

5. **Gerar metas sem `plan!`** — `Goals.tsx:105-142`.
   - `input(target: StudyPlanSummary)` recebe o planejamento; `buildPreview` e
     `generate` passam `plan` DEPOIS do `if (!plan) return`.
   - Comentário curto: o compilador iça a leitura de propriedade de um closure
     para o render, e `!` não protege nada em tempo de execução.

6. **"Não encontrado" é estado, não erro.**
   - `routes/RouteError.tsx:42`: o ramo de 404 também atende `error instanceof
     ApiThrownError && error.code === "not_found"` (import de
     `@/lib/api/contract`, como `lib/observability.ts:35`). Título "Não
     encontrado", aviso com a mensagem do erro quando houver, "Voltar para o
     início", e nada de "Atualize a página". `captureRouteError` já não relata
     `not_found` (`lib/observability.ts:44-51`).
   - `lib/api/supabase/session.ts:116`: `readFailure("Sua sessão expirou. Entre
     de novo.", "unauthenticated")`. **O PR 4 faz a mesma troca** (passo 6
     dele): se ele já estiver na `main`, só confira.
   - `lib/api/fixtures.ts:1282-1292`: id desconhecido lança `new
     ApiThrownError("not_found", "Aluno não encontrado, ou sem vínculo com
     você.")`, a mesma frase do adaptador. Caso em `lib/api/fixtures.test.ts`.

7. **375px.**
   - `components/StudyTimer.tsx`:
     - a linha (`:259-275`) ganha `flexWrap: "wrap"`, `rowGap: 0.5` e `py:
       0.5`; ela não cabe em 375px mesmo sem "Lançar tempo";
     - o botão de modo (`:301`) ganha `flexShrink: 0` e `whiteSpace: "nowrap"`,
       e o `aria-label` passa a começar pelo texto visível — extraia o rótulo
       ("Livre", "Foco" ou "Pausa") para uma constante `modeLabel` e use
       `` `${modeLabel} — modos e tempo do cronômetro` ``.
   - Um helper `fieldWidth(min: number)` em `lib/ui/field-width.ts`, novo,
     devolvendo `{ minWidth: { xs: 0, sm: min }, width: { xs: "100%", sm:
     "auto" }, maxWidth: "100%" }`. Aplique nos selects e campos listados em
     QA-23 no lugar do `minWidth` fixo. Com a largura presa, o `Select` do MUI
     trunca com reticências sozinho.
   - O teste do passo 9 é quem decide se acabou: corrija o que ele acusar com o
     mesmo helper. Se uma tela exigir redesenho, pare e diga na descrição do PR,
     em vez de esconder com `overflow: hidden`.

8. **Primeira carga.**
   - `routes/RootLayout.tsx`: `RootLoading`, ao lado de `RootError` (`:86-92`),
     embrulhado no MESMO `ThemeShell` — o fallback substitui o `RootLayout`, que
     é quem fornece o tema. Um `Box` com `data-testid="app-loading"`,
     `role="status"`, altura da tela, fundo `theme.vars.palette.surface.base`, e
     dois parágrafos: "Carregando a Fronteira Concursos…" e "Se demorar, confira
     a conexão e recarregue a página.". Sem `h1`, sem `Alert` (o testid `alert`
     confundiria a suíte), sem `Outlet` (proibido no fallback:
     `node_modules/react-router/docs/explanation/hydration.md:14`).
   - `router.tsx:70-72`: `HydrateFallback: RootLoading` na rota raiz.
   - `apps/web/index.html`:
     - `#root` (`:39`) recebe o mesmo texto, com `class="boot"` e
       `data-testid="app-loading"`, e um `<noscript>` com "Ative o JavaScript do
       navegador para usar a Fronteira Concursos.". O React apaga o conteúdo de
       `#root` no primeiro render;
     - um `<style>` DEPOIS do script de tema (`:28-36`), com comentário dizendo
       por que existe. A regra: `html[data-theme="dark"] { color-scheme: dark }`,
       e `.boot` com `min-height: 100vh`, centralizado, `padding: 16px`, fonte
       `system-ui` (a DM Sans vem no bundle), `background: Canvas; color:
       CanvasText`;
     - nada no `body`, e nada de `transition` (ver `CLAUDE.md`, "Nada de
       `transition` no `body`").

9. **Testes e2e** — ver a seção Testes. `describe` começa pelo id e cita o `QA-NN`.

10. **Documentação.** `docs/bugs-encontrados.md`: uma entrada por bug na seção
    "Varredura de 06/10/2026" (crie a seção se este for o primeiro PR mergeado).
    Registre lá o `?ano=` e o `?ritmo=`, que o relatório não tinha.

## Testes

**Unidade.** `lib/api/fixtures.test.ts`: `loadStudentFile` com id desconhecido
rejeita com `code === "not_found"`.

**E2E.**

- **F-PROF-01** (`apps/e2e/tests/teacher.spec.ts:28-37`), N-03 e QA-22:
  - cada rota ganha `await addTheoryCatalog(scenario, { withUnaudited: true })`
    antes do `goto` (duas disciplinas, dois cartões) e, depois do h1, a
    checagem de id repetido: `page.evaluate` colhe `[id]` e devolve os
    repetidos; espera `[]`;
  - em `/professor/teoria` e `/professor/revisoes`, afirme ANTES que há pelo
    menos dois `subject-rule-form` / `spacing-form` — senão a checagem passa
    sem exercitar nada;
  - `describe` aninhado com `test.use({ scenarioOptions: { withPlan: false } })`:
    `/professor/metas` mostra h1 "Gerar metas", `testId(page, "empty")` com
    "Nenhum planejamento ativo" e `consoleErrors` vazio. `addTheoryCatalog`
    exige planejamento: não o chame aqui.
- **F-PROF-03** (`teacher.spec.ts:89-94`): o aluno alheio e
  `/professor/alunos/nao-e-uuid` mostram h1 "Não encontrado", contêm "Aluno não
  encontrado" e NÃO contêm "Atualize a página".
- **F-ISO-02** (`apps/e2e/tests/isolation.spec.ts:115-147`), QA-13:
  - `?plano=` alheio em metas e cadernos: além da ausência do alheio, h1 da
    tela e `content(page)` contendo `outro.planName`;
  - `?catalogo=` alheio: h1 "Catálogo de teoria";
  - teste novo, "malformado cai no padrão": `?plano=nao-e-uuid` em metas,
    cadernos, revisões e estatísticas; `?catalogo=nao-e-uuid`;
    `?ano=1e9` nas estatísticas do professor e do aluno; `?ritmo=xyz` na lista.
    Cada um com o h1 de `PAGE_TITLES` (`apps/e2e/support/routes.ts`),
    `alert(page, "error")` com contagem 0 depois do h1, e `consoleErrors`
    vazio.
- **F-META-02** (`apps/e2e/tests/student-week.spec.ts:98-118`):
  - o laço de `:98-108` ganha `["fora do alcance", "1e9"]`;
  - "semana sem meta" (`:111-118`) vira dois casos: `?semana=40` abre a semana
    corrente ("Semana 1") com o combobox "Semana" preenchido; e, num
    `describe` com `test.use({ scenarioOptions: { withGoals: false } })`,
    `/aluno` mostra "Semana 1" e o vazio "Dia livre".
- **F-TCAT-01** (`teacher.spec.ts:414`) e **F-TREV-01** (`:518`, `:540`): troque
  `#field-initialQuestions` e `#field-lessonSpacing` por
  `form.locator('input[name="…"]')` — já estão escopados no formulário do
  cartão. Se preferir helper, `fieldIn(scope, name)` em `support/ui.ts`.
- **F-UI-11** (novo, `apps/e2e/tests/shell.spec.ts`), QA-23:
  - dois `describe` com `test.use({ viewport: { width: 375, height: 812 } })`,
    um teste por rota, como F-PROF-01: `STUDENT_ROUTES` e `TEACHER_ROUTES` mais
    a ficha. No do professor, `addTheoryCatalog(scenario)` antes, para o select
    do catálogo existir;
  - espere o h1 de `PAGE_TITLES` e só então meça `content(page).evaluate((m) =>
    m.scrollWidth - m.clientWidth)`, esperando `<= 0`. NÃO meça
    `documentElement`: ele nunca rola (ver QA-23);
  - no aluno, o botão de modo (`getByRole("button", { name: /^Livre/ })`) tem
    `scrollWidth <= clientWidth` — o nome com "Livre" já prova o 2.5.3;
  - um caso com o cronômetro rodando: "Iniciar cronômetro", esperar o link
    "Lançar tempo" e medir de novo.
- **F-UI-12** (novo, `shell.spec.ts`), QA-26:
  - autenticado, segure `/\/auth\/v1\/user/` com uma promessa, como F-TEMA-03
    segura `profiles` (`theme.spec.ts:153-160`); `goto("/aluno", { waitUntil:
    "commit" })`; `testId(page, "app-loading")` visível com "Carregando", zero
    `h1`; solte; h1 "Minha semana" e `app-loading` com contagem 0;
  - ouça `page.on("console")` do tipo `warning` e espere nenhum com
    "HydrateFallback" — o `consoleErrors` só guarda `error`;
  - sem o bundle: aborte `/\/(src\/main\.tsx|assets\/index-[^/]+\.js)/` (o
    primeiro é o Vite de desenvolvimento, o segundo o build); `/entrar` mostra
    `app-loading` com "recarregue". Repita com o tema escuro guardado
    (`addInitScript` gravando as chaves de `lib/theme.ts` antes da carga): o
    contraste do texto, medido por `collect` de `apps/e2e/support/contrast.ts`,
    é ≥ 4.5.
- **F-TEMA-03** e **F-TEMA-07** continuam verdes sem mudança — é a prova de que
  as telas de carregamento não quebraram o tema.

## Critério de pronto

- [ ] `npm run check` verde.
- [ ] `npm run db:reset` e depois `npm run e2e` verdes, incluindo F-PROF-01,
      F-PROF-03, F-ISO-02, F-META-02, F-TCAT-01, F-TREV-01, F-UI-11, F-UI-12 e
      F-TEMA-01 a F-TEMA-09.
- [ ] `grep -rn "minWidth: [0-9]\{3\}" apps/web/src/routes apps/web/src/components`
      não acha select ou campo dentro de linha flex sem `fieldWidth`.
- [ ] Na mão, com `npm run dev` e a rede em "Slow 3G" no DevTools: a primeira
      carga mostra "Carregando…", no claro e no escuro, e o console não traz o
      aviso de `HydrateFallback`.
- [ ] Specs 03 e 29, `fluxos-e2e.md` e `bugs-encontrados.md` atualizados.

## Armadilhas

- **`!` não protege nada sob o React Compiler.** Qualquer `x!.prop` dentro de
  função declarada no componente pode ser lido no render. Passe o valor como
  parâmetro depois do guarda.
- **O fallback substitui o `RootLayout`**, que é quem dá o tema; sem
  `ThemeShell` próprio não existe `theme.vars` e o fallback quebra — o mesmo
  motivo de `RootError` existir.
- **`h1` no fallback quebra o F-TEMA-03**, que afirma zero `h1` enquanto o
  perfil está preso. `data-testid="content"` também não: o `NotFound` usa, e a
  suíte o lê como "a tela abriu".
- **`count()` e `.all()` não esperam** (`CLAUDE.md`). Espere o h1 antes de
  contar formulários, ids ou alertas.
- **O aviso de `HydrateFallback` é `console.warn`**, e só existe no build de
  desenvolvimento do React Router — que é o que a suíte usa (`webServer`
  sobe `npm run dev`).
- **`?semana=` muda um comportamento testado.** O caso de `?semana=40` em
  F-META-02 afirmava "Semana 40"; ele muda junto, no mesmo commit da regra.
- **O PR 1 já mudou Gerar metas.** Ele tira o seletor "Substituição" (o select
  de `Goals.tsx:209` some — não há o que encolher ali) e reescreve a ação de
  gerar, inclusive o `plan!` do passo 5. Com o PR 1 na `main`, refaça as
  referências de linha de `Goals.tsx` antes de começar e aplique o passo 5 só
  ao que sobrou dele.
- **Conflitos esperados.** O PR 1 mexe no loader de `Goals.tsx` (`?semana=`,
  `:38`); o PR 4, em `RouteError.tsx`; o PR 6, em `router.tsx`,
  `routes/teacher/Goals.tsx:68`, `routes/student/Overview.tsx` e
  `routes/student/Statistics.tsx` (datas). Rebaseie sobre a `main`.
- **`subjectKey` não serve de sufixo de id**: tem espaço. `useId()` serve, e o
  formato dele não importa — a suíte não depende mais desses ids.

## Fora do escopo

- `?semana=` de Gerar metas (semana 0, negativa, fracionada): QA-17, PR 1.
- `?deck=` dos flashcards do aluno (`routes/student/Flashcards.tsx:40`): a
  coluna é texto e o valor inválido só não acha nada.
- Melhorias de UX 4 (404 dentro da área logada perde a barra) e 12 (barra
  compacta ocupando espaço em 375px).
- Projeto mobile no `playwright.config.ts`.
- O aviso de acesso do `StudentLayout.tsx:151-158` com `px: 4` fixo: cabe, só
  desperdiça margem.
