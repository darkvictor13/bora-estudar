# Specs

Uma spec por feature. Descrevem **o que o sistema faz e por quê** — não como o
código está organizado, que é assunto de [`../arquitetura.md`](../arquitetura.md).

As dez primeiras foram escritas a partir do código já implantado: são o
retrato do que existe hoje, não um plano. Da 11 em diante a ordem se inverte —
a spec vem antes do código, é commitada sozinha, e os ids de teste nascem com
ela. Servem a três coisas — dar um lugar
para a regra morar quando ela não cabe num comentário, permitir revisar
comportamento sem ler SQL, e ser o molde das specs das features que faltam.

**As specs da extensão continuam aqui, e não valem como descrição do sistema.**
A extensão foi removida. Descrevem, no todo, um caminho de execução que não
existe mais: **05, 06, 07, 21, 22, 28 e 31**. Outras — 09, 12, 16, 20, 23, 24 e
26 — a citam de passagem, e o que dizem do banco continua valendo. Todas ficam
como registro do que foi decidido e por quê, que é o material de partida de quem
for desenhar a execução nova.

O que **não** existe está catalogado em
[`../comparativo-fluxos-v2.md`](../comparativo-fluxos-v2.md) §12 e, contra a
versão v96 do produto, em [`../inventario-v96.md`](../inventario-v96.md) — que
traz a fila de reconstrução e é onde o estado de cada item é mantido. Cada item
de lá vira uma spec nova antes de virar código.

---

## Índice

| # | Spec | Cobre |
|---|---|---|
| 01 | [Autenticação](01-autenticacao.md) | Cadastro, login, logout, recuperação de senha, guardas por papel |
| 02 | [Acesso e assinatura](02-acesso-e-assinatura.md) | Quem entra nas telas de estudo, e o que vê quem ainda não pode |
| 03 | [Planejamento e metas](03-planejamento-e-metas.md) | `study_plans`, blocos, metas e as invariantes que o banco impõe |
| 04 | [Geração da semana](04-geracao-semanal.md) | O professor monta a semana do aluno; lote idempotente |
| 05 | [Bateria inteligente](05-bateria-inteligente.md) | A volta completa: site → extensão → TEC → site → meta concluída — **fluxo da extensão, removido** |
| 06 | [Protocolo site ↔ extensão](06-protocolo-site-extensao.md) | Envelope versionado que trafega no fragmento da URL — **fluxo da extensão, removido** |
| 07 | [Motor de seleção](07-motor-de-selecao.md) | Quais 15 questões a bateria escolhe, e por quê — **fluxo da extensão, removido** |
| 08 | [Desempenho e estatísticas](08-desempenho-e-estatisticas.md) | Ledger append-only e o desempenho que sai dele |
| 09 | [Reforço e revisões](09-reforco-e-revisoes.md) | Ciclo de 3 baterias, caderno de erros, o que ainda só recomenda |
| 10 | [Conta e lista de espera](10-conta-e-lista-de-espera.md) | Dados do aluno, inscrição, preferências |
| 11 | [Tema claro e escuro](11-tema-claro-escuro.md) | Preferência de interface, hoje por aparelho — ver a nota da spec |
| 12 | [Conclusão de meta sem bateria](12-conclusao-de-meta.md) | O aluno fecha meta de teoria, estudo extra e reforço |
| 13 | [Vínculo, acesso e turmas](13-vinculo-e-liberacao-de-acesso.md) | O professor encontra, assume, libera e organiza o aluno em turmas |
| 14 | [Gestão do planejamento](14-gestao-do-planejamento.md) | Criar, ativar e arquivar planejamento, com os blocos do catálogo |
| 15 | [Cadernos do planejamento](15-cadernos-do-planejamento.md) | Ativar, desativar, editar, incluir, excluir e restaurar bloco |
| 16 | [Histórico e anulação de bateria](16-historico-e-anulacao-de-bateria.md) | O professor vê as baterias do aluno e anula a que não conta |
| 17 | [Ficha da turma](17-ficha-da-turma.md) | KPIs, classificação em quatro faixas, busca e filtros |
| 18 | [Prévia e distribuição da semana](18-previa-e-distribuicao-da-semana.md) | Peso por disciplina e conferência antes de gravar |
| 19 | [Estudo extra avulso](19-estudo-extra-avulso.md) | O aluno registra o que estudou fora da semana, em cinco tipos |
| 20 | [Execução do reforço de ciclo](20-execucao-do-reforco.md) | O aluno revisa os erros do ciclo de 3 baterias |
| 21 | [Fases na extensão](21-fases-na-extensao.md) | Reforço correlato e rodada extra dentro do TEC — **fluxo da extensão, removido** |
| 22 | [Rodízio por tópico](22-rodizio-por-topico.md) | A bateria deixa de poder cair inteira no mesmo assunto — **fluxo da extensão, removido** |
| 23 | [Dificuldades por tópico](23-dificuldades-por-topico.md) | Em que o aluno está errando — **sem cobertura: depende do motor de baterias** |
| 24 | [Revisão espaçada](24-revisao-espacada.md) | Grade de releitura por matéria, 1ª e 2ª revisão |
| 25 | [Tempo de estudo e séries](25-tempo-de-estudo-e-series.md) | Tempo por período, série semanal e sequência de dias |
| 26 | [Tópicos do bloco e da bateria](26-topicos-do-bloco-e-da-bateria.md) | Resumo por tópicos — **sem cobertura: depende do motor de baterias** |
| 27 | [Dados do professor](27-dados-do-professor.md) | O professor edita os próprios dados, com grant por coluna |
| 28 | [Painel arrastável e tópicos](28-painel-arrastavel-e-topicos.md) | Painel dentro do TEC — **fluxo da extensão, removido** |
| 29 | [Sidebar e senha visível](29-sidebar-e-senha-visivel.md) | Barra recolhível com estado persistido; mostrar e ocultar a senha |
| 30 | [Cupom de acesso](30-cupom-de-acesso.md) | Três meses por código — **`fixme`: precisa nascer como RPC** |
| 31 | [Iniciar a bateria pelo caderno](31-iniciar-bateria-pelo-caderno.md) | Começar pela lista de cadernos — **fluxo da extensão, removido** |
| 32 | [O fluxo da teoria](32-fluxo-da-teoria.md) | Progresso por página, questões iniciais, revisão espaçada em aulas |
| 33 | [Catálogo de teoria do professor](33-catalogo-de-teoria.md) | MASTER importado, páginas auditadas, regras por disciplina |

---

## A reconstrução de 14/09/2026 passou por cima destas specs

Duas mudanças grandes aconteceram depois que a maior parte delas foi escrita, e
as duas deixam marca aqui:

**O schema foi recriado a partir do banco de produção.** As RPCs que várias
specs citam — `complete_goal`, `reopen_goal`, `link_student`,
`record_extra_study`, `record_reinforcement`, `void_quiz_session`,
`start_quiz_session` — não foram portadas, e nem as views `vw_*`. Onde isso muda
a superfície sem mudar a regra, a spec ganhou uma nota **Atualizada em
14/09/2026** logo abaixo do cabeçalho. Onde a feature inteira ficou esperando o
banco, a nota diz o que falta e o fluxo e2e está `fixme`.

**Duas specs nasceram depois do código, e dizem isso no cabeçalho.** A 32 e a 33
cobrem o fluxo da teoria e o catálogo que o alimenta — as duas maiores
superfícies criadas nas fases 4 e 6 da reconstrução, que ficaram sem spec na
hora. A regra continua sendo spec antes de código; onde ela foi quebrada, a
spec diz quando e por quê, em vez de fingir que nasceu na ordem certa.

**As telas foram reescritas a partir da v2**, e os fluxos e2e mudaram de id
junto. O cabeçalho de cada spec já aponta para o id novo; o mapa completo de
"era → é" está em [`../fluxos-e2e.md`](../fluxos-e2e.md), na seção *O que saiu,
e para onde foi*.

**Dentro das specs, as tabelas de critérios ainda citam os ids antigos** —
`F-CONC-*`, `F-PREV-*`, `F-TURMA-*`, `F-REVE-*`, `F-TEMP-*` e parentes. Eles não
resolvem mais na suíte; o cabeçalho de cada spec aponta para o id vivo, e o mapa
completo está em [`../fluxos-e2e.md`](../fluxos-e2e.md). Não foram reescritos um
a um de propósito: vários critérios perderam o teste junto com a RPC que
exercitavam, e trocar o id daria a impressão de cobertura que não existe.

As suítes de `supabase/tests/` foram reescritas junto e mudaram de número: hoje
são oito (`00_fixtures` a `07_schema`), organizadas por DEFESA — grant por
coluna, RLS, gatilhos de meta, perfil, lista de espera, teoria e invariantes do
schema — e não mais por feature. Citação a `NN_<feature>.sql` numa spec antiga
não resolve mais.

## O formato

Seis seções, nesta ordem. Nenhuma é decorativa; uma seção vazia é sinal de que
a feature ainda não foi pensada até o fim.

**Problema** — o que não funcionava antes desta feature existir. Uma spec que
começa descrevendo a solução perdeu o critério para julgá-la depois.

**Regras** — as afirmações que precisam ser verdadeiras, numeradas `R-<ÁREA>-nn`.
Uma regra por linha, no presente do indicativo, testável. Onde a regra é imposta
por constraint, índice ou grant, **diga qual** — é o que impede alguém de
"simplificar" a constraint mais tarde sem perceber o que ela sustentava.

**Fluxo** — a sequência, do gatilho ao efeito. Diagrama só quando a ordem entre
os passos importa.

**Superfície** — a tabela de onde a feature vive: rota, action, RPC, tabela,
arquivo. É o que transforma "isso mudou" em "estes arquivos".

**Critérios de aceitação** — numerados `CA-nn`, cada um verificável. Quando já
existe teste, cite o id do fluxo em [`../fluxos-e2e.md`](../fluxos-e2e.md)
(`F-TEO-04`) ou o arquivo da suíte de banco. Critério sem teste fica marcado
**sem cobertura** — é dívida visível, não omissão.

**Fora de escopo** — o que a feature deliberadamente não faz, com o motivo.
Evita que a mesma discussão volte a cada revisão.

---

## Convenções

- **Idioma:** o mesmo do resto do repositório — identificadores em inglês, texto
  em português. Nome de tabela, coluna, RPC e arquivo aparecem como estão no
  código, nunca traduzidos.
- **Ids são estáveis.** `R-BAT-03` não é renumerado quando uma regra sai do
  meio da lista; a linha é marcada como removida, com a data e o motivo. Ids
  citados em comentário de código e em mensagem de commit precisam continuar
  resolvendo.
- **Uma spec não repete o `CLAUDE.md`.** Convenção de repositório mora lá;
  aqui mora regra de produto.
- **Nada de "deveria".** Spec de feature implementada descreve o que é. Se o
  código diverge da spec, um dos dois está errado e isso precisa ser resolvido
  na hora, não anotado.

## Escrevendo a spec de uma feature que ainda não existe

O formato é o mesmo, com duas diferenças:

1. O cabeçalho ganha `**Situação:** não implementada` e o link para o item
   correspondente do comparativo.
2. **Critérios de aceitação vêm antes de qualquer código**, e é por eles que a
   implementação é considerada pronta. Cada um vira um teste em `apps/e2e` ou
   em `supabase/tests/`, com o id do fluxo criado junto.

Comece pela seção **Problema**, e não pela tela. Metade dos fluxos da versão
anterior existia porque alguém desenhou uma tela; é por isso que o aluno
acabou com permissão para gerar o próprio planejamento.
