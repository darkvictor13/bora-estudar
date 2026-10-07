# Correção do QA de 06/10/2026

Entrada: [`../relatorio-qa-2026-10-06.md`](../relatorio-qa-2026-10-06.md), 29 bugs
sobre o commit `1769ae2`. Cada causa foi conferida contra o código antes de
virar plano.

**Cada arquivo desta pasta é um PR, escrito para uma sessão SEM contexto.**
Quem implementa lê, nesta ordem: o `CLAUDE.md` da raiz, este README e o
arquivo do PR. O plano diz o que fazer, onde e como saber que terminou; o
`CLAUDE.md` diz como se escreve código aqui. Quando os dois divergirem, vale o
`CLAUDE.md` — e o plano está errado: corrija-o no mesmo PR.

**Numeração.** Os bugs do relatório são `QA-01` a `QA-29`. `BUG-01` a `BUG-14`
já são de [`../bugs-encontrados.md`](../bugs-encontrados.md), e o `CLAUDE.md`
cita `BUG-14`: reaproveitar o prefixo faria o `describe` do e2e apontar para
dois defeitos. Achados da verificação que o relatório não tinha são `N-01` em
diante.

---

## Os PRs

| PR | Arquivo | Bugs | Branch | Migration | Depende de |
|---|---|---|---|---|---|
| 1 | [pr-1-semana-numa-transacao.md](pr-1-semana-numa-transacao.md) | QA-01, QA-05, QA-17 | `fix/qa-1-semana-numa-transacao` | sim | — |
| 2 | [pr-2-redirecionamento-aberto.md](pr-2-redirecionamento-aberto.md) | QA-02 | `fix/qa-2-redirecionamento-aberto` | não | — |
| 3 | [pr-3-um-planejamento-ativo.md](pr-3-um-planejamento-ativo.md) | QA-03, QA-12 | `fix/qa-3-um-planejamento-ativo` | sim | 1 |
| 4 | [pr-4-erro-legivel-e-retentativa.md](pr-4-erro-legivel-e-retentativa.md) | QA-06, N-01 | `fix/qa-4-erro-legivel` | não | — |
| 5a | [pr-5a-registro-de-estudo.md](pr-5a-registro-de-estudo.md) | QA-04, QA-07, QA-10, QA-11, QA-14, QA-27, QA-28, N-02, N-05, N-07 | `fix/qa-5a-registro-de-estudo` | sim | 1, 3, 4 |
| 5b | [pr-5b-questoes-da-teoria.md](pr-5b-questoes-da-teoria.md) | QA-04 (teoria) | `fix/qa-5b-questoes-da-teoria` | sim | 5a |
| 5c | [pr-5c-fechar-escrita-direta.md](pr-5c-fechar-escrita-direta.md) | QA-04 (fecha o caminho antigo) | `fix/qa-5c-fechar-escrita-direta` | sim | 5b **publicado em staging** |
| 6 | [pr-6-conta-acesso-e-datas.md](pr-6-conta-acesso-e-datas.md) | QA-08, QA-09, QA-20, QA-21, QA-25, QA-29, N-04 | `fix/qa-6-conta-acesso-e-datas` | não | 2 |
| 7 | [pr-7-limites-no-banco.md](pr-7-limites-no-banco.md) | QA-15, QA-16, QA-18, QA-19, QA-24, N-06 | `fix/qa-7-limites-no-banco` | sim | 5c, 4 |
| 8 | [pr-8-telas-e-casca.md](pr-8-telas-e-casca.md) | QA-13, QA-22, QA-23, QA-26, N-03 | `fix/qa-8-telas-e-casca` | não | 1, 6 |

**Os PRs com migration andam em fila: 1 → 3 → 5a → 5b → 5c → 7.** Cada branch
nasce da `main` depois do merge do anterior. A ordem dos arquivos em
`supabase/migrations/` é a ordem do timestamp, e duas branches criando
migration em paralelo produzem uma ordem que nenhuma das duas testou.

**Os sem migration (2, 4, 6, 8) andam em paralelo à fila**, com três
ressalvas:

- o 5a e o 7 usam a tradução de erro do 4;
- o 6 usa o validador do 2;
- o 8 vem depois do 1 e do 6, que mexem nas mesmas telas (`Goals.tsx`, os
  loaders do professor, `router.tsx`). O 4 e o 8 fazem a mesma troca em
  `supabase/session.ts:116`, e o plano do 8 avisa.

**Um PR por plano**, aberto no GitHub e mergeado na ordem. Todo merge na `main`
publica staging.

---

## O que a verificação mudou

**Os 29 se confirmam.** Três com ressalva:

- **QA-22:** o id duplicado é real; "campo sem nome" é quase todo falso
  positivo — o script conta o `<input aria-hidden>` que o `Select` do MUI esconde.
- **QA-17:** semana 0 pela URL vira 1 (`|| 1`), e 1,5 não grava (dá `22P02`
  cru). Negativo e 99999 passam.
- **QA-15:** só o cadastro tem `maxLength`; Meus dados, planejamento e turma
  não têm teto nem no navegador.

**Maiores do que o relatório diz:**

- **QA-04:** `recordInitialQuestions` e `recordReviewQuestions` leem, somam e
  gravam um contador. Retentativa e duas abas contam duas vezes, além de
  duplicar o registro.
- **QA-08:** a correção já existe no banco. `public.my_teacher()` devolve id e
  nome, tem grant e teste. O adaptador nunca a chama, e a fixture devolve
  sempre "Professor de Exemplo", o que escondeu o defeito.
- **QA-09:** o caso inverso também acontece. Aluno suspenso continua com os
  itens habilitados, e cada clique o devolve à lista de espera sem aviso.
- **QA-20:** além do ISO cru, há datas no fuso errado (N-04). E
  `effectiveAccess` compara `timestamptz` com data como TEXTO.

**Achados novos:**

| Id | O quê | Onde |
|---|---|---|
| N-01 | `once()` guarda para sempre a promessa REJEITADA. O `.then` que limpa a chave não roda na rejeição, então em 30 escritas que chamam helper que lança, a retentativa devolve o mesmo erro até recarregar e o botão fica preso em "Registrando…" | `apps/web/src/lib/api/supabase/idempotency.ts:35` |
| N-02 | O segundo estudo extra no mesmo dia bate em `23505`. Toda meta extra nasce com `day_position = 99`, e `goals_one_per_slot_idx` é único por (plano, semana, dia, posição) | `apps/web/src/lib/api/supabase/week.ts:472` |
| N-03 | Professor sem planejamento ativo quebra ao abrir "Gerar metas". O React Compiler leva o `plan!.id` para o render, e o aviso "Nenhum planejamento ativo" é inalcançável | `apps/web/src/routes/teacher/Goals.tsx:109` |
| N-04 | Datas em UTC: a ficha mostra a última atividade 3h adiantada, e "Novo planejamento" sugere o dia seguinte depois das 21h | `routes/teacher/Student.tsx:59`, `routes/teacher/Plans.tsx:127`, `routes/student/Account.tsx:36` |
| N-05 | Aluno com acesso vencido ainda APAGA registro de estudo e meta extra: `goal_entries_delete` e `goals_delete` não pedem `has_active_access()` | `supabase/migrations/20260914150000_initial_schema.sql:1721,1745` |
| N-06 | `subject_blocks.link` e `subject_lessons.link` aceitam `javascript:` pela API, e são renderizados em `routes/student/Subjects.tsx:80` | `20260914150000_initial_schema.sql:269,279` |
| N-07 | Estudo extra lançado com data passada conta no dia do LANÇAMENTO: o registro só tem `created_at = now()`, e série, sequência e estatísticas agrupam por ele | `apps/web/src/lib/api/supabase/week.ts:486`, `statistics.ts:391-398` |

---

## Decisões

| Id | Pergunta | Decidido |
|---|---|---|
| D-01 | O que gerar a semana preserva | Concluída (com ou sem registro) + qualquer meta com registro em `goal_entries` + meta com bateria |
| D-02 | Algum caminho pode apagar estudo registrado? | **Não.** Gerar apaga o plano, nunca o histórico. A FK de `goal_entries` para `goals` deixa de ser `cascade`, e nenhum caminho apaga meta com registro. **Revista em 06/10/2026 (PR 1):** a meta concluída SEM registro também é preservada, porque concluir já é uma afirmação do aluno sobre o que fez; com isso o modo "Replanejar semana inteira" apagaria o mesmo que o padrão, e sai (D-17) |
| D-17 | O modo "Replanejar semana inteira" | **Sai.** Com D-01 e D-02 ele apagaria exatamente o que o modo "Segura" apaga. Gerar metas fica com um comportamento só, sem seletor de substituição e sem a confirmação extra |
| D-03 | Na limpeza de dois ativos, o que vira o outro | `paused` (reversível). Vale só para a limpeza da migration: ativar pela tela continua ARQUIVANDO o anterior, como mandam a spec 14 (R-GPLAN-02) e a 03 (R-PLAN-05) |
| D-04 | Teto de um registro de estudo | 240 min (spec 12 R-CONC-10, spec 19 R-EXTRA-11) e 500 questões; piso 0; não pode ser tudo zero |
| D-05 | Data do estudo extra | Do `starts_on` do planejamento até hoje, data livre como a tela faz. A spec 19 se ajusta |
| D-06 | Tetos de texto | Nome de pessoa 120 (o `maxLength` do cadastro), plano e turma 120, observação 2000 |
| D-07 | Turma e deck pessoal com nome repetido | Recusar, ignorando maiúsculas e espaço nas pontas |
| D-08 | WhatsApp e nascimento | 10 a 13 dígitos; nascimento entre 1900-01-01 e hoje, sem idade mínima |
| D-09 | Link do caderno | Qualquer `https://`, não só o domínio do TEC |
| D-10 | Política de senha | Recusar senha em branco no contrato; política do GoTrue fica como está |
| D-11 | Fuso das datas | O do aparelho (`Intl` sem `timeZone`) |
| D-12 | Meus dados do professor | Sem o cartão Acesso; sem "fale com seu professor" |
| D-13 | `?plano=` malformado ou alheio | Cair no padrão em silêncio; ficha de aluno alheio mostra "Não encontrado" |
| D-14 | QA-29: o cadastro revela conta existente | **Manter**, registrar na spec 01 e no GAP-04 de `bugs-encontrados.md`, e pôr links "Entrar" e "Esqueci minha senha" na mensagem. Revisitar quando staging entregar e-mail |
| D-15 | Para onde o login devolve | Qualquer caminho interno que passe por `safeInternalPath`; parâmetro `next` |
| D-16 | Cancelar o estudo extra retoma o cronômetro? | Sim |
| D-18 | Estudo extra lançado com data passada | Conta no DIA ESTUDADO, não no dia do lançamento: `goal_entries` ganha o dia estudado, e série, sequência e estatísticas leem esse dia (PR 5a) |
| D-19 | Quem escreve em `goal_entries` | Só o aluno, pelas RPCs. O professor perde INSERT e UPDATE direto no 5c, e continua lendo e apagando |

D-01 a D-05, D-14 e D-17 a D-19 foram decididas pelo dono do produto em 06/10/2026. As
demais são o padrão recomendado: quem implementa segue, e quem discordar
reabre aqui antes do código.

---

## Regras comuns

### Ambiente

**Produção ainda não existe** (06/10/2026). Só há staging, e staging só tem dado
de teste. Duas consequências:

- **Migration corrige o dado e valida no mesmo arquivo.** Antes de criar uma
  constraint, um `update`/`delete` deixa as linhas existentes dentro da regra,
  e a constraint nasce validada — sem `NOT VALID`. O que a migration fez com
  os dados vai num comentário dela.
- **A compatibilidade com o bundle no ar continua valendo.** Em staging o banco
  sobe minutos antes do site. Coluna nova nasce `nullable` ou com default; RPC
  nova não substitui o caminho antigo no mesmo PR; revogar o que o bundle
  antigo usa é PR seguinte (é o 5c).

### Toda migration

- [ ] Arquivo NOVO, criado com `supabase migration new <nome_em_ingles>`; a
      `20260914150000` está congelada, como toda migration já aplicada.
- [ ] Toda função tem `set search_path = ''`, `revoke execute ... from public`
      e `grant` nominal só quando é API.
- [ ] Toda RPC que grava: `request_id` numa coluna única e comparação das
      PRÓPRIAS colunas. Ou o plano diz qual índice ou constraint a torna
      naturalmente idempotente.
- [ ] `npm run db:types` e o arquivo gerado no commit.
- [ ] `npm run db:test` e, depois dele, `npm run db:reset` antes do
      `npm run e2e` — o `db:test` quebra o `global-setup` do e2e.

### Todo PR

- [ ] **Primeiro commit: spec e catálogo.** A regra que muda vai para a spec
      dela, e o id de teste novo é reservado em
      [`../fluxos-e2e.md`](../fluxos-e2e.md), antes do código.
- [ ] Validação de formulário em `apps/web/src/lib/api/validation.ts`, chamada
      pelas DUAS implementações (`fixtures` e `supabase`), com a mesma frase.
      `fixtures.test.ts` é a especificação executável do contrato.
- [ ] O `describe` do e2e começa pelo id do fluxo e cita o `QA-NN`.
- [ ] Uma entrada em [`../bugs-encontrados.md`](../bugs-encontrados.md), na
      seção "Varredura de 06/10/2026" (o primeiro PR a ser mergeado a cria).
- [ ] `npm run check` verde. Nada é dado como funcionando sem ter rodado; o que
      ficou sem verificar vai escrito na descrição do PR.

### Reproduzir sem os scripts do QA

Os scripts do QA não foram versionados. As duas técnicas que eles usavam cabem
num teste do `apps/e2e`:

- **Rede caindo:** `await page.route("**/rest/v1/goals*", (route) => route.abort())`.
- **Servidor grava e a resposta se perde** — o pior caso para retentativa:

  ```ts
  await page.route("**/rest/v1/rpc/record_goal_entry", async (route) => {
    await route.fetch();   // o servidor processa e grava
    await route.abort();   // o navegador nunca recebe a resposta
  }, { times: 1 });
  ```

---

## Fora deste plano

- As 15 melhorias de UX do relatório. A 14 entra de graça no PR 6.
- Concluir, reabrir e pular por RPC, como pede a spec 12 R-CONC-01. Com a
  policy corrigida no 5a o defeito do QA fecha; a RPC é dívida da spec.
- O "Mapa das rotas" de `fluxos-e2e.md` e `apps/e2e/support/routes.ts`
  (`/aluno/leis`, `/aluno/resumos-flash`, `/aluno/cronometro`) — cabe em
  qualquer PR que já mexa no catálogo.
