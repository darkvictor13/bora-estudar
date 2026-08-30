# 17 — Ficha da turma

**Situação:** não implementada · **Comparativo:** §12 item 12 · **Inventário:** [`inventario-v96.md`](../inventario-v96.md) §6 · **Fluxos e2e:** F-TURMA-01 a F-TURMA-05

---

## Problema

O professor tem a lista, não tem o diagnóstico.

`/professor` mostra uma linha por aluno com nome, contato, planejamento ativo e
o badge de acesso. Nada ali diz **quem precisa de atenção**. Para descobrir, o
professor abre a ficha de um aluno, lê três números, volta, abre a do próximo.
Com cinco alunos isso é chato; com trinta, ninguém faz — e a consequência é que
o aluno que parou de estudar só aparece quando reclama.

A informação existe inteira no banco e é derivada: `goals.status` dá o
progresso, `vw_block_performance` dá o desempenho oficial. Falta trazê-la para a
lista e ordenar por ela.

A versão anterior tinha isso e classificava cada aluno em quatro faixas
(`classificarAluno`, professor.js:3274), com KPIs por cartão, um resumo da turma
no topo e filtros por status e por plano. Os limiares dela são a única parte
desta spec que não sai do banco, e estão transcritos abaixo para não serem
inventados de novo.

---

## Regras

### A classificação, com os limiares da v96

| Id | Regra |
|---|---|
| R-TURMA-01 | Cada aluno cai em **uma** de quatro faixas, avaliadas nesta ordem: **Sem dados** quando não tem questão respondida **e** não tem meta; **Atrasado** quando o progresso de metas é `< 0,30`; **Atenção** quando o desempenho oficial é `< 70%` (havendo questão) **ou** o progresso é `< 0,55`; **Em ritmo** no resto. São os limiares de `classificarAluno` (professor.js:3274-3281). |
| R-TURMA-02 | **Progresso** é `metas concluídas ÷ total de metas não excluídas` do planejamento ativo. Sem planejamento ativo, não há progresso e o aluno cai em "Sem dados" se também não tiver questão. |
| R-TURMA-03 | **Desempenho oficial** é `main_correct ÷ main_count` somados sobre `vw_block_performance` do planejamento ativo — a mesma definição da spec [08](08-desempenho-e-estatisticas.md). Não existe segundo cálculo de desempenho neste produto. |
| R-TURMA-04 | Nenhum número é guardado. Tudo é derivado a cada carga, de `goals.status` e de `vw_block_performance`. Coluna de contador é o erro que o `CLAUDE.md` proíbe e que a v96 cometia com `updateBlocoStats`. |

### O resumo da turma

| Id | Regra |
|---|---|
| R-TURMA-05 | O topo mostra quatro números: **Alunos**, **Em ritmo**, **Precisam de atenção** e **Questões da turma**. "Precisam de atenção" soma **Atenção mais Atrasado** — é assim na v96 (`renderResumoAlunos`, professor.js:3516), e faz sentido porque as duas faixas pedem a mesma ação. |
| R-TURMA-06 | "Questões da turma" é a soma de `main_count` de todos os alunos, com o percentual médio calculado só sobre quem tem questão — dividir por quem tem zero afundaria a média da turma sem significar nada. |

### Busca e filtros

| Id | Regra |
|---|---|
| R-TURMA-07 | Busca e filtros vivem na **query string** — `?busca=`, `?situacao=`, `?plano=` —, como `?semana=` no painel do aluno e `?ver=` nos cadernos. Um link para "meus alunos atrasados" passa a existir, e o teste tem por onde entrar. A v96 filtrava em memória e o estado morria a cada render. |
| R-TURMA-08 | A busca casa **nome e e-mail**, sem acento e sem diferenciar maiúsculas. A v96 dizia buscar por "nome ou concurso" e comparava o nome do **plano** — o rótulo mentia; aqui o rótulo diz o que a busca faz. |
| R-TURMA-09 | O filtro de situação usa as quatro faixas de `R-TURMA-01`. O filtro de plano usa o **nome do planejamento ativo**; quem não tem entra como "Sem planejamento ativo". |
| R-TURMA-10 | Valor inválido em qualquer um dos três é **ignorado**, e a lista volta inteira em vez de vazia ou quebrada. É a mesma regra de `?semana=` (F-ALU-02). |
| R-TURMA-11 | A lista é ordenada por **quem precisa de atenção primeiro** — Atrasado, Atenção, Sem dados, Em ritmo — e, dentro da faixa, por nome. A ordenação é o que transforma a lista em diagnóstico. |

---

## Fluxo

```
professor abre /professor
      │
      ├─ links vigentes ──► perfis, assinaturas, planejamentos ativos
      │
      ├─ UMA consulta de goals para TODOS os planejamentos ativos
      ├─ UMA consulta de vw_block_performance para os mesmos
      │        └─ nunca uma consulta por aluno: com trinta alunos seriam
      │           sessenta idas ao servidor por carga de página
      ▼
   por aluno: progresso = concluídas ÷ total
              desempenho = Σ main_correct ÷ Σ main_count
              faixa = R-TURMA-01
      │
      ├─ resumo da turma: alunos, em ritmo, precisam de atenção, questões
      ├─ filtros de ?busca= ?situacao= ?plano=
      └─ ordena por faixa (Atrasado → Atenção → Sem dados → Em ritmo), depois nome
```

---

## Superfície

| Camada | Item |
|---|---|
| Rota | `/professor` — ganha resumo, colunas de KPI, filtros e ordenação |
| Componentes | `StudentFilters`, em `components/teacher/` |
| Actions | **nenhuma** — a tela é só leitura |
| Leitura | `getMyStudentsWithProgress`, em `lib/data/teacher.ts` |
| Domínio | `classifyStudent` e os limiares, em `lib/domain/students.ts`, com teste de unidade |
| RPCs | **nenhuma nova** |
| Migration | **nenhuma** |
| Testes | `apps/web/src/lib/domain/students.test.ts`, `apps/e2e/tests/teacher.spec.ts` |

**A classificação é função pura e ganha teste de unidade.** São quatro faixas com
cinco limiares e uma ordem de avaliação que importa — exatamente o tipo de coisa
que se prova mais barato sem navegador, como `pickQuestions` e `buildWeek`. O
e2e prova que a tela usa a função; o teste de unidade prova as bordas.

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | As quatro faixas saem dos limiares certos, incluindo as bordas exatas — 0,30, 0,55 e 70% | `apps/web/src/lib/domain/students.test.ts` |
| CA-02 | A lista mostra progresso, desempenho oficial e a faixa de cada aluno, e o resumo da turma bate com as linhas | F-TURMA-01 |
| CA-03 | Um aluno com bateria concluída abaixo de 70% aparece como "Atenção", e o mesmo aluno acima do limiar aparece como "Em ritmo" | F-TURMA-02 |
| CA-04 | `?busca=` casa nome e e-mail, sem acento; `?situacao=` e `?plano=` filtram | F-TURMA-03 |
| CA-05 | Valor inválido em qualquer filtro devolve a lista inteira, sem erro de console | F-TURMA-04 |
| CA-06 | Quem precisa de atenção vem primeiro na lista | F-TURMA-05 |

---

## Fora de escopo

- **Gráfico de evolução da turma.** Série temporal é o item 14 da fila, e vale
  para aluno e professor juntos.
- **Exportar a lista.** Ninguém pediu, e exportação levanta pergunta de dado
  pessoal que esta spec não responde.
- **Ordenar por coluna clicando no cabeçalho.** A ordenação por urgência é a que
  serve ao propósito da tela; deixar o professor reordenar é conforto.
- **Alerta automático quando um aluno cai de faixa.** Notificação é superfície
  nova, com fila e reenvio.
- **Classificação configurável.** Os cinco limiares vêm da v96 e ficam no
  código, com teste. Torná-los ajustáveis por professor exigiria tabela de
  configuração e uma tela para ela, antes de alguém ter reclamado dos valores.
