# Specs

Uma spec por feature. Descrevem **o que o sistema faz e por quê** — não como o
código está organizado, que é assunto de [`../arquitetura.md`](../arquitetura.md).

Estas dez primeiras foram escritas a partir do código já implantado: são o
retrato do que existe hoje, não um plano. Servem a três coisas — dar um lugar
para a regra morar quando ela não cabe num comentário, permitir revisar
comportamento sem ler SQL, e ser o molde das specs das features que faltam.

O que **não** existe está catalogado em
[`../comparativo-fluxos-v2.md`](../comparativo-fluxos-v2.md) §12; cada item de
lá vira uma spec nova antes de virar código.

---

## Índice

| # | Spec | Cobre |
|---|---|---|
| 01 | [Autenticação](01-autenticacao.md) | Cadastro, login, logout, recuperação de senha, guardas por papel |
| 02 | [Acesso e assinatura](02-acesso-e-assinatura.md) | Quem entra nas telas de estudo, e o que vê quem ainda não pode |
| 03 | [Planejamento e metas](03-planejamento-e-metas.md) | `study_plans`, blocos, metas e as invariantes que o banco impõe |
| 04 | [Geração da semana](04-geracao-semanal.md) | O professor monta a semana do aluno; lote idempotente |
| 05 | [Bateria inteligente](05-bateria-inteligente.md) | A volta completa: site → extensão → TEC → site → meta concluída |
| 06 | [Protocolo site ↔ extensão](06-protocolo-site-extensao.md) | Envelope versionado que trafega no fragmento da URL |
| 07 | [Motor de seleção](07-motor-de-selecao.md) | Quais 15 questões a bateria escolhe, e por quê |
| 08 | [Desempenho e estatísticas](08-desempenho-e-estatisticas.md) | Ledger append-only e as cinco views derivadas |
| 09 | [Reforço e revisões](09-reforco-e-revisoes.md) | Ciclo de 3 baterias, caderno de erros, o que ainda só recomenda |
| 10 | [Conta e lista de espera](10-conta-e-lista-de-espera.md) | Dados do aluno, inscrição, preferências |
| 11 | [Tema claro e escuro](11-tema-claro-escuro.md) | Preferência de interface da conta, para os três papéis — **não implementada** |

---

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
(`F-BAT-09`) ou o arquivo da suíte de banco. Critério sem teste fica marcado
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
