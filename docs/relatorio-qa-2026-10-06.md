# QA_REPORT — Fronteira Concursos (bora-estudar)

Teste de ponta a ponta do site em `http://localhost:3000`, feito em 06/10/2026
sobre o commit `1769ae2` (`main`), contra o Supabase **local** (`127.0.0.1:54321`).
Nenhum arquivo da aplicação foi alterado.

> **Evidências não versionadas.** Os prints e os scripts citados abaixo (`qa-evidencias/`)
> ficaram na máquina de quem testou; só o relatório entrou no repositório. Os planos de
> correção estão em [`plano-qa/`](plano-qa/README.md), com os bugs renumerados `QA-01` a
> `QA-29` — `BUG-NN` já é a numeração de [`bugs-encontrados.md`](bugs-encontrados.md).

---

## Resumo

| | |
|---|---|
| Fluxos testados | **26** (todos os do inventário da Etapa 1) |
| ✅ OK | **7** |
| ⚠️ Problema menor | **15** |
| ❌ Quebrado | **4** |
| Bugs registrados | **29** — 1 Crítico · 4 Alto · 7 Médio · 17 Baixo |
| Melhorias de UX (separadas dos bugs) | 15 |
| Suíte e2e existente (`npm run e2e`) | 216 verdes · 4 `fixme` · 0 falhas — linha de base, antes de qualquer teste meu |
| Em 375px | todos os bugs que se reproduzem pela tela se repetem; 2 problemas novos só de layout (BUG-23) |

**O que corrigir primeiro**, nesta ordem:

1. **[BUG-01](#bug-01)** — regenerar a semana no modo "Segura" (ou "Limpar pendentes") **apaga o estudo
   que o aluno registrou**. É o dado mais caro do sistema, e sai sem aviso, pelo caminho normal da tela.
2. **[BUG-02](#bug-02)** — redirecionamento aberto em `/confirmar?next=`: um link no domínio do produto
   leva para qualquer site.
3. **[BUG-03](#bug-03)** — o índice "um planejamento ativo por aluno" **não existe** no banco, apesar
   de `CLAUDE.md` e `teacher-plans.ts` dizerem que existe; duas abas do professor produzem dois ativos.
4. **[BUG-04](#bug-04)** e **[BUG-05](#bug-05)** — escrita que não sobrevive a falha de rede:
   registro de estudo duplica na retentativa; gerar semana apaga a antiga e não cria a nova.

O que **funcionou bem** e merece registro: isolamento entre alunos e entre professores (pela tela e
pela API, sem vazamento nenhum em 15 sondagens pela tela e 17 pela API); a guarda de acesso das 13 telas de estudo para
`pending`, `suspended`, `expired` e "ativo com data vencida"; a idempotência de `set_student_access`
(duplo clique e resposta perdida gravam exatamente uma liberação); a validação de simulados; o
cronômetro, que sobrevive à navegação e ao F5; o tema; a busca de flashcards e de leis com caracteres
especiais.

---

## Como foi testado

- **Ferramenta:** Playwright 1.62 (Chromium), com scripts próprios fora do repositório que
  reaproveitam a fábrica de cenários de `apps/e2e/fixtures` — cada teste cria o próprio par
  professor/aluno. Um *fixture* automático gravou, em toda aba, erro e aviso de console, `pageerror`,
  requisição que falhou e resposta ≥ 400. Cópia dos scripts em `qa-evidencias/scripts/`.
- **Viewports:** desktop 1366×800 em tudo; **375×812** (mobile, toque) repetindo autenticação,
  vínculo/liberação, semana, planejamentos e geração de metas, mais uma sonda de todas as rotas
  (nenhuma estoura a largura da página). Em 375px, o teste das 27 rotas protegidas como anônimo não
  terminou dentro do prazo por causa do ruído descrito abaixo; a guarda é o mesmo código em qualquer
  largura e passou inteira no desktop.
- **Falhas injetadas:** rede derrubada (`route.abort`) e **resposta perdida depois de o servidor gravar**
  (`route.fetch()` seguido de `abort`), que é o pior caso para retentativa.
- **Usuários:** os do seed (`professor@local.dev` / `aluno@local.dev`, senha `SenhaLocal#2026`, de
  [`fluxos-e2e.md`](fluxos-e2e.md)) só para leitura; para escrita e permissão, usuários
  novos `*@e2e.local` (senha `E2ePass#2026!`), criados pelo cadastro da tela ou pela fixture. Professor
  foi promovido por SQL no banco local, como o seed faz — não há caminho de tela para isso, por design.
- **Não rodei** `db:reset` nem `db:test`. O banco local ficou com os usuários `*@e2e.local` e
  `qa-*@e2e.local` que os testes criaram; `npm run db:reset` limpa tudo.

### Ruído do ambiente (não é defeito do produto)

Durante todo o teste, um processo de outro projeto conectava e desconectava a rede docker
`xbri-noturno` a cada ~4 s, com a máquina em carga média 20 (16 núcleos). O Chromium reage a cada
mudança de interface abortando **tudo** o que está em voo com `net::ERR_NETWORK_CHANGED`. No Vite de
desenvolvimento uma carga completa baixa centenas de módulos ESM, e quase toda carga era interrompida,
deixando a página em branco. Por isso a maior parte da navegação dos testes foi feita **por dentro do
router** (`pushState` + `popstate`, que roda loaders e guardas exatamente como um clique), e toda
recarga tem nova tentativa. Nenhum dos bugs abaixo depende desse ruído; cada um foi reproduzido
isoladamente.

---

## Fluxos

| # | Fluxo | Status | Bugs |
|---|---|---|---|
| 1 | Login, logout, guarda de rota | ⚠️ | BUG-25 |
| 2 | Isolamento entre usuários (tela e API) | ✅ | — |
| 3 | Aluno sem acesso vigente | ⚠️ | BUG-07 |
| 4 | Cadastro | ⚠️ | BUG-15, BUG-18, BUG-29 |
| 5 | Vínculo e liberação de acesso | ⚠️ | BUG-06, BUG-09, BUG-20 |
| 6 | Semana do aluno (registrar, concluir, reabrir, pular, estudo extra) | ❌ | BUG-04, BUG-06, BUG-10, BUG-11, BUG-14, BUG-27 |
| 7 | Recuperação de senha e `/confirmar` | ❌ | BUG-02 |
| 8 | Planejamentos | ❌ | BUG-03, BUG-12, BUG-15, BUG-20 |
| 9 | Gerar metas | ❌ | BUG-01, BUG-05, BUG-17 |
| 10 | Teoria do aluno | ⚠️ | BUG-06 |
| 11 | Catálogo de teoria e importação MASTER | ⚠️ | BUG-22 |
| 12 | Turmas | ⚠️ | BUG-15, BUG-16 |
| 13 | Cadernos TEC | ⚠️ | BUG-06, BUG-24 |
| 14 | Revisões e reforço | ⚠️ | BUG-22 |
| 15 | Simulados presenciais | ✅ | — |
| 16 | Flashcards (biblioteca, deck pessoal, cartões da aula) | ⚠️ | BUG-16 |
| 17 | Leis e mapas de edital | ✅ | — |
| 18 | Estatísticas (aluno, professor, flashcards) | ✅ | — |
| 19 | Lista de alunos e ficha | ⚠️ | BUG-13 |
| 20 | Meus dados (aluno e professor) | ⚠️ | BUG-06, BUG-08, BUG-15, BUG-21 |
| 21 | Lista de espera | ⚠️ | BUG-06, BUG-19 |
| 22 | Barra lateral | ✅ | — |
| 23 | Tema claro/escuro | ✅ | — |
| 24 | Telas de leitura, cronômetro, calendário de constância | ✅ | — |
| 25 | Rotas legadas, parâmetros de URL e 404 | ⚠️ | BUG-13, BUG-26 |
| 26 | Celular (375px) | ⚠️ | BUG-23 |

---

## Bugs

Severidade: **Crítico** perde dado ou abre o sistema; **Alto** quebra um fluxo central ou expõe a
pessoa; **Médio** produz dado errado ou mente na tela, com contorno; **Baixo** é borda, mensagem ou
acabamento. Evidências em `qa-evidencias/` — `[D]` desktop, `[M]` 375px.

### <a id="bug-01"></a>BUG-01 · Crítico · Regenerar a semana no modo "Segura" apaga o estudo registrado pelo aluno

**Passos**
1. Aluno abre `/aluno?dia=todos`, clica **Registrar** numa meta de teoria e lança 40 min, 12 questões,
   9 acertos. A meta fica `in_progress` — registrar não conclui (é o que F-META-03 exige).
2. Professor abre `/professor/metas`, semana 1, **Substituição: Segura — preserva o que foi concluído**,
   **Ver prévia**, **Gerar**.

**Esperado:** o modo "Segura" preserva o que o aluno fez; no mínimo, a prévia avisa que há estudo
registrado que vai sumir.
**Obtido:** a meta em andamento é apagada e, com ela, os registros: `goal_entries` do aluno vai de
**1 (40 min) para 0**. A semana do aluno volta a "Tempo estudado 0min · Acertos 0/0". A prévia mostrava
"A substituir 5 · Preservadas 0 — concluídas, com os registros", sem mencionar os 40 minutos.

**Evidências:** `f9-1-previa-da-substituicao-segura-com-meta-em-andamento [D]`,
`f9-1-semana-do-aluno-depois-da-regeracao-segura [D]`.

**Causa provável:** `apps/web/src/lib/api/supabase/teacher-goals.ts:43` — `isPreserved` só considera
`completed`. `generateWeek` (`:213-218`) apaga tudo o que não é concluído, e a FK
`goal_entries_goal_fk … ON DELETE CASCADE` leva o ledger junto. `clearPendingGoals` (`:276-278`,
"Limpar pendentes") usa o mesmo critério e tem o mesmo efeito. Uma meta com registro em
`goal_entries` precisa ser tratada como preservada (ou a FK ser `RESTRICT`, como o `CLAUDE.md` pede
para o que não pode sumir do histórico).

---

### <a id="bug-02"></a>BUG-02 · Alto · Redirecionamento aberto em `/confirmar?next=`

**Passos:** abrir, sem estar logado:
- `http://localhost:3000/confirmar?next=/\evil.example/x`
- `http://localhost:3000/confirmar?next=/%09/evil.example/x`
- `http://localhost:3000/confirmar?next=/%5C%5Cevil.example`

**Esperado:** cair em `/redefinir-senha`, como acontece com `//evil.example` e `https://evil.example`.
**Obtido:** o navegador vai para `http://evil.example/x` (o teste interceptou o domínio e serviu uma
página "SITE EXTERNO"). Não precisa de código válido: o destino é o mesmo com erro ou sem.

**Evidências:** `f1-12-open-redirect-evil-example-x [D] [M]`, `f1-12-open-redirect-09-evil-example-x [D] [M]`,
`f1-12-open-redirect-5c-5cevil-example [D] [M]`.

**Causa provável:** `apps/web/src/routes/AuthCallback.tsx:29` só recusa o prefixo `//`. O parser de
URL do navegador trata `\` como `/` e descarta TAB/quebra de linha, então `/\host` e `/<TAB>/host`
viram `//host`. O `pushState` recusa a outra origem e o React Router cai em `location.assign`.
Validar com `new URL(requested, location.origin).origin === location.origin`, ou aceitar só uma lista
fixa de destinos.

---

### <a id="bug-03"></a>BUG-03 · Alto · O banco aceita dois planejamentos ativos para o mesmo aluno — e a tela produz isso

**Passos (pela tela):** professor com dois planejamentos pausados do mesmo aluno; abre
`/professor/planejamentos` em **duas abas** e clica **Ativar** num plano em cada aba, quase ao mesmo tempo.
**Passos (pela API):** `PATCH /rest/v1/study_plans?id=eq.<segundo>` `{"status":"active"}` com o token do professor → **200**.

**Esperado:** um ativo por aluno, garantido por índice único parcial — é o que o `CLAUDE.md` afirma
("Um planejamento ativo por aluno é índice único parcial") e o que o cabeçalho de
`apps/web/src/lib/api/supabase/teacher-plans.ts:4-7` dá como certo.
**Obtido:** dois planejamentos `active` para o mesmo aluno. O índice **não existe** em nenhuma
migration — `study_plans` só tem `study_plans_name_per_student_uidx` (`20260914150000_initial_schema.sql:901`).
A tela do aluno não quebra, mas mostra um dos dois sem critério.

**Evidências:** `ev2-professor-com-dois-planejamentos-ativos-para-o-mesmo-aluno [D]`,
`ev2-aluno-com-dois-planejamentos-ativos [D]`.

**Causa provável:** índice faltando; `activatePlan` (`teacher-plans.ts:142-176`) arquiva "os ativos"
e depois ativa o novo em duas requisições, e duas abas intercalam as quatro. Correção:
`create unique index … on study_plans (student_id) where status = 'active'` (migration nova) e,
de preferência, ativar numa RPC com transação.

---

### <a id="bug-04"></a>BUG-04 · Alto · Registro de estudo duplica quando a resposta se perde e o aluno tenta de novo

**Passos:** em `/aluno?dia=todos`, **Registrar** numa meta, 25 min, **Registrar**. O servidor grava,
mas a resposta não chega (simulado com `route.fetch()` + `abort`). A tela mostra o erro; o aluno clica
**Registrar** de novo, no mesmo diálogo.

**Esperado:** um envio, um registro — o `request_id` nasce ao abrir o diálogo justamente para isso
(`RecordStudyDialog.tsx:23`, e a seção "`request_id` gerado uma vez, na origem" do `CLAUDE.md`).
**Obtido:** **2 registros de 25 min** em `goal_entries`. Além disso, o erro mostrado é
`TypeError: Failed to fetch` (ver BUG-06).

**Evidência:** `f6-4-registro-com-resposta-perdida [D]`.

**Causa provável:** a proteção só existe na memória do navegador. `goal_entries` não tem coluna de
`request_id`, e `once()` (`apps/web/src/lib/api/supabase/idempotency.ts:36`) **esquece o id quando a
tentativa falha** — de propósito, para permitir retentativa, o que transforma "sem rede depois de
gravar" em gravação dupla. Precisa de `request_id` único na tabela (a primeira forma descrita no
`CLAUDE.md`). Vale o mesmo para `recordExtraStudy`, `recordInitialQuestions` e `recordReviewQuestions`.

---

### <a id="bug-05"></a>BUG-05 · Alto · Falha ao gravar a semana apaga as metas antigas e não cria as novas

**Passos:** `/professor/metas`, semana 1 com 5 metas, **Ver prévia**, **Gerar** com o `POST /rest/v1/goals`
falhando (rede caiu).
**Esperado:** nada muda, e a tela diz que não gravou.
**Obtido:** metas da semana 1: **5 → 0**. O aluno fica com a semana vazia.

**Evidência:** `f9-2-gerar-semana-com-insercao-falhando [D]`.

**Causa provável:** `teacher-goals.ts:218` faz `DELETE` e `:231` faz `INSERT`, em duas requisições, sem
transação. Mover para uma RPC (`apply_week` / equivalente) resolve este e o BUG-01 no mesmo lugar.

---

### <a id="bug-06"></a>BUG-06 · Médio · Erros de rede e do Postgres chegam crus à tela, em inglês

Sistêmico — o mesmo defeito em todos os formulários que escrevem pelo PostgREST:

| Onde | Gatilho | O que a pessoa lê |
|---|---|---|
| Registrar estudo, Meus dados (aluno e professor), Assumir aluno | rede caiu | `TypeError: Failed to fetch` |
| Lista de espera | WhatsApp com menos de 8 caracteres | `new row for relation "waitlist" violates check constraint "waitlist_whatsapp_check"` |
| Cadernos (professor) | meta 150% ou −1% | `new row for relation "study_plan_notebooks" violates check constraint "study_plan_notebooks_subject_target_check"` |
| Registrar estudo | 1,5 minuto | `invalid input syntax for type integer: "1.5"` |
| Registrar estudo | 99999999999 minutos | `value "99999999999" is out of range for type integer` |
| Teoria (aluno) | "Parei na página" 7,5 | `invalid input syntax for type integer: "7.5"` |

O login, por comparação, traduz a mesma falha de rede para "Sem conexão. Verifique a rede e tente de novo.".

**Evidências:** `f21-1-lista-de-espera-com-whatsapp-abc-e-nascimento-no-futuro [D]`, `f5-2-assumir-sem-rede [D] [M]`,
`f6-4-registro-com-resposta-perdida [D]`, `f13-1-caderno-meta-150 [D]`, `f6-2-registro-minutos-fracionados [D]`,
`f10-1-pagina-7-5 [D]`.

**Causa provável:** `apps/web/src/lib/api/supabase/errors.ts:95` (`translateDbError`) só conhece
`42501`, `P0001`, `23505`, `23503` e `PGRST116`; o resto cai no `default` com `error.message` cru.
Faltam: falha de `fetch` (o postgrest-js devolve `code: ""` e `message: "TypeError: Failed to fetch"`
→ `offline`), `23514` (check), `22P02` e `22003`. Como o código fica `unknown`, `fail`/`failure` também
**relatam cada queda de rede ao Sentry** como erro desconhecido. É a classe do BUG-09 de
`docs/bugs-encontrados.md`, marcado como corrigido.

---

### <a id="bug-07"></a>BUG-07 · Médio · Aluno com acesso suspenso ou vencido continua concluindo, reabrindo e pulando metas

**Passos:** aluno com a semana aberta; o professor clica **Bloquear acesso**; o aluno clica no check
**Concluir** de uma meta. Ou, pela API, com o token do aluno suspenso:
`PATCH /rest/v1/goals?id=eq.<meta>` `{"status":"completed"}` → **200**.
**Esperado:** recusa com "seu acesso venceu", como acontece ao registrar estudo (`goal_entries`).
**Obtido:** a meta fica `completed` (ou `skipped`); só **depois** a revalidação manda o aluno para a
lista de espera.

**Evidência:** `f3-2-concluir-meta-com-acesso-suspenso [D]`.

**Causa provável:** `supabase/migrations/20260914150000_initial_schema.sql:1717-1719` — o `WITH CHECK`
de `goals_update` não tem `has_active_access()`, ao contrário de `goals_insert` e de
`goal_entries_insert`/`_update`. Na mesma brecha, o aluno ativo grava pela API
`correct_answers = 999` com `questions_answered = 10` direto na meta — hoje nenhuma tela lê essas
colunas (as telas leem o ledger), então o efeito é latente; não há CHECK de consistência.

---

### <a id="bug-08"></a>BUG-08 · Médio · Aluno vinculado vê "Ainda sem professor" em Meus dados

**Passos:** entrar como `aluno@local.dev` (vinculado à professora do seed) → `/aluno/conta`.
**Esperado:** "Professor: Professora Local".
**Obtido:** "Professor: **Ainda sem professor**" — para todo aluno vinculado. Quem lê isso volta à
lista de espera ou procura outro professor.

**Evidência:** `ev1-aluno-do-seed-vinculado-ve-ainda-sem-professor [D]`.

**Causa provável:** `apps/web/src/lib/api/supabase/auth.ts:113-120` lê o nome com
`select name from profiles where id = <teacher_id>`, mas a policy `profiles_select`
(`initial_schema.sql:1498-1499`) só libera a própria linha e as linhas dos próprios alunos. A consulta
volta `[]` sem erro e o `?? "Ainda sem professor"` de `routes/student/Account.tsx:114` assume.
Confirmado pela API: com o token do aluno, `GET /rest/v1/profiles?id=eq.<professor>` → `[]`.

---

### <a id="bug-09"></a>BUG-09 · Médio · Depois de liberado, o aluno continua com a barra lateral travada até recarregar a página

**Passos:** aluno pendente em `/aluno/conta`; professor clica **Liberar acesso** na ficha; o aluno
navega pela própria barra (**Lista de espera** → **Meus dados**).
**Esperado:** os itens de estudo destravam na próxima navegação.
**Obtido:** continuam inertes. A mesma tela mostra o banner "Seu acesso ainda não foi liberado" **e**
"Acesso: Liberado · Válido até 06/01/2027". Só o F5 destrava.

**Evidência:** `f5-5-liberado-mas-barra-lateral-continua-travada [D]`.

**Causa provável:** `studentLayoutLoader` (`apps/web/src/routes/StudentLayout.tsx:25`) calcula
`hasAccess`, mas o layout não declara `shouldRevalidate`, e o React Router não roda de novo o loader de
uma rota que continua casada. O comentário de `lib/auth/session.ts:37` descreve exatamente esse caso
como algo que não deveria acontecer.

---

### <a id="bug-10"></a>BUG-10 · Médio · Registro de estudo aceita valores negativos e sem teto

**Passos:** **Registrar** com cada uma das entradas abaixo.

| Entrada | Resultado |
|---|---|
| −30 min, 5 questões, 2 acertos | **gravado** (`minutes = -30`) |
| 30 min, −5 questões, −10 acertos | **gravado** |
| 14 400 min (10 dias num registro) | **gravado** |
| `1e3` min | gravado como 1000 |

**Esperado:** recusa com frase, como já acontece com "acertos > questões" e "tudo zero".
**Obtido:** os negativos entram no ledger e descontam do tempo e do aproveitamento nas estatísticas.

**Evidências:** `f6-2-registro-minutos-negativos-com-questoes [D]`, `f6-2-registro-questoes-e-acertos-negativos [D]`,
`f6-2-registro-minutos-absurdos-10-dias [D]`.

**Causa provável:** a validação mora no adaptador (`apps/web/src/lib/api/supabase/week.ts:305-313`), não
em `lib/api/validation.ts` como o `CLAUDE.md` exige, e só cobre dois casos; `goal_entries` não tem
nenhuma CHECK (`minutes >= 0`, `questions >= 0`, `correct_answers between 0 and questions`).

---

### <a id="bug-11"></a>BUG-11 · Médio · Estudo extra aceita datas fora do planejamento

**Passos:** **Estudo extra**, matéria "Direito Penal", 15 min, **Data** = `2031-01-01`; depois `2020-01-01`.
**Esperado:** recusa ("a data precisa estar dentro do planejamento") ou, no mínimo, não aceitar futuro.
**Obtido:** 2031 cria uma meta na **semana 222** do planejamento; 2020 cria na **semana 1, quarta-feira**
— o estudo de 2020 aparece nesta semana.

**Evidências:** `f6-8-estudo-extra-em-2031-01-01 [D]`, `f6-8-estudo-extra-em-2020-01-01 [D]`.

---

### <a id="bug-12"></a>BUG-12 · Médio · Falha de rede no meio de "Ativar" deixa o aluno sem nenhum planejamento ativo

**Passos:** `/professor/planejamentos`, **Ativar** num plano pausado, com a segunda requisição falhando.
**Esperado:** ou ativa, ou nada muda.
**Obtido:** o plano anterior foi arquivado e o novo não foi ativado: o aluno passa a ver "sem planejamento".

**Evidência:** `f8-5-ativar-plano-com-rede-caindo-no-meio [D]`.
**Causa provável:** a mesma do BUG-03 — duas escritas sem transação em `activatePlan`.

---

### <a id="bug-13"></a>BUG-13 · Baixo · Parâmetro de URL malformado ou de outro professor derruba seis telas do professor

| URL | Tela |
|---|---|
| `/professor/metas?plano=<qualquer id que não é seu>` (inclusive UUID válido) | "Algo deu errado: **Cannot read properties of null (reading 'id')**" — exceção JS |
| `/professor/cadernos?plano=nao-e-uuid`, `/professor/revisoes?plano=…`, `/professor/teoria?catalogo=…`, `/professor/estatisticas?plano=…` | "Algo deu errado: invalid input syntax for type uuid" |
| `/professor/revisoes?plano=<UUID que não existe>` | "Algo deu errado: Planejamento não encontrado." |
| `/professor/alunos/nao-e-uuid` | "Algo deu errado: Aluno não encontrado…" + "Atualize a página" |
| `/aluno?semana=1e9` | "Algo deu errado" |

**Esperado:** ignorar o parâmetro inválido e cair no padrão (é o que o lado do aluno faz com `?aula=`,
`?deck=`, `?meuDeck=`, `?simulado=`, `?dia=`), ou uma tela de "não encontrado".
**Evidências:** `f25-1-professor-metas-plano-nao-e-uuid [D]` e os demais `f25-1-*`, `f6-9-semana-1e9 [D]`.
**Causa provável:** `apps/web/src/routes/teacher/Goals.tsx:105-109` (`plans.find(...) ?? null` seguido de
`plan!.id`); os demais loaders passam o texto da URL direto para o filtro do PostgREST.

---

### <a id="bug-14"></a>BUG-14 · Baixo · Estudo extra aberto na visão "Semana inteira" sugere segunda-feira, não hoje

**Passos:** `/aluno?dia=todos` (hoje é terça, 06/10) → **Estudo extra**.
**Obtido:** o campo Data vem preenchido com **05/10** (segunda). Quem não percebe lança o estudo no dia
errado, e isso altera a sequência de dias e a série diária.
**Causa provável:** `apps/web/src/routes/student/Overview.tsx:311` usa `weekOf?.startsOn` quando não há
dia selecionado; deveria preferir hoje quando hoje está na semana.

---

### <a id="bug-15"></a>BUG-15 · Baixo · Limite de tamanho de texto só existe no navegador

O `maxlength` do campo é a única barreira. Removido (DevTools ou API), o servidor grava:

| Campo | Gravado |
|---|---|
| Nome no cadastro | 400 caracteres |
| Nome em Meus dados (aluno e professor) | 300 caracteres |
| Nome do planejamento | 487 caracteres |
| Nome da turma | 502 caracteres |

A barra lateral, os cartões e as listas não foram desenhados para isso.
**Evidências:** `f4-5-nome-de-400-caracteres-aceito [D] [M]`, `f20-1-nome-com-300-caracteres-aluno [D]`,
`f8-1-plano-com-nome-de-490-caracteres [D]`, `f12-1-turma-com-nome-de-500-caracteres [D]`.
**Correção:** CHECK de `char_length` em `profiles.name`, `study_plans.name` e `classes.name`, como
`waitlist` e `mock_exams` já têm.

---

### BUG-16 · Baixo · Duplicidades aceitas

- Duas turmas com o **mesmo nome** do mesmo professor.
- Dois decks pessoais com a mesma disciplina e o mesmo assunto.
- Planejamento com nome repetido é recusado (há índice), mas com a frase genérica "Este registro já existe."

---

### BUG-17 · Baixo · Gerar metas aceita semana 0, negativa, fracionada e 99999

A prévia é montada para semana `0`, `-3`, `1.5` e `99999`. `goals` não tem CHECK em `week_number`
(nem em `planned_minutes`), então confirmar grava.
**Evidências:** `f9-3-previa-para-semana-0 [D]`, `f9-3-previa-para-semana-3 [D]`, `f9-3-previa-para-semana-99999 [D]`.

---

### BUG-18 · Baixo · Cadastro aceita senha formada só por espaços

Oito espaços passam pela validação (`checkPassword` só mede o comprimento) e pelo GoTrue.

---

### BUG-19 · Baixo · Lista de espera aceita WhatsApp sem formato e nascimento no futuro

`waitlist_whatsapp_check` só mede o comprimento (8 a 30): "abcdefgh" passaria. Data de nascimento
`2031-01-01` é gravada.
**Evidência:** `f21-1-lista-de-espera-com-nascimento-no-futuro [D]`.

---

### BUG-20 · Baixo · Datas em formato de máquina na área do professor

- Ficha do aluno: "Vigência atual até **2027-01-06T18:37:06.167505+00:00**." — `access_expires_at` é
  `timestamptz`, e `apps/web/src/components/teacher/AccessForm.tsx:91` o imprime cru.
- Para quem venceu em 2020 a mesma frase diz "…até 2020-06-01T00:00:00+00:00. Liberar soma ao que
  ainda falta." — não falta nada; a liberação (corretamente) conta de hoje.
- Planejamentos: "Início em **2026-10-05**" (`routes/teacher/Plans.tsx:239`).

**Evidência:** `f5-3-vigencia-em-formato-iso [D]`.

---

### BUG-21 · Baixo · "Meus dados" do professor reaproveita os textos do aluno

Em `/professor/conta`: "O que o seu professor vê sobre você", "Para trocar o e-mail de acesso, fale
com seu professor", e um bloco Acesso com "Professor: Ainda sem professor · Plano: — · Válido até: sem
prazo" (`routes/student/Account.tsx:70, 92, 114`).
**Evidência:** `ev1-meus-dados-do-professor-com-textos-de-aluno [D]`.

---

### BUG-22 · Baixo · Acessibilidade: IDs duplicados e campos sem rótulo nos cartões repetidos

`Field` gera `id="field-${name}"` (`packages/ui/src/primitives/Field.tsx:42`). Em telas com um cartão
por disciplina, o id repete e o `<label for>` do segundo cartão aponta para o campo do primeiro:

| Tela | IDs repetidos | Campos sem nome acessível |
|---|---|---|
| `/professor/teoria` | `field-initialQuestions`×2 | 3 |
| `/professor/revisoes` | `field-lessonSpacing`×2, `field-minimumQuestions`×2 | 3 |
| `/professor/cadernos` | — | 1 |
| `/professor/metas` | — | 2 |

Leitor de tela anuncia "Meta de questões por aula Meta de questões por aula" no primeiro e nada no
segundo; clicar no rótulo do segundo cartão foca o campo do primeiro.

---

### BUG-23 · Baixo · Dois elementos não cabem em 375px

- O chip **"Livre"** do cronômetro, no topo de todas as telas do aluno: 23px de texto num chip de 19px,
  o texto vaza do círculo.
- O select **Catálogo** em `/professor/teoria` termina em x = 382 numa tela de 375: a borda direita é cortada.

**Evidências:** `f26-1-chip-do-cronometro-cortado [M]`, `f26-1-select-do-catalogo-cortado [M]`.

---

### BUG-24 · Baixo · O link do caderno aceita `javascript:`

O professor grava `javascript:…` em **Link** e o banco aceita (não há validação de URL). O React 19
neutraliza no clique do aluno (`href` vira `javascript:throw new Error('React has blocked…')`), então não
há execução — é defesa em profundidade, não XSS explorável hoje. Aceitar só `https://`.
**Evidência:** `f13-1-aluno-clica-em-link-javascript-do-caderno [D]`.

---

### BUG-25 · Baixo · Login não devolve ao link que a pessoa abriu

Abrir `/professor/alunos/<id>` sem sessão leva a `/entrar`; depois do login a pessoa cai em
`/professor`, não na ficha. `requireSession` (`lib/auth/session.ts:80`) não guarda o destino.
**Evidência:** `f1-2-link-profundo-perdido-apos-login [D] [M]`.

---

### BUG-26 · Baixo · A primeira carga é uma tela branca até a sessão e os loaders responderem

O router não tem `HydrateFallback` (o React Router avisa no console em **toda** primeira carga: "No
`HydrateFallback` element provided to render during initial hydration"), e `index.html` não tem
nenhum conteúdo dentro de `#root`. Até a cascata sessão → perfil → loaders da rota terminar, a tela
é branca; num celular com rede ruim isso é o que a pessoa vê primeiro. E se o bundle falhar, a página
fica branca para sempre, sem mensagem — foi o que o ruído de rede deste ambiente produziu dezenas de
vezes (ver "Ruído do ambiente"). Um `HydrateFallback` na raiz e um texto mínimo em `#root` resolvem os
dois casos. (A medição com rede lenta no Vite de desenvolvimento não é representativa — sem bundle,
são centenas de módulos — e por isso não está aqui.)

---

### BUG-27 · Baixo · "Estudo extra" altera o cronômetro durante o render

Abrir o diálogo gera no console: "Cannot update a component (`StudyTimerBar`) while rendering a
different component (`ExtraStudyDialog`)". `ExtraStudyDialog.tsx:58` chama
`pauseStudyTimerForRecord()` dentro do inicializador do `useState`, que grava no armazenamento do
cronômetro enquanto renderiza. Em modo estrito o inicializador roda duas vezes.

---

### BUG-28 · Baixo · Colunas de resultado da meta são graváveis pelo aluno sem consistência

Ver o fim do BUG-07: `goals.correct_answers`, `questions_answered` e `spent_minutes` aceitam qualquer
valor do aluno (999 acertos em 10 questões) em metas que não são de bateria. Nenhuma tela lê essas
colunas hoje; o `CLAUDE.md` pede que contador não seja mantido à mão — remover do grant ou derivar.

---

### BUG-29 · Baixo · O cadastro confirma quem já tem conta

Login e recuperação respondem de forma neutra de propósito, mas o cadastro diz "Já existe uma conta com
este e-mail." (inclusive para o e-mail em maiúsculas). Qualquer um verifica se um e-mail é cliente.
É uma escolha de produto — registrada aqui porque desfaz a neutralidade das outras duas telas.
**Evidência:** `f4-2-cadastro-repetido-igual [D] [M]`.

---

## Melhorias de UX (não são bugs)

1. **"Recuperar senha" diz "Enviamos um link…" antes de enviar** (`routes/public/ForgotPassword.tsx:12`).
   E, depois do envio, o campo de e-mail esvazia — a pessoa não confere para onde foi.
2. **Plural:** "0 de 1 metas concluídas" no seletor de dias da semana.
3. **A busca por nome em "Meus alunos" não vai para a URL**, ao contrário de turma e ritmo: some no F5
   e não se compartilha.
4. **404 dentro da área logada perde a barra lateral** — só sobra "Ir para o início".
5. **"Não encontrado" como erro:** `/professor/alunos/<id alheio>` mostra "Algo deu errado… Atualize a
   página", quando atualizar não muda nada.
6. **Select vazio com valor inválido na URL:** `?semana=99` e `?ritmo=xyz` deixam o select em branco
   (o MUI avisa "out-of-range value").
7. **Cadastro repetido:** além da frase, um link "Entrar" ou "Esqueci minha senha" ali mesmo.
8. **Liberação de acesso:** mostrar a data nova ("Liberado até 06/01/2027") no aviso de sucesso, em vez de
   "Acesso liberado por 3 meses".
9. **Planejamento ativo em duas abas:** depois de ativar, a outra aba continua oferecendo "Ativar"
   num plano que já não está pausado (lista velha até o F5).
10. **Importar MASTER** grava uma aula por requisição, sem transação: num erro no meio a importação fica
    pela metade. Os arquivos inválidos testados (texto, vazio, `{}`, `[1,2,3]`, `null`) foram todos
    recusados com frase clara.
11. **Estudo extra:** "Matéria" é um campo livre com `datalist`; o aluno não percebe as sugestões no
    celular. Um select com "Outra…" deixaria o caso comum a um toque.
12. **Barra lateral compacta no celular:** ocupa ~45px fixos em 375px; em telas densas (Gerar metas,
    Catálogo) os selects ficam truncados ("Segura — preserva o que fo…").
13. **"Sair" dispara duas chamadas `POST /auth/v1/logout`**; a segunda é abortada. A sessão é revogada
    corretamente (verificado: refresh token antigo → 400, access token antigo → 403), mas a chamada dupla
    polui o console e o relato de erro.
14. **Ficha do aluno para quem venceu:** em vez de "Liberar soma ao que ainda falta", dizer "Venceu em
    01/06/2020. A liberação conta a partir de hoje."
15. **Celular: não dá para ver quem está logado.** A barra compacta mostra só as iniciais ("AL"); o nome
    (`user-name`) não existe em 375px. Em aparelho compartilhado, um toque nas iniciais poderia mostrar o
    nome e o papel.

---

## Observações técnicas e de documentação

- **`CLAUDE.md` e `teacher-plans.ts` afirmam um índice que não existe** (BUG-03). Vale procurar outras
  invariantes "garantidas pelo banco" com `grep` nas migrations antes de confiar nos comentários.
- **A validação do registro de estudo não está em `lib/api/validation.ts`**, contrariando a regra
  "validação de formulário é do contrato" (BUG-10). `fixtures` e `supabase` podem divergir.
- **`docs/fluxos-e2e.md` — "Mapa das rotas" está defasado**: faltam `/aluno/leis`, `/aluno/flashcards`,
  `/aluno/resumos-flash`, `/aluno/cronometro`, `/aluno/simulados`, `/professor/turmas`,
  `/professor/simulados`.
- **`apps/e2e/support/routes.ts` não lista `/aluno/leis`, `/aluno/resumos-flash` nem
  `/aluno/cronometro`**, então o F-AUTH-01 não confere a guarda delas. Eu conferi: as três mandam o
  anônimo para `/entrar` e o aluno sem acesso para a lista de espera.
- **Os seeds de caderno linkam para a home do TEC** (`https://www.tecconcursos.com.br/`), não para um
  caderno — não é defeito do app, mas torna "Abrir no TEC" indistinguível de um link quebrado na demonstração.

## Evidências e scripts

- Screenshots: `qa-evidencias/` — nome do arquivo = id do teste + descrição + viewport.
- Scripts Playwright: `qa-evidencias/scripts/` — `tests/NN-*.spec.ts` por nível
  de criticidade, `qa.ts` (monitor de console/rede e navegação resiliente). Para rodar: copiar a pasta
  para fora do repositório, criar `node_modules` como link para o `node_modules` da raiz e
  `npx playwright test --project desktop` com Node 24.
