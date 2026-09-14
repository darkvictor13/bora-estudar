---
name: spec-nova
description: Escreve uma spec nova em docs/specs/ a partir de uma descrição breve do usuário — investiga o repositório, entrevista o usuário em rodadas curtas até a feature estar pensada até o fim, preenche as seis seções do formato, reserva os ids de teste em docs/fluxos-e2e.md, registra no índice e para num portão de aprovação antes de qualquer código. Use sempre que o usuário descrever uma feature e pedir para especificar, planejar ou "escrever a spec", e também quando ele pedir para IMPLEMENTAR algo que ainda não tem spec — neste repositório a spec vem antes do código e é commitada sozinha.
---

# Spec nova

Do "queria que desse para fazer X" até uma spec revisável, commitada sozinha,
com os ids de teste já reservados. **Nenhuma linha de código de produção é
escrita neste fluxo.**

O valor do spec driven development aqui não é ter o documento: é a discussão
acontecer sobre prosa, antes de existir diff. Três coisas sustentam isso, e as
três são passos deste fluxo:

1. a spec é commitada **sozinha**, antes do código — no mesmo PR da
   implementação ninguém revisa a spec, revisa o código e aceita a spec junto;
2. todo critério de aceitação nasce com **um id de teste reservado**, o que
   impede a spec de virar ficção;
3. divergência entre código e spec é bug dos dois, resolvido na hora.

Leia [`docs/specs/README.md`](../../../docs/specs/README.md) antes de começar —
ele define o formato, e este fluxo define o ciclo. O template das seis seções
está em [`template.md`](template.md); o banco de perguntas da entrevista, em
[`perguntas.md`](perguntas.md).

---

## Passo 1 — Receber o pedido e traduzi-lo para problema

O usuário chega com uma descrição breve. Ela quase sempre vem como **solução**
— "uma tela para o professor marcar a meta como concluída", "um botão de
desfazer". Seu primeiro trabalho é devolvê-la à forma de problema:

> "Isso resolve o quê, para quem, que hoje não dá para fazer?"

Metade dos fluxos da v2 existia porque alguém desenhou uma tela, e é assim que
o aluno acaba com permissão para gerar o próprio planejamento. Uma spec que
começa descrevendo a solução perde o critério para julgá-la depois.

Não escreva nada ainda. Só registre, em uma frase, o que você entendeu do
pedido — e confirme essa frase com o usuário antes de seguir.

## Passo 2 — Investigar antes de perguntar

**Nunca pergunte ao usuário o que o repositório responde.** Cada pergunta gasta
paciência; gaste em coisa que só ele sabe. Antes da primeira rodada, leia:

- o schema real: `supabase/migrations/`, `packages/database/src/schema.gen.ts`
  — tabelas, enums, constraints, índices parciais;
- as RPCs que já existem para o domínio. Parte do que a feature precisa costuma
  estar pronta no banco sem tela que chame — `activate_study_plan`,
  `void_quiz_session` e `record_reinforcement` estão nessa situação;
- as specs vizinhas que a nova vai citar. `docs/specs/05-bateria-inteligente.md`
  é o modelo de referência do formato;
- a tabela de fronteira da escrita, em `CLAUDE.md`;
- `docs/comparativo-fluxos-v2.md` §12 — se o pedido corresponde a um item da
  fila, cite-o no cabeçalho da spec. Se não corresponde a nenhum, tudo bem:
  a fila é contexto, não porteiro.

Ao fim deste passo você deve conseguir dizer **o que já existe no banco** e
**quais decisões faltam**. As decisões que faltam são a pauta da entrevista.

## Passo 3 — Entrevistar em rodadas

O banco de perguntas está em [`perguntas.md`](perguntas.md), organizado pela
seção que cada resposta preenche. Não é um questionário para aplicar inteiro:
é de onde você tira as que ainda estão em aberto.

**Como perguntar:**

- **No máximo 4 perguntas por rodada.** Rodada longa vira formulário, e
  formulário é respondido no automático.
- **Cada pergunta vem com um default proposto**, derivado do que você leu no
  Passo 2 e das convenções do repositório. O usuário responde "ok" ou corrige —
  é muito mais barato que uma pergunta aberta. Quando as alternativas são
  poucas e excludentes, use a ferramenta de pergunta com opções.
- **Pule o que o Passo 2 já respondeu.** Se o schema diz que
  `study_plan_blocks` tem `deleted_at`, não pergunte se dá para excluir bloco;
  pergunte o que acontece com as metas do bloco excluído.
- **Depois de cada rodada, devolva uma linha** com o que mudou no seu
  entendimento. É o que deixa o usuário corrigir cedo.
- **Pare quando as respostas pararem de mudar a spec.** Entrevista completa não
  é entrevista exaustiva.
- **"Decide você" é resposta válida** — e vira suposição escrita explicitamente
  na spec, como regra ou como linha de Fora de escopo. Suposição não anotada é
  a que ninguém revisa.
- **Não pergunte sobre implementação** — qual componente, qual arquivo, como
  chamar a função. Isso é a seção Superfície, e você deriva do resto.

**A ordem das rodadas:**

| Rodada | Cobre | Preenche |
|---|---|---|
| 1 | Quem sofre hoje, o que faz no lugar, o que custa, como saberá que funcionou | Problema, semente dos CA |
| 2 | Quem executa; é planejar ou executar; o que a pessoa **não** pode fazer mesmo tendo acesso | Regras, fronteira da escrita |
| 3 | Estados e transições proibidas; clique duplo e queda de rede; dá para desfazer; entra em algum número já exibido | Regras, Fluxo |
| 4 | As bordas concretas que você levantou no Passo 2 — "o que acontece se o planejamento não está ativo", "se o bloco foi excluído", "se dois fazem ao mesmo tempo" | Regras |
| 5 | O que é tentador e fica de fora; o que a v2 fazia e não deve voltar | Fora de escopo |

A rodada 1 **nunca é pulada**, mesmo quando o pedido parece óbvio. As rodadas 2
a 4 podem ser fundidas se o domínio for pequeno. A rodada 5 é curta e evita a
discussão que volta a cada revisão.

## Passo 4 — Portão de escopo

Com as respostas na mão, esboce a **Superfície** em rascunho e aplique o corte:

> Mais de duas RPCs novas, ou mais de uma migration, ou tocar site e banco ao
> mesmo tempo → **são duas specs.**

O item 8 do §12 é o exemplo: "executar o reforço" e "conduzir as fases
`reinforcement`/`extra` no content script" são as duas metades do mesmo fluxo, e
entregar junto significa uma migration e a tela que a consome no mesmo commit.

Se estourar, proponha a divisão **agora**, diga qual metade vem primeiro e por
quê, e escreva só a primeira spec.

## Passo 5 — Número e prefixos

Ids são estáveis e nunca renumerados, então colisão descoberta depois é cara:

```bash
ls docs/specs/                                             # o próximo número
grep -ho 'R-[A-Z]\{2,6\}-' docs/specs/*.md | sort -u       # prefixos R-/CA- ocupados
grep -ho 'F-[A-Z]\{2,6\}-' docs/fluxos-e2e.md | sort -u    # prefixos F- ocupados
```

Proponha o prefixo novo (3 a 5 letras, do domínio, em maiúsculas) junto do
portão do Passo 8 — não invente e siga.

## Passo 6 — Escrever a spec

Copie o template e preencha **na ordem das seções** — a ordem é o método, não
formatação:

```bash
cp .claude/skills/spec-nova/template.md docs/specs/NN-nome-em-kebab.md
```

Cabeçalho:

```markdown
# NN — Título da feature

**Situação:** não implementada · **Fluxos e2e:** F-XXX-01 a F-XXX-nn
```

Acrescente `· **Comparativo:** §12 item N` quando houver item correspondente.

**Escreva a partir das respostas da entrevista, não das suas suposições.** Onde
o usuário disse "decide você", marque a suposição na própria linha.

**Problema primeiro, e só ele.** Pare depois de escrever e releia: se o
parágrafo cita botão, tela ou componente, está errado. Se o problema não
convence nem você, diga isso ao usuário em vez de seguir.

**Regras** é onde o design acontece; o template carrega as duas perguntas
obrigatórias (quem escreve, onde a regra é imposta) e o que declarar sobre
idempotência e máquina de estados.

**Critérios de aceitação** com id de teste em cada linha. Em spec nova não
existe "sem cobertura".

Convenções que valem em toda seção:

- identificadores em inglês, texto em português; nome de tabela, coluna, RPC e
  arquivo aparecem como no código, nunca traduzidos;
- a spec não repete o `CLAUDE.md` — convenção de repositório mora lá, regra de
  produto mora aqui;
- nada de "deveria": spec descreve o que o sistema faz.

## Passo 7 — Reservar os ids de teste e registrar no índice

Três arquivos mudam neste commit, e só eles:

1. **`docs/specs/NN-*.md`** — a spec.
2. **`docs/fluxos-e2e.md` §7** ("Fluxos que ainda não existem") — cada `F-XXX-nn`
   citado na coluna Cobertura entra aqui, com uma linha do que ele prova. Os
   fluxos migram para a seção da área quando o teste existir.
3. **`docs/specs/README.md`** — linha nova na tabela do índice, com
   `Situação: não implementada`. Índice atualizado só no fim é índice
   desatualizado.

## Passo 8 — Portão de aprovação

**Pare aqui.** Apresente ao usuário:

- o número e o prefixo escolhidos;
- o problema em uma frase;
- as decisões que a entrevista fechou, e as suposições que ficaram registradas;
- as regras que vão para o banco (constraint, índice, grant) versus as que ficam
  em RPC;
- quantas RPCs e migrations novas a spec implica;
- os ids de teste reservados;
- o que ficou fora de escopo.

Antes de propor o commit, confira:

- [ ] Nenhuma regra afrouxa as três defesas: `WITH CHECK` em todo INSERT e
      UPDATE, `GRANT UPDATE` por coluna, `DELETE` não concedido em lugar nenhum
- [ ] Toda RPC mutante nova declara a forma de idempotência
- [ ] Função nova prevê `revoke execute ... from public` e `set search_path = ''`;
      view nova, `with (security_invoker = true)`
- [ ] A migration é compatível com o bundle que já está no ar — coluna nova
      nullable ou com default, RPC nova não substitui a antiga no mesmo commit
- [ ] Nenhum dado de domínio em texto livre: tipo, origem e flag são enum ou FK
- [ ] Nada é apagado fisicamente — `deleted_at` mais `audit_log`
- [ ] Todo `CA-nn` tem id de teste, e todo `F-` novo está no §7
- [ ] O índice do README foi atualizado

Só commite se o usuário aprovar, e commite **apenas estes três arquivos**:

```bash
git add docs/specs/NN-*.md docs/specs/README.md docs/fluxos-e2e.md
git commit -m "Especifica <a feature>"
```

Esse é o único commit deste fluxo e ele vai na `main`: é documentação sozinha,
que é o que permite revisar a spec sem o código junto. A branch da
implementação nasce **depois** dele, no Passo 9.

## Passo 9 — Encerrar apontando o caminho

Este fluxo termina no commit da spec. Diga ao usuário a ordem da implementação,
que é outro trabalho:

1. **branch nova, antes da primeira linha de código:**

   ```bash
   git switch main && git pull            # o commit da spec precisa estar aqui
   git switch -c feature/<nome-em-kebab>  # o mesmo slug do arquivo da spec, sem o NN-
   ```

   `docs/specs/11-tema-claro-escuro.md` → `feature/tema-claro-escuro`. A
   implementação inteira mora nessa branch — migration, RPC, site,
   e2e e o fechamento da spec. **Nada de implementação é commitado direto na
   `main`:** cada commit na `main` publica staging
   (`.github/workflows/deploy-staging.yml`), e uma feature entregue pela metade
   lá é banco novo com um bundle que ainda não chama a RPC nova. A `main`
   recebe o conjunto de uma vez, por merge, quando `npm run check`,
   `npm run db:test` e a suíte e2e passarem;
2. migration nova — o schema inicial está **congelado**, nunca reescreva
   migration já aplicada → `npm run db:types`, e commite o arquivo gerado;
3. teste de banco falhando primeiro, pelos `CA` que mapeiam para
   `supabase/tests/`;
4. RPC, policies e grants até `npm run db:test` passar;
5. site, mais a tradução das mensagens de `raise exception` para o usuário;
6. e2e pelos `F-` reservados. **`npm run db:reset` entre `db:test` e `e2e`** —
   na outra ordem o `global-setup` quebra.

E o fechamento, no commit da implementação: `Situação` vira `implementada`, a
coluna Cobertura recebe os ids reais, os fluxos saem do §7 e entram na seção da
área, e a mensagem de commit cita os ids. Se a realidade contrariou a spec
durante a implementação, a spec é corrigida no mesmo commit — nunca anotada
para depois. Esse commit também é da branch: a `main` só vê a feature quando o
conjunto inteiro passa.

---

## Erros que este fluxo existe para evitar

| Erro | Onde o fluxo pega |
|---|---|
| Spec escrita a partir da tela que o usuário imaginou | Passo 1, tradução para problema |
| Perguntar o que o schema já responde | Passo 2, investigação antes da entrevista |
| Feature especificada até a metade, com as bordas descobertas no código | Passo 3, rodadas 3 e 4 |
| Suposição do autor que ninguém revisou | Passo 3, "decide você" vira linha escrita |
| Fatia grande demais que vira PR de 40 arquivos | Passo 4, portão de escopo |
| Reespecificar RPC que já existe | Passo 2, leitura do schema |
| Colisão de id com spec antiga | Passo 5, levantamento dos prefixos |
| Critério sem teste, descoberto no fim | Passo 7, ids reservados antes |
| Spec entregue junto com o código, sem revisão real | Passo 8, commit isolado |
| Feature pela metade publicada em staging a cada commit | Passo 9, branch `feature/` antes do código |
