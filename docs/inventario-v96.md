# Inventário da v96 — o que a versão anterior fazia

Levantamento do pacote que está em produção hoje: o site
`BORA_ESTUDAR_v96_PCPR_RETA_FINAL` (HTML/CSS + 14.168 linhas de JS em
`assets/js/pages/{index,aluno,professor}.js`), a extensão
`BORA_ESTUDAR_EXTENSAO_v1.0.7_PCPR_RETA_FINAL` (`content.js`, `popup.js`), as
migrations `supabase/0*.sql` (012 a 020), os catálogos de `data/` e os
changelogs `docs/ALTERACOES_v8*.md` / `docs/ALTERACOES_v9*.md`.

**Este documento complementa [`comparativo-fluxos-v2.md`](comparativo-fluxos-v2.md),
não o substitui.** Aquele confrontou a v2 (extensão 1.0.4) com a versão atual e
continua valendo como retrato do que foi reconstruído melhor (§10) e do que não
deve voltar (§11). Aqui a fonte é a **v96 com a extensão 1.0.7** — quatorze
versões mais nova —, e o recorte é outro: **o que aquele código faz e ainda não
existe aqui**, com a prova de onde cada comportamento mora.

Onde o comparativo e este documento discordam sobre a situação de um fluxo,
**vale este**: ele foi levantado contra o código mais novo.

---

## Legenda

| | Significado |
|---|---|
| ✅ | Existe na versão atual, com cobertura equivalente ou melhor |
| 🟡 | Existe em parte — a tela abre, mas alguma ação do fluxo não está lá |
| ❌ | Não existe na versão atual |
| 🚫 | Existia e **não deve** voltar como estava — viola a fronteira de escrita do `CLAUDE.md` |

A coluna **Spec** fica vazia até a spec existir. A coluna **Estado** é o ledger
desta sessão: `pendente` → `especificada` → `implementada` → `bloqueada: <motivo>`.

---

## Quadro-resumo

| Área | Fluxos na v96 | ✅ | 🟡 | ❌ | 🚫 |
|---|---:|---:|---:|---:|---:|
| 1. Autenticação e conta | 12 | 7 | 2 | 3 | 0 |
| 2. Aluno — metas e execução | 12 | 7 | 2 | 0 | 3 |
| 3. Aluno — bateria inteligente | 9 | 7 | 1 | 1 | 0 |
| 4. Aluno — reforço e revisão | 10 | 6 | 0 | 4 | 0 |
| 5. Aluno — conteúdo e análise | 12 | 4 | 2 | 5 | 1 |
| 6. Professor — alunos e acesso | 12 | 12 | 0 | 0 | 0 |
| 7. Professor — planejamento | 10 | 7 | 1 | 2 | 0 |
| 8. Professor — geração de metas | 9 | 6 | 1 | 2 | 0 |
| 9. Professor — acompanhamento | 8 | 2 | 2 | 4 | 0 |
| 10. Extensão | 12 | 10 | 0 | 2 | 0 |
| **Total** | **106** | **68** | **11** | **23** | **4** |

Em uma frase: a versão atual reconstruiu **a espinha do produto e o banco
inteiro** — a máquina de estados da bateria da v96 está implementada linha por
linha, incluindo a finalização antecipada da v89 e a bijeção do reforço da v82 —
e ainda não reconstruiu **a periferia de gestão e o ciclo de reforço executável**,
que na v96 eram feitos por escrita direta do navegador.

**O achado que mais muda o plano:** várias lacunas do
`comparativo-fluxos-v2.md` §12 são de **tela**, não de banco. `activate_study_plan`,
`void_quiz_session` e `record_reinforcement` estão prontas e testadas, e
`finish_quiz_session` já impõe as três regras da v89. Isso torna as specs
correspondentes pequenas e sem migration.

---

## Como ler a coluna "Onde está no código v96"

`aluno.js:2815` é `code-reference/BORA_ESTUDAR_v96_PCPR_RETA_FINAL/assets/js/pages/aluno.js`,
linha 2815. `content.js:504` é a extensão. `013:247` é
`code-reference/BORA_ESTUDAR_v96_PCPR_RETA_FINAL/supabase/013_v82_anular_bateria_ordem_livre.sql`,
linha 247.

---

## 1. Autenticação e conta

| Fluxo v96 | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| Boas-vindas → entrar ou criar conta | `mostrarAuthView` index.js:1996 | ✅ | 01 | — |
| Login e-mail + senha | `initLoginSupabase` index.js:2353 | ✅ | 01 | — |
| Cadastro público de aluno | `cadastrarAlunoSupabase` index.js:2091 | ✅ | 01 | — |
| Recuperar senha, com resposta neutra | `recuperarSenhaSupabase` index.js:2061 | ✅ | 01 | — |
| Redefinir senha pelo link | `salvarNovaSenhaSupabase` index.js:2298 | ✅ | 01 | — |
| Roteamento por perfil | `destinoPorPerfil` index.js:2195 | ✅ | 01 | — |
| Tema claro e escuro | `toggleTheme` index.js:1945 | ✅ | 11 | — |
| **Entrar com Google (OAuth)** | `iniciarLoginGoogle` index.js:2029 | ❌ | | pendente |
| **Mostrar/ocultar a senha digitada** | `alternarVisibilidadeSenha` index.js:2008 | ❌ | | pendente |
| Cupom de acesso concede 3 meses | `dadosCupomAcesso` aluno.js:3905, `CUPONS_ACESSO_TESTE` | 🟡 | | pendente |
| Vínculo automático ao professor padrão no cadastro | `garantirPerfilNovoAluno` index.js:2045 (`PROFESSOR_PADRAO_ID`) | 🟡 | | pendente |
| **Sidebar recolhível, estado persistido** | `toggleSidebar` index.js:261 | ❌ | | pendente |

**A tabela `coupons` existe no schema atual e nenhuma tela a lê ou escreve.** Na
v96 o cupom era aplicado por **upsert direto em `profiles` a partir do
navegador**, gravando `status_acesso:'ativo'` e `plano_expira_em` — só a RLS
separava um aluno de liberar o próprio acesso. Aqui a liberação é `subscriptions`,
escrita do professor; se o cupom voltar, é como RPC que valida o código e cria a
assinatura, nunca como escrita do aluno.

**Duas funções da v96 nunca eram chamadas**: `acessoAlunoLiberado` e
`mensagemAcessoAluno` (index.js:2072/2084). O roteamento mandava para
`aluno.html` **sem checar `status_acesso` nem expiração** — o gate de plano era
código morto. A versão atual barra no loader com `requireStudentAccess`.

---

## 2. Aluno — metas e execução

| Fluxo v96 | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| Painel da semana agrupado por dia | `renderDashWeek` aluno.js:1406 | ✅ | 03 | — |
| Seletor de semana | `#dash-sem-sel` aluno.js:1359 | ✅ | 03 | — |
| **Concluir meta de teoria** (sem exigir questões) | `salvarRegistroMeta` aluno.js:2815, ramo :2824 | ✅ | 12 | implementada |
| **Concluir meta de estudo extra planejada pelo professor** | idem | ✅ | 12 | implementada |
| **Registrar estudo extra avulso** (7 tipos fechados) | `salvarEstudoExtra` aluno.js:2367 | ✅ | 19 | implementada |
| **Editar e excluir estudo extra** | `excluirEstudoExtra` aluno.js:2503 | ✅ | 19 | implementada |
| **Desfazer conclusão / voltar a pendente** | `desfazerRegistroMeta` aluno.js:2907 | ✅ | 12 | implementada |
| Tempo aceito em `80`, `1:20`, `1h20`, `40min` | `interpretarTempoRegistro` aluno.js:2717 | 🟡 | 05 | — |
| Abas Metas / Reforços no painel | `ensureDashboardTabs` aluno.js:1297 | 🟡 | | pendente |
| Aluno apaga metas filtradas / todas | `deleteFilteredMetas` aluno.js:1604 | 🚫 | — | — |
| Aluno gera o próprio ciclo semanal | `gerarCicloSemanal` aluno.js:2161 | 🚫 | — | — |
| Aluno cadastra disciplina e blocos | `salvarDisc` aluno.js:1467 | 🚫 | — | — |

**Era a lacuna que travava o uso real, e foi a primeira fechada.** O seed cria 5
metas por semana: 2 de teoria, 2 de bateria e 1 de estudo extra. Só as 2 de
bateria tinham como ser fechadas — as outras 3 não tinham caminho nenhum, porque
nenhuma action da web escrevia em `goals`. A spec
[12](specs/12-conclusao-de-meta.md) resolveu com `complete_goal` e `reopen_goal`,
**sem conceder grant nenhum ao aluno na tabela**.

**Divergência de número que continua aberta:** meta sem bateria adotou o teto da
v96, **1–240 minutos**, na constraint `goal_spent_minutes_range`;
`record_quiz_session_time` continua aceitando **1440** para bateria. Está
registrado em `R-CONC-10` como suposição para revisão humana — alinhar os dois é
mudança na spec 05.

**`goals.extra_activity` era `text`, e virou enum na spec 19.** A v96 tem
exatamente **sete** tipos — Lei seca, Anki, Simulado, Revisão, Questões extras,
Videoaula, Outro (`aluno.html:1067`) —, agora `extra_activity_kind` com os
identificadores em inglês e o rótulo em português na tela.

**A v96 nunca deixava desfazer uma bateria concluída** (`aluno.js:2915`): o
resultado é imutável, "correções administrativas em fluxo próprio" — que é
`anular_bateria`, do professor. Desfazer vale só para meta sem bateria.

---

## 3. Aluno — bateria inteligente

| Fluxo v96 | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| Iniciar / continuar bateria a partir da meta | `iniciarBateriaMeta` aluno.js:5422 | ✅ | 05 | — |
| Ordem livre: qualquer meta pendente inicia | `iniciar_bateria` 013:133 | ✅ | 05 | — |
| Retorno do TEC e gravação idempotente | `processarRetornoBoraExtensao` aluno.js:5451 | ✅ | 05 | — |
| Registrar tempo para concluir | `salvarRegistroMeta` ramo :2825 | ✅ | 05 | — |
| Cancelar bateria | `cancelarBateriaAbertaParaTroca` aluno.js:5355 | ✅ | 05 | — |
| Finalização antecipada: 1 a 15 principais | 017:103, changelog v89 | ✅ | 05 | — |
| Extras em blocos de 5, e só após todas as principais | 017:120, `mod(extras,5)=0` | ✅ | 05 | — |
| **Trocar de bateria em um passo** (cancelar a atual e já iniciar a nova) | `escolherAcaoBateriaAberta` aluno.js:5296 | 🟡 | | pendente |
| **Bateria livre por bloco**, fora da meta da semana | `htmlAcaoBateriaLivre` aluno.js:1525 | ❌ | | pendente |

A máquina de estados da v96 (`013:43`, `017:10`) e a daqui são **a mesma**:
cinco estados, os mesmos marcos temporais por estado, e os dois índices parciais
que fazem cancelada e anulada não consumirem o número visível do bloco nem o
slot da meta. Nada a reconstruir.

---

## 4. Aluno — reforço e revisão

A v96 chama três coisas diferentes de "reforço". **Separá-las é o achado mais
importante deste inventário**, porque o §12 item 8 as trata como uma só.

| # | Nome | O que é | Onde |
|---|---|---|---|
| 1 | **Correlato intra-bateria** | A cada erro, 1 questão do **mesmo tópico** entra no fim da fila. Automático, sem botão. Profundidade máxima 2. | `pickReinforcement` content.js:261 |
| 2 | **Rodada extra de +5** | Ao terminar a fila, o aluno pode pedir mais 5 do bloco. Tudo ou nada. Rodadas sem teto. | `appendExtraRound` content.js:280 |
| 3 | **Reforço do ciclo de 3 baterias** | Sessão inteira e separada, só com as erradas únicas das 3 baterias. Libera abaixo de 80%. | `importReviewPayloadFromUrl` content.js:359 |

| Fluxo v96 | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| Ciclo de 3 baterias, abaixo de 80% libera | `getBoraCiclosSmartReforco` aluno.js:5558 | ✅ | 09 | — |
| Ver erros acumulados do bloco | `abrirErrosBloco` aluno.js:5667 | ✅ | 09 | — |
| Caderno de erros reúne as três fases | `obterErrosBloco` aluno.js:5509 | ✅ | 08 | — |
| **Prioridade alta abaixo de 75%** | aluno.js:5590, badge :3800 | ✅ | 20 | implementada |
| **Executar o reforço do ciclo** (site) | `iniciarReforcoCicloSmart` aluno.js:5658 | ✅ | 20 | implementada |
| **Conduzir as fases `reinforcement` e `extra`** (extensão) | content.js:261 e :280 | ✅ | 21 | implementada |
| **Agendar reforço como meta futura** | `agendarReforco` aluno.js:2003 | ❌ | | pendente |
| **Ignorar reforço sugerido** | `ignorarReforco` aluno.js:1986 | ❌ | | pendente |
| **Cancelar reforço já agendado** | `cancelarReforcoDoRegistro` aluno.js:2668 | ❌ | | pendente |
| **Grade de revisão espaçada** (1ª e 2ª revisão por caderno) | `renderControleRevisoes` aluno.js:3164 | ✅ | 24 | implementada |

**`record_reinforcement` já existe, já é idempotente e já exige a bijeção** —
o conjunto revisado tem de ser exatamente o conjunto de erradas únicas do ciclo,
nem mais nem menos (`013:498`, e aqui o `v_missing`). Falta a tela que a chame e
o content script que conduza as fases.

**A grade de revisão espaçada é `localStorage` puro na v96** — nada dela chega
ao banco, e trocar de navegador perdia tudo. As fórmulas são
`r1Idx = i − (r1 − 1)` e `r2Idx = i − (r1 + r2 − 1)`, contagem inclusiva
(aluno.js:3194). **Não há default de negócio**: do lado do professor,
`sugestaoEspacamentoRevisao` devolve sempre `{r1:0, r2:0, fonte:'Definido
manualmente pelo professor'}` (professor.js:1732). Os espaçamentos por matéria
que o `aluno.js` sugere (TI 8/16, RLM 6/10, …) são heurística de tela, não regra
do domínio. `review_cycles` guarda ciclo de reforço, que é outro conceito.

---

## 5. Aluno — conteúdo e análise

| Fluxo v96 | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| Disciplinas com blocos e % por bloco | `renderDiscList` aluno.js:1535 | ✅ | 08 | — |
| Cadernos TEC por disciplina | `renderAulas` aluno.js:3355 | ✅ | 08 | — |
| Desempenho oficial × aproveitamento total | changelog v93 | ✅ | 08 | — |
| Blocos × desempenho com composição P/E/R | `renderEstatisticas` aluno.js:3770 | ✅ | 08 | — |
| Ver tópicos do bloco antes de estudar | `htmlTopicosBloco` aluno.js:1514 | 🟡 | | pendente |
| Resumo por tópicos da bateria concluída | `resumoBateriaDb` aluno.js:4444 | 🟡 | | pendente |
| **Tempo de estudo por período** (hoje/semana/mês/ano/total) | `obterResumoTempoEstudo` aluno.js:924 | ❌ | | pendente |
| **Série de desempenho por semana** | `getWeeklyStats` aluno.js:3549 | ❌ | | pendente |
| **Radar por disciplina** (≥3 matérias) | `svgRadarDisciplinas` aluno.js:3679 | ❌ | | pendente |
| **Filtros de histórico por plano e por ano** | `carregarHistoricoEstatisticasAluno` aluno.js:777 | ❌ | | pendente |
| **Marcar teoria/PDF e caderno TEC como feitos** | `toggleAula` aluno.js:3494 | ❌ | | pendente |
| Aluno cadastra e edita disciplina | `salvarDisc` aluno.js:1467 | 🚫 | — | — |

**O tópico da questão já está no banco desta versão** — `catalog_questions.topic`
e `quiz_session_questions.topic` — então o resumo por tópicos não precisa do
JSON de 1,97 MB que a v96 baixava. A extensão daqui não carrega catálogo de
propósito.

**"Compartilhar post de tempo de estudo"** (`gerarPostTempoEstudoCanvas`
aluno.js:986, canvas 1080×1350) fica fora da fila: é conforto, e depende de
`navigator.share`, que não existe em todo navegador.

---

## 6. Professor — alunos e acesso

`professor.js` implementa **dois sistemas paralelos que não conversam**. O
"mundo local" (`discs`/`metas`/`aulas`, gravados só em `localStorage`) é o
cronograma **pessoal do próprio professor**, semeado com 127 blocos fiscais e
352 cadernos TEC fixos — não é comportamento de produto, e o painel `p-metas`
dele é inclusive inalcançável, porque `nav()` reescreve `'metas'` para
`'montarMetas'` (professor.js:394). **Só o mundo Supabase entra neste
inventário.**

| Fluxo v96 | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| Lista de alunos vinculados | `renderMeusAlunos` professor.js:3551 | ✅ | 03 | — |
| Ficha individual do aluno | `verDetalhesAluno` professor.js:4220 | ✅ | 03 | — |
| Estatísticas do aluno | `verEstatAluno` professor.js:4262 | ✅ | 08 | — |
| **Liberar acesso do aluno por 3 meses** | `liberarAlunoAcesso` professor.js:3992 | ✅ | 13 | implementada |
| **Bloquear acesso do aluno** | `bloquearAlunoAcesso` professor.js:4004 | ✅ | 13 | implementada |
| **Vincular aluno a professor** | não existe UI — só `PROFESSOR_PADRAO_ID` no cadastro | ✅ | 13 | implementada |
| **Badge de acesso com data de validade** | `badgeAcessoAluno` professor.js:4011 | ✅ | 13 | implementada |
| **Classificação Em ritmo / Atenção / Atrasado / Sem dados** | `classificarAluno` professor.js:3274 | ✅ | 17 | implementada |
| **KPIs no card do aluno** (desempenho, questões, metas, barra) | `renderCardAlunoHTML` professor.js:4019 | ✅ | 17 | implementada |
| **Resumo da turma** (4 métricas no topo) | `renderResumoAlunos` professor.js:3516 | ✅ | 17 | implementada |
| **Busca por nome e filtros por status e por plano** | `filtrarAlunos` professor.js:4096 | ✅ | 17 | implementada |
| **Histórico de baterias do aluno** | `abrirBateriasAluno` professor.js:3962 | ✅ | 16 | implementada |

**A v96 também não tinha tela para vincular aluno.** O vínculo nascia
exclusivamente no cadastro, amarrado ao UUID fixo
`d65a965f-0ccb-4a12-ac7b-858519d9df00` — que é o mesmo professor do seed daqui —
e a tela de estado vazio instruía o professor a **inserir `profiles.professor_id`
à mão no banco** (professor.js:4124). O GAP-01 é, portanto, **herdado**, não
introduzido pela reescrita.

**E aqui ele é mais apertado do que lá.** `profiles_read` é
`id = auth.uid() or is_teacher_of(id)` e `waitlist_own` é
`student_id = auth.uid() or is_teacher_of(student_id)`: um professor **não
enxerga** quem ainda não é aluno dele. Não existe caminho de leitura que permita
descobrir a pessoa a vincular — o que torna esse o primeiro problema a resolver,
e o único da fila que exige **policy nova**, não só tela.

**Os limiares da classificação, para a spec não inventá-los:** `sem-dados` sem
questões e sem metas; `atrasado` com progresso de metas **< 0,30**; `atencao`
com desempenho **< 70%** (havendo questões) **ou** progresso **< 0,55**;
`ritmo` no resto (professor.js:3274).

---

## 7. Professor — planejamento

| Fluxo v96 | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| **Criar planejamento a partir de curso-modelo** | `salvarNovoPlanejamentoAluno` professor.js:4365 | ✅ | 14 | implementada |
| **Ativar planejamento, arquivando o anterior** | idem, `.neq('id',planoId)` | ✅ | 14 | implementada |
| **Editar planejamento** | `salvarAlteracaoPlanejamentoAluno` professor.js:4539 | ❌ | | pendente |
| **Arquivar planejamento** | `arquivarPlanejamentoSelecionadoAluno` professor.js:4588 | ✅ | 14 | implementada |
| **Excluir planejamento sem histórico** | `excluirPlanejamentoSelecionadoAluno` professor.js:4718 | ❌ | | pendente |
| **Materializar os blocos do catálogo no planejamento** | `registrosModeloParaPlano` professor.js:2741 | ✅ | 14 | implementada |
| **Gerenciar cadernos: ativar, desativar, editar, incluir, excluir, restaurar** | `p-cadernos` professor.js:2863 | ✅ | 15 | implementada |
| **Ativar ou desativar a disciplina inteira** | `alternarMateriaCadernos` professor.js:3036 | ✅ | 15 | implementada |
| **Limpar metas pendentes do plano / de todos** | RPC `limpar_metas_pendentes_professor` 015:8 | 🟡 | 04 | — |
| `/professor/planejamentos` lista os planejamentos | — | ✅ (aqui) | 03 | — |

**`activate_study_plan` já existe, já arquiva o anterior na mesma transação e já
é protegida pelo índice `active_study_plan_uidx`.** Ninguém a chama. A troca
atômica que a v96 fazia com `UPDATE` em massa mais um fallback para `'pausado'`
quando a constraint reclamava (professor.js:4443) aqui é uma chamada de RPC.

**Uma regra da v96 que merece virar regra escrita:** planejamento **com estudo
realizado nunca é apagado**, só arquivado (professor.js:4733). Aqui isso já é
mais forte — `DELETE` não é concedido em tabela nenhuma —, mas a tela precisa
dizer isso ao professor em vez de deixar o banco recusar.

**`limpar_metas_pendentes_professor` está coberta pelos modos `replace` e
`replan`** de `apply_study_plan_batch`, e melhor: aqui é `deleted_at`, lá era
`DELETE` físico. A trava contra bateria aberta existe nos dois.

---

## 8. Professor — geração de metas da semana

| Fluxo v96 | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| Gerar metas da semana para o aluno | `salvarMetasAlunoSupabase` professor.js:5764 | ✅ | 04 | — |
| Modos substituir / replanejar tudo | `#am-substituir`, `#am-replanejar-tudo` | ✅ | 04 | — |
| Bateria aberta bloqueia replanejar a semana | professor.js:5873 | ✅ | 04 | — |
| **Prévia da semana antes de salvar** | `gerarPreviaMetasTeoriaAluno` professor.js:5558 | ✅ | 18 | implementada |
| **Distribuição por peso da matéria** (`contatosSemanais`) | `calcularDistribuicaoPadraoBlocos` professor.js:5006 | ✅ | 18 | implementada |
| **Rodízio de blocos B1→B2→…→Bn→B1** | `proximoBlocoParaMeta` professor.js:5544 | ✅ | 18 | implementada |
| **Repetição por prioridade de incidência** (3×, 2×, 1×) | `sequenciaPrioridadeBlocos` professor.js:5538 | ❌ | | pendente |
| **Copiar semana anterior** | `copiarSemanaAnterior` professor.js:5282 | ❌ | | pendente |
| Conferência "Soma X / Total" antes de salvar | `atualizarSomaMetasTeoriaAluno` professor.js:5461 | 🟡 | | pendente |

**Números que a spec vai precisar:** total de metas 1 a **80**; tempo por meta
**10 a 240**, default **60**; dias default de segunda a sexta; a soma por matéria
tem de bater **exatamente** com o total semanal, senão a prévia não gera
(professor.js:5558).

**A distribuição por peso é o que reproduz a planilha da Reta Final**:
`ideal = total × contatosSemanais / soma`, piso, mínimo 1 por matéria quando o
total comporta, e o resto pelo maior resto. No PCPR Reta Final a soma dos
`contatosSemanais` é **41**, que é exatamente `metas_semanais_padrao` do curso.

---

## 9. Professor — acompanhamento

| Fluxo v96 | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| Reforços sugeridos por aluno | `abrirReforcosAluno` professor.js:3736 | ✅ | 09 | — |
| **Anular bateria** | `anularBateriaAluno` professor.js:3979 | ✅ | 16 | implementada |
| **Dificuldades por tópico** | `abrirDificuldadesAluno` professor.js:3925 | ✅ | 23 | implementada |
| **Agendar reforço para o aluno** | `agendarReforcoAlunoSupabase` professor.js:3813 | ❌ | | pendente |
| Estatísticas gerais do professor | `renderEstatisticas` professor.js:2217 | 🟡 | 08 | — |
| **Tempo de estudo e sequência de dias** | `renderTempoEstudoStats` professor.js:644 | ❌ | | pendente |
| Controle manual de revisões | `renderControleRevisoes` professor.js:1792 | ✅ | 24 | implementada |
| **Editar os próprios dados como professor** | não existe na v96 | 🟡 | | pendente |

**`void_quiz_session` já existe e faz exatamente o que `anular_bateria` fazia**:
só o professor responsável, só bateria finalizada (`completed` ou
`awaiting_time`), idempotente, devolve a meta a `pending` e nunca apaga. Falta o
botão e o campo de motivo — a v96 usava `confirm` mais `prompt`, com
"Anulação administrativa" como texto padrão.

**Dificuldades por tópico, com os números da v96:** só baterias concluídas e só
`phase = 'main'`; agrupa por bloco e tópico; no máximo **60** linhas; um tópico é
**recorrente** quando errou em **≥ 2 baterias distintas**, senão é pontual.
`vw_block_errors` já entrega quase tudo, mas agrega por questão, não por tópico.

**Editar os próprios dados como professor também não existia na v96** —
confirma o GAP-03 como lacuna herdada. Aqui `updateProfile` exige
`requireRole("student")`, o que é uma linha.

---

## 10. Extensão

| Fluxo v96 (1.0.7) | Onde está no código v96 | Situação | Spec | Estado |
|---|---|---|---|---|
| Importa o payload da hash e monta a fila | `importPayloadFromUrl` content.js:415 | ✅ | 06 | — |
| Persiste antes de limpar a hash | content.js:410 | ✅ | 06 | — |
| Versão do protocolo verificada na leitura | content.js:421 | ✅ | 06 | — |
| Seleção: inédita → mais erros → mais antiga → menos vista | `candidateRank` content.js:190 | ✅ | 07 | — |
| Histórico do servidor sobrepõe o local | `mergedHistory` content.js:83 | ✅ | 06 | — |
| Guarda de questão já respondida | `armInitialGuard` content.js:811 | ✅ | 05 | — |
| Finalização antecipada e cancelamento | content.js:758 e :775 | ✅ | 05 | — |
| **Rodízio por tópico na seleção** (cobertura ascendente) | `selectBalanced` content.js:202 | ✅ | 22 | implementada |
| **Fase de reforço correlato** (1 do mesmo tópico por erro, profundidade 2) | `pickReinforcement` content.js:261 | ✅ | 21 | implementada |
| **Rodada extra de +5, tudo ou nada** | `appendExtraRound` content.js:280 | ✅ | 21 | implementada |
| **Resumo por tópicos no painel** | `topicSummary` content.js:542 | ❌ | | pendente |
| **Painel arrastável, posição persistida** | `PANEL_POS_KEY` content.js:530 | ❌ | | pendente |

**O rodízio por tópico é a "correlação de tópico" que
[`arquitetura.md`](arquitetura.md) lista como decisão pendente.** A v96 ordena os
tópicos por cobertura `(vistas + escolhidas) / total` ascendente, desempata por
menos escolhidas e depois por tópico maior. `pickQuestions` daqui ordena só por
questão, sem olhar tópico.

**Duas divergências da v96 que não devem ser reproduzidas.** O retorno do
reforço **regride para `v:1`** sob a chave antiga `boraResultado`, enquanto a ida
usa `v:2`/`boraReviewV2`. E `popup.js` **reimplementa** o payload de retorno sem
`resumoTopicos` nem `estatisticas` — exatamente a duplicação que
`packages/protocol` existe para impedir.

**Um limite conhecido, registrado no `LEIA-ME.txt` da 1.0.7:** o bloco
`pcpr26_leg_pcpr_bloco_07` tem só **5 questões únicas** e não fecha uma bateria
de 15 sem repetir. A extensão lança erro em vez de repetir.

---

## Fila

Ordenada pelo critério do §12 do comparativo: primeiro o que trava o uso real,
depois o que devolve autonomia ao professor, por último conforto. Dentro de cada
faixa, primeiro o que não tem dependência.

### Trava o uso real

| # | Feature | Por que aqui | Superfície prevista |
|---|---|---|---|
| ~~1~~ | **Conclusão de meta sem bateria** — spec [12](specs/12-conclusao-de-meta.md), **implementada** | 3 das 5 metas semanais do seed eram impossíveis de fechar | 2 RPCs (`complete_goal`, `reopen_goal`), 1 migration (`goals.spent_minutes`), site |
| ~~2~~ | **Vincular aluno e liberar acesso** — spec [13](specs/13-vinculo-e-liberacao-de-acesso.md), **implementada** | Quem se cadastra fica na lista de espera para sempre; e o professor não enxerga quem vincular | 1 RPC (`link_student`) mais o predicado `student_has_teacher`, 1 migration (policy da lista de espera), site |
| ~~3~~ | **Criar, ativar e arquivar planejamento** — spec [14](specs/14-gestao-do-planejamento.md), **implementada** | Fora do seed, um professor novo não tem por onde começar | 0 RPC nova (`activate_study_plan` existe), 0 migration, site |

O item 2 vem antes do 3 porque um planejamento exige um aluno vinculado; o 1 vem
antes dos dois porque não depende de nada e destrava o seed que já existe.

### Devolve autonomia ao professor

| # | Feature | Por que aqui | Superfície prevista |
|---|---|---|---|
| ~~4~~ | **Gerenciar blocos do planejamento** — spec [15](specs/15-cadernos-do-planejamento.md), **implementada** | Sem isso o planejamento nasce e não muda mais | 0 RPC, 0 migration, site |
| ~~5~~ | **Anular bateria e ver o histórico** — spec [16](specs/16-historico-e-anulacao-de-bateria.md), **implementada** | `void_quiz_session` pronta e sem chamador; e o professor não vê as baterias do aluno para apontar qual anular | 0 RPC, 0 migration, site |
| ~~6~~ | **Ficha da turma** — spec [17](specs/17-ficha-da-turma.md), **implementada** | O professor tem a lista, não tem o diagnóstico | 0 RPC, 0 migration, site |
| ~~7~~ | **Prévia e distribuição por peso na geração da semana** — spec [18](specs/18-previa-e-distribuicao-da-semana.md), **implementada** | Hoje o professor gera às cegas, e toda matéria pesa igual | 0 RPC, 0 migration, site |
| ~~8~~ | **Registrar estudo extra avulso** — spec [19](specs/19-estudo-extra-avulso.md), **implementada** | Separada pelo portão do Passo 4: seria a terceira RPC nova, e ela **cria** meta em vez de concluir. Vem depois da spec 12 porque a semana do professor já traz meta de estudo extra, e concluí-la é o que destrava o seed hoje | 1 RPC (`record_extra_study`), 1 migration (enum `extra_activity_kind`, 7 valores), site |

### Fecha o ciclo de estudo

| # | Feature | Por que aqui | Superfície prevista |
|---|---|---|---|
| ~~9~~ | **Executar o reforço do ciclo** (site) — spec [20](specs/20-execucao-do-reforco.md), **implementada** | `record_reinforcement` pronta e sem chamador: a tela recomenda e não executa | 0 RPC, 0 migration, site |
| ~~10~~ | **Conduzir `reinforcement` e `extra` no content script** — spec [21](specs/21-fases-na-extensao.md), **implementada** | A outra metade do item 9 — separada porque toca extensão e `PROTOCOL_VERSION` | protocolo + extensão |
| ~~11~~ | **Rodízio por tópico na seleção** — spec [22](specs/22-rodizio-por-topico.md), **implementada** | Decisão pendente registrada em `arquitetura.md` | extensão, função pura |
| ~~12~~ | **Dificuldades por tópico** — spec [23](specs/23-dificuldades-por-topico.md) ✅ | O professor vê o número, não vê a causa. O histórico de baterias saiu antes, na spec 16 | 0 RPC, 1 view, site |
| ~~13~~ | **Revisão espaçada** — spec [24](specs/24-revisao-espacada.md) ✅ | Grade por matéria, 1ª e 2ª revisão. Conceito separado do reforço | 1 migration, 1 RPC, site |

Os itens 9 e 10 são as duas metades do mesmo fluxo e estão separados **pelo portão
do Passo 4 da skill**: entregar junto significaria uma migration e um
`PROTOCOL_VERSION` no mesmo commit. O 9 vem primeiro porque a RPC já existe e o
site pode executar o reforço com a fila montada por ele mesmo; o 10 melhora a
condução dentro do TEC.

### Conforto

| # | Feature | Superfície prevista |
|---|---|---|
| 14 | Tempo de estudo, séries temporais e sequência de dias | site |
| 15 | Resumo por tópicos da bateria concluída | site |
| 16 | Professor edita os próprios dados | site |
| 17 | Painel arrastável na extensão | extensão |
| 18 | Sidebar recolhível; mostrar/ocultar senha | site |
| 19 | Login com Google | site, exige configuração de provedor |
| 20 | Cupom de acesso | 1 RPC, site |
| 21 | Bateria livre por bloco, fora da meta | 1 RPC, site |

---

## Fora de escopo desta reconstrução

O que a v96 fazia e **não** volta, com o motivo. Cada linha vira "Fora de
escopo" da spec vizinha quando ela for escrita.

- **Aluno apagando metas, gerando o próprio ciclo e cadastrando disciplina.**
  São os três 🚫 do §11 do comparativo. Planejar é do professor.
- **Cupom aplicado por escrita direta do navegador em `profiles`.** Liberar
  acesso é escrita de `subscriptions`, do professor, ou RPC que valida o código.
- **Catálogo de tópicos empacotado na extensão** (1,97 MB, 126 blocos). O tópico
  vive em `catalog_questions.topic` e viaja no ledger. A extensão não fala com o
  Supabase.
- **`localStorage` como fonte da verdade** de contadores de bloco, tópicos da
  bateria e grade de revisão. O ledger é a fonte única.
- **Reescrever função por substituição de string** sobre `pg_get_functiondef`,
  como a migration 017 faz. Migration aqui é declarativa.
- **Payload de retorno reimplementado no `popup.js`.** Uma definição só, em
  `packages/protocol`.
- **O "mundo local" do `professor.js`** — cronograma pessoal do professor em
  `localStorage`, com 127 blocos e 352 cadernos fixos no bundle. Não é produto.
- **Compartilhar post de tempo de estudo em canvas.** Conforto que depende de
  `navigator.share`.

---

## Bloqueios

Nenhum até agora.
