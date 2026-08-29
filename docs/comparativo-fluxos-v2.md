# Comparativo de fluxos — v2 (HTML) × versão atual

Levantamento do que a versão anterior (`~/Documents/bora estudar v2`, site em
HTML/JS + extensão 1.0.4) oferecia como fluxo de tela, confrontado com o que a
versão atual implementa.

O catálogo dos fluxos atuais está em [`fluxos-e2e.md`](fluxos-e2e.md) e o que
cada feature implementada faz, em [`specs/`](specs/README.md) — este documento
não os repete, aponta para eles. O que interessa aqui é a diferença:
**o que existia e ainda não foi reconstruído**, **o que foi reconstruído
melhor** e **o que existia e não deve voltar**.

Fontes do lado v2: `bora estudar site/{index,aluno,professor}.html`,
`assets/js/pages/{index,aluno,professor}.js` (14.874 linhas de JS somadas) e
`bora estudar extensao/{popup.html,content.js}`.

---

## Legenda

| | Significado |
|---|---|
| ✅ | Existe na versão atual, com cobertura equivalente ou melhor |
| 🟡 | Existe em parte — a tela abre, mas alguma ação do fluxo não está lá |
| ❌ | Não existe na versão atual |
| 🚫 | Existia na v2 e **não deve** voltar como estava — viola a fronteira de escrita do `CLAUDE.md` |

---

## Quadro-resumo

| Área | Fluxos na v2 | ✅ | 🟡 | ❌ | 🚫 |
|---|---:|---:|---:|---:|---:|
| Autenticação e conta | 8 | 6 | 1 | 1 | 0 |
| Aluno — metas e execução | 10 | 2 | 3 | 4 | 1 |
| Aluno — bateria inteligente | 6 | 4 | 1 | 1 | 0 |
| Aluno — reforço e revisão | 8 | 2 | 1 | 5 | 0 |
| Aluno — conteúdo e análise | 10 | 4 | 1 | 3 | 2 |
| Professor — alunos e acesso | 10 | 3 | 1 | 6 | 0 |
| Professor — planejamento | 9 | 1 | 1 | 7 | 0 |
| Professor — acompanhamento | 6 | 1 | 2 | 3 | 0 |
| Extensão | 9 | 6 | 0 | 3 | 0 |
| **Total** | **76** | **29** | **11** | **33** | **3** |

Em uma frase: a versão atual reconstruiu **a espinha do produto** — login,
guardas por papel, geração de metas pelo professor e a volta completa da
bateria — com muito mais rigor de banco e de teste, e ainda não reconstruiu
**a periferia de gestão**, que na v2 era feita quase toda por escrita direta do
navegador.

---

## 1. Autenticação e conta

| Fluxo v2 | Onde estava | Situação | Observação |
|---|---|---|---|
| Boas-vindas → entrar ou criar conta | `#auth-view-welcome` | ✅ | Virou duas rotas, `/entrar` e `/cadastro` |
| Login | `#auth-form`, `initLoginSupabase` | ✅ | F-AUTH-02/03/04 |
| Cadastro público de aluno | `#signup-form` | ✅ | F-AUTH-08/09. Continua sem criar vínculo nem assinatura |
| Recuperar senha | `recuperarSenhaSupabase` | ✅ | F-AUTH-10. A v3 devolve resposta neutra; a v2 confirmava o envio |
| Redefinir senha pelo link | `#auth-view-reset` | ✅ | F-AUTH-11/12, incluindo link expirado |
| Roteamento por perfil | `destinoPorPerfil` (index.js:2195) | ✅ | Virou guarda de loader. A v2 checava no cliente; a v3 barra antes de renderizar (F-AUTH-01/05) |
| Cupom de acesso | `normalizarCupomAcesso`, `dadosCupomAcesso` | 🟡 | A tabela `coupons` existe no schema atual; nenhuma tela a lê ou escreve |
| Tema claro/escuro | `toggleTheme` nas três páginas | ❌ | Sem equivalente |

---

## 2. Aluno — metas e execução

| Fluxo v2 | Onde estava | Situação | Observação |
|---|---|---|---|
| Painel de metas da semana, agrupado por dia | `p-dashboard` | ✅ | `/aluno`, F-ALU-01 |
| Seletor de semana | `#dash-sem-sel` | ✅ | `?semana=<n>`, F-ALU-02 |
| Hero da semana: desempenho, tempo, questões, sequência de dias | `renderWeekHero` | 🟡 | A v3 mostra só "X de Y metas concluídas". Tempo agregado e sequência sumiram |
| Abas Metas / Reforço no painel | `ensureDashboardTabs` (aluno.js:1268) | 🟡 | O reforço virou rota própria, `/aluno/revisoes` |
| **Concluir meta de teoria** | `toggleMeta` | ❌ | **Nenhuma tela atual conclui meta que não seja bateria.** Nenhuma action escreve em `goals`: as únicas RPCs chamadas pela web são `start_quiz_session`, `finish_quiz_session`, `record_quiz_session_time` e `apply_study_plan_batch` |
| Registro de meta com tempo, questões, acertos e observação | `#registro-modal`, `salvarRegistroMeta` | 🟡 | A v3 registra só minutos, e só para bateria (`RegisterTimeForm`). Questões e acertos hoje vêm do ledger, o que é correto — o que falta é o registro manual da meta de teoria |
| Marcar meta como pendente de novo | `desfazerRegistroMeta` | ❌ | — |
| Estudo extra (Lei seca, Anki, Simulado, Revisão, Questões extras) | `#extra-modal`, `salvarEstudoExtra` | ❌ | O enum `goal_type` já tem `extra_study` e o seed cria uma meta desse tipo; não há tela que a registre ou conclua |
| Excluir meta | `deleteMeta` | ❌ | — |
| Apagar metas filtradas / apagar todas | `deleteFilteredMetas`, `deleteAllMetas` | 🚫 | Apagar meta é decisão de planejamento; na v3 isso é dos modos `replace`/`replan` do professor (F-PROF-07) |

> A lacuna de "concluir meta de teoria" é a mais visível do lote: o seed cria
> duas metas de teoria por semana e o aluno não tem como fechá-las. É também a
> razão de o número de "metas concluídas" na ficha do professor só se mover
> quando há bateria.

---

## 3. Aluno — bateria inteligente

| Fluxo v2 | Onde estava | Situação | Observação |
|---|---|---|---|
| Iniciar / continuar bateria a partir da meta | `iniciarBateriaMeta` (aluno.js:5352) | ✅ | F-BAT-01, `StartQuizButton` |
| Uma bateria aberta por vez | `#troca-bateria-modal`, `escolherAcaoBateriaAberta` | 🟡 | A v3 garante pelo índice `open_quiz_session_uidx` e oferece "Continuar no TEC" e "Cancelar bateria" (F-BAT-02). O que não existe é o atalho da v2 — **cancelar a atual e já iniciar a nova** em um passo |
| Retorno do TEC e gravação do resultado | `processarRetornoBoraExtensao` (aluno.js:5381) | ✅ | F-BAT-09 a 12. A v3 é estritamente melhor: idempotência por `request_id`, hash preservada em caso de falha, versão de protocolo validada |
| Registrar tempo para concluir | `salvarRegistroMeta` | ✅ | F-BAT-13, aceita `80` e `1:20` |
| Cancelar bateria pelo site | — | ✅ | F-BAT-15. Na v2 o cancelamento saía do modal de troca |
| **Bateria livre por bloco**, fora da meta da semana | `htmlAcaoBateriaLivre` (aluno.js:1496) | ❌ | Na v3 toda bateria nasce de uma meta: `startQuizSession` recusa meta que não seja `question_block` |

---

## 4. Aluno — reforço e revisão

| Fluxo v2 | Onde estava | Situação | Observação |
|---|---|---|---|
| Ciclo de reforço: 3 baterias válidas, abaixo de 80% libera | `getBoraCiclosSmartReforco` (aluno.js:5481) | ✅ | Mesma regra, agora no banco (`vw_block_performance`) e exibida em `/aluno/revisoes` e `/professor/revisoes` (F-PROF-09) |
| Ver erros acumulados do bloco | `abrirErrosBloco` | ✅ | `/aluno/revisoes?bloco=<uuid>`, F-ALU-03 |
| **Fazer o reforço** (abrir bateria só com os erros) | `iniciarReforcoCicloSmart` | 🟡 | `record_reinforcement` existe no banco, com `reinforcements`/`reinforcement_sessions`/`reinforcement_questions`; **nenhuma tela a chama**. A tela atual recomenda, não executa |
| Criar caderno de erros no TEC | `criarCadernoErrosBloco` | ❌ | — |
| Agendar reforço como meta futura | `agendarReforco` | ❌ | — |
| Ignorar reforço sugerido | `ignorarReforco` | ❌ | — |
| Cancelar reforço já agendado | `cancelarReforcoDoRegistro` | ❌ | — |
| **Revisão espaçada** dos cadernos TEC e PDFs | `p-controleRevisoes` inteiro | ❌ | Grade por matéria, espaçamento configurável, 1ª e 2ª revisão, ações rápidas ("Selecionar 6 básicas", "Selecionar matérias do ciclo atual"). A tabela `review_cycles` existe e `/aluno/revisoes` só conta ciclos; a grade não foi reconstruída |

> Vale separar dois conceitos que a v2 já mantinha separados e a v3 fundiu numa
> rota só: **reforço** é reação a desempenho baixo; **revisão espaçada** é
> calendário de releitura. Hoje `/aluno/revisoes` é só o primeiro.

---

## 5. Aluno — conteúdo e análise

| Fluxo v2 | Onde estava | Situação | Observação |
|---|---|---|---|
| Listar disciplinas com blocos e % por bloco | `renderDiscList` | ✅ | `/aluno/disciplinas` |
| Cadastrar disciplina e blocos | `salvarDisc`, `addBloco` | 🚫 | Escrita de planejamento é do professor |
| Gerar metas do próprio ciclo semanal | `p-metas`, `gerarCicloSemanal` | 🚫 | Idem. É o fluxo do professor (F-PROF-04) |
| Listar cadernos TEC por disciplina, com PDFs | `renderAulas` | ✅ | `/aluno/cadernos` |
| Marcar teoria/PDF e caderno TEC como feitos | `toggleAula` | ❌ | Sem escrita equivalente |
| Buscar caderno/PDF e "Aplicar ordem TEC" | `#aulas-search`, `aplicarOrdemTECDosCadernos` | ❌ | — |
| Estatísticas: desempenho, tempo de estudo, gráficos | `renderEstatisticas`, `renderTempoEstudoStats` | 🟡 | A v3 tem desempenho oficial, aproveitamento total e blocos × desempenho. Não tem: **tempo de estudo** por dia/mês, série por semana, radar por disciplina, filtros de histórico por plano e por ano |
| Compartilhar post de tempo de estudo | `gerarPostTempoEstudoCanvas` (aluno.js:957) | ❌ | Canvas + `navigator.share` |
| Meus dados e Lista de espera | `p-meusDados`, `p-listaEspera` | ✅ | F-ALU-04/05. Nascimento e fuso, que na v2 ficavam em Meus dados, na v3 estão na lista de espera |
| Bloqueio de acesso sem planejamento ativo | `aplicarRestricaoAcessoAluno` (aluno.js:558) | ✅ | F-ALU-07. A v3 barra no loader, não só na navegação |

---

## 6. Professor — alunos e acesso

| Fluxo v2 | Onde estava | Situação | Observação |
|---|---|---|---|
| Lista de alunos vinculados | `renderMeusAlunos` | ✅ | `/professor`, F-PROF-02 |
| Cards com KPIs, barra de progresso e classificação (Em ritmo / Atenção / Atrasado) | `renderCardAlunoHTML` (professor.js:4005) | 🟡 | A v3 mostra tabela com contato, planejamento ativo e badge de acesso; sem KPI nem classificação |
| Busca por nome/concurso e filtros por status e por plano | `filtrarAlunos` | ❌ | — |
| Ficha individual do aluno | `verDetalhesAluno` | ✅ | `/professor/alunos/:studentId`, F-PROF-03 |
| Estatísticas do aluno | `verEstatAluno` | ✅ | Cartões na ficha e em `/professor/estatisticas` |
| Histórico de baterias do aluno | `abrirBateriasAluno` | ❌ | — |
| **Anular bateria** | `anularBateriaAluno` | ❌ | `void_quiz_session` existe no banco e ninguém chama |
| Dificuldades por tópico | `abrirDificuldadesAluno` | ❌ | O catálogo tem tópico por questão (`catalog_questions`); falta a agregação e a tela |
| **Liberar acesso por 3 meses** | `liberarAlunoAcesso` | ❌ | RLS e grant já permitem ao professor escrever em `subscriptions`; falta a tela |
| **Bloquear acesso** | `bloquearAlunoAcesso` | ❌ | Idem |

---

## 7. Professor — planejamento

| Fluxo v2 | Onde estava | Situação | Observação |
|---|---|---|---|
| Gerar metas da semana para o aluno | `salvarMetasAlunoSupabase` | ✅ | `/professor/metas`, F-PROF-04 a 07. A v3 é melhor: lote idempotente por `study_plan_batches`, modos `append`/`replace`/`replan`, `day_order` calculado no banco |
| Distribuição por matéria com prévia antes de salvar | `gerarPreviaMetasTeoriaAluno`, `linhasDistribuicaoMetaHtml` | 🟡 | A v3 gera direto a partir dos blocos marcados; não há passo de prévia nem peso por matéria |
| Copiar semana anterior | `copiarSemanaAnterior` (professor.js:5234) | ❌ | — |
| **Criar planejamento** e cadastrar blocos | `salvarNovoPlanejamentoAluno` | ❌ | `study_plans` e `study_plan_blocks` só nascem no seed |
| **Substituir / ativar planejamento** | `abrirNovoPlanejamentoAluno` | ❌ | `activate_study_plan` existe e ninguém chama |
| Editar, arquivar e excluir planejamento | `abrirAlterarPlanejamentoAluno` | ❌ | `/professor/planejamentos` só lista |
| Limpar metas pendentes do planejamento / de todos | `zerarMetasPlanejamentoSelecionadoAluno`, `zerarTodasMetasAluno` | ❌ | Parcialmente coberto pelos modos `replace`/`replan` |
| Gerenciar cadernos: ativar, desativar, editar, incluir, excluir, restaurar | `p-cadernos` inteiro | ❌ | `/professor/cadernos` só lista blocos, F-PROF-08 |
| Cadastrar disciplina teórica e PDFs | `p-disciplinas` do professor | ❌ | — |

> Esta seção explica o item do `TODO` na raiz ("ver por que o prof n pode fazer
> nada"): das telas do professor, **só `/professor/metas` escreve**. Todas as
> outras são leitura.

---

## 8. Professor — acompanhamento

| Fluxo v2 | Onde estava | Situação | Observação |
|---|---|---|---|
| Reforços sugeridos por aluno | `abrirReforcosAluno` | ✅ | `/professor/revisoes`, F-PROF-09 |
| Agendar reforço para o aluno | `agendarReforcoAlunoSupabase` | ❌ | — |
| Controle manual de revisões (grade espaçada) | `p-controleRevisoes` do professor | ❌ | Mesma lacuna do lado do aluno |
| Cadernos TEC por disciplina | `renderAulas` do professor | 🟡 | Existe como lista em `/professor/cadernos`, sem marcação de progresso |
| Estatísticas gerais | `renderEstatisticas` | 🟡 | Sem tempo de estudo nem série temporal |
| Editar os próprios dados como professor | `salvarMeusDadosAluno` (compartilhado) | ❌ | `updateProfile` exige `requireRole("student")` |

---

## 9. Extensão

| Fluxo v2 (1.0.4) | Situação | Observação |
|---|---|---|
| Importa o payload da URL e monta a fila | ✅ | `parseStartHash`, F-BAT-01/03 |
| Seleção balanceada: inédita → mais erros → vista há mais tempo → menos vezes | ✅ | `pickQuestions`, determinística e testada em `engine.test.ts` (F-BAT-04) |
| Painel com progresso e navegação pela fila | ✅ | `#bora-panel`, F-BAT-05 |
| Detecção de acerto/erro por visibilidade no TEC | ✅ | F-BAT-06, com a guarda de abertura do F-BAT-07 |
| Finalização antecipada | ✅ | "Finalizar agora" |
| Cancelamento seguro | ✅ | F-BAT-16 |
| **Fase de reforço correlato e rodada extra** | ❌ | `QuestionPhase` no protocolo já tem `"reinforcement"` e `"extra"`; o content script só conduz `"main"` |
| Resumo por tópicos ao final | ❌ | Dependia do catálogo local `data/*.json`, que a v3 tirou da extensão de propósito — a extensão nunca fala com o Supabase |
| Painel arrastável, posição persistida | ❌ | `PANEL_POS_KEY` na v2; o painel atual é `position:fixed` |
| — | ✅ | **Ganho da v3:** as três ordenações passaram a ser garantidas e testadas (persistir antes de limpar a hash, aguardar a gravação antes de navegar, `request_id` gerado uma vez na origem) |

---

## 10. O que a versão atual tem e a v2 não tinha

Não é uma lista de telas, e é o motivo de a reescrita valer a pena:

- **Fronteira de escrita no banco.** Execução (`quiz_sessions`, ledger,
  `reinforcements`, `review_cycles`) só muda por RPC. Na v2 o navegador fazia
  `PATCH` direto em metas (`patchMetaAlunoDiretoSupabase`, aluno.js:4899) e até
  `DELETE` (`deletarMetaAlunoDiretoSupabase`).
- **Idempotência por `request_id`** em toda RPC mutante com payload. Na v2 o
  reenvio de um resultado era um `upsert` torcendo para dar certo.
- **Ledger append-only como fonte única de desempenho.** A v2 mantinha
  contadores por bloco no `localStorage` e no banco ao mesmo tempo
  (`aplicarMetaNoBloco`, `updateBlocoStats`) — três caminhos escrevendo o mesmo
  número.
- **Protocolo versionado num pacote só** (`packages/protocol`), com
  `PROTOCOL_VERSION` verificado nas duas pontas. Na v2 cada lado tinha sua
  cópia das formas (`b64urlEncodeObj` duplicado em `aluno.js` e `content.js`).
- **Isolamento entre alunos provado** (§5 de `fluxos-e2e.md`), com RLS,
  `GRANT UPDATE` por coluna e nenhum `DELETE` concedido.
- **Suíte de testes:** 59 invariantes de banco, 142 testes e2e em Chromium.
  A v2 não tinha teste automatizado.
- **404 de verdade** para recurso de outro professor (F-PROF-03).
- **Sem dado de domínio em texto livre.** A v2 codificava `TIPO_REFORCO:1` e o
  resultado da bateria em base64 dentro do campo de observação
  (`extrairReforcoOrigemId`, `extrairBateriaMarcador`).

---

## 11. O que não deve voltar

Três fluxos da v2 quebram a regra do `CLAUDE.md` de que a fronteira da escrita
fica entre planejar e executar:

1. **Aluno cadastrando disciplina e bloco** (`salvarDisc`, `addBloco` em
   `aluno.js`) — `study_plan_blocks` é escrita do professor.
2. **Aluno gerando o próprio ciclo semanal de metas** (`gerarCicloSemanal`,
   `gerarMetas` em `aluno.js`) — é o fluxo F-PROF-04.
3. **Aluno apagando metas** (`deleteFilteredMetas`, `deleteAllMetas`) — remover
   é decisão de replanejamento, e mesmo do lado do professor é `deleted_at`,
   nunca `DELETE`.

Se algum deles tiver de existir por necessidade de produto, entra como RPC com
a autorização explícita, não como afrouxamento de grant.

---

## 12. Ordem sugerida para fechar as lacunas

Critério: primeiro o que trava o uso real hoje, depois o que devolve autonomia
ao professor, por último o que é conforto.

**Bloqueia o uso hoje**

1. **Concluir meta de teoria e registrar estudo extra** (§2). Sem isso, três das
   cinco metas semanais do seed (2 de teoria e 1 de estudo extra) são
   impossíveis de fechar.
2. **Vincular aluno a professor e liberar acesso** (§6). Quem se cadastra hoje
   fica na lista de espera para sempre — é o mesmo ponto do BUG-07 e do §7 de
   `fluxos-e2e.md`.
3. **Criar e ativar planejamento, cadastrar blocos** (§7). Fora do seed, um
   professor novo não tem por onde começar.

**Devolve autonomia ao professor**

4. Gerenciar cadernos: ativar/desativar bloco sem mexer nas metas concluídas.
5. Editar, arquivar e excluir planejamento.
6. Anular bateria (`void_quiz_session` já existe).
7. Suspender acesso.

**Fecha o ciclo de estudo**

8. Executar o reforço (`record_reinforcement` já existe) e conduzir as fases
   `reinforcement`/`extra` no content script — as duas metades do mesmo fluxo.
9. Revisão espaçada como conceito separado do reforço (§4).
10. Caderno de erros no TEC.

**Conforto**

11. Tempo de estudo e séries temporais nas estatísticas.
12. Busca e filtros na lista de alunos.
13. Hero da semana com sequência de dias.
14. Tema claro/escuro; compartilhamento do post; painel arrastável.
