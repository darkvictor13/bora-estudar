# 06 — Protocolo site ↔ extensão

> **Histórico.** Esta spec descreve o fluxo conduzido pela extensão de
> navegador, que foi removida do repositório. O que ela diz do banco continua
> valendo; o que diz da execução, não — não existe hoje caminho por onde o aluno
> responda uma bateria.

**Situação:** implementada · **Fluxos e2e:** F-BAT-01, F-BAT-03, F-BAT-08, F-BAT-12

---

## Problema

Site e extensão são **dois programas versionados separadamente**. O site
atualiza sozinho a cada deploy; a extensão só quando o usuário quer, e às vezes
nunca. Isso significa que a qualquer momento existe um site novo conversando
com uma extensão velha, e o canal entre os dois não tem sessão, não tem
cabeçalho e não tem negociação: é um fragmento de URL.

Na versão anterior cada ponta tinha a própria cópia das formas — `b64urlEncodeObj`
aparecia duplicado em `aluno.js` e em `content.js` — e as duas derivaram. Não
havia número de versão, então uma incompatibilidade se manifestava como campo
`undefined` no meio do fluxo, não como erro.

---

## Regras

| Id | Regra |
|---|---|
| R-PROTO-01 | `packages/protocol` é a **única** definição. As duas pontas importam de lá; nenhuma redefine as formas localmente. |
| R-PROTO-02 | Todo payload viaja dentro de um envelope `{ protocol, kind, body }`. |
| R-PROTO-03 | Toda leitura compara `PROTOCOL_VERSION` e **rejeita versão diferente** com `ProtocolError("incompatible_version")`. Mudança incompatível incrementa a constante. |
| R-PROTO-04 | A leitura também confere `kind`. Um envelope de resultado lido onde se esperava início é `unexpected_kind`, não um corpo estranho. |
| R-PROTO-05 | **Valide na fronteira.** `JSON.parse` devolve `any`, e tipo de TypeScript não sobrevive à serialização: `readQuizStart` e `readQuizResult` conferem campo a campo e falham com o nome do campo. |
| R-PROTO-06 | A validação do par `phase`/`sourceQuestionId` acontece no codec, não só no banco: `sourceQuestionId` é obrigatório **se e somente se** `phase === "reinforcement"`. O banco tem o mesmo CHECK; falhar aqui dá erro legível na origem em vez de um `23514` opaco depois de a sessão inteira ter sido respondida. |
| R-PROTO-07 | `ProtocolError` carrega um `code` da lista fechada — `missing_fragment`, `invalid_base64`, `invalid_json`, `incompatible_version`, `unexpected_kind`, `invalid_body`. É por ele que a interface escolhe a mensagem. |
| R-PROTO-08 | `hashHasPayload` responde se há payload **sem validar o corpo**, para que a página decida se deve sequer tentar. |
| R-PROTO-09 | O base64url usa só APIs presentes em navegador e em Node ≥ 18, para que o mesmo código rode no content script, no site e nos testes. |
| R-PROTO-10 | **A extensão nunca fala com o Supabase.** Recebe um payload e devolve outro. Assim o pacote distribuído na loja não carrega credencial e toda regra de negócio fica atrás das RPCs. Por isso `@bora/extension` depende de `@bora/protocol` e não de `@bora/database`. |
| R-PROTO-11 | `buildResultUrl` usa `&` como separador quando a `returnUrl` já tem `#`, para não destruir um fragmento existente. |
| R-PROTO-12 | O `ProtocolError` declara o campo `code` e o atribui no corpo, não como parameter property: o modo strip-only do Node não gera código. |

---

## As duas mensagens

### `quiz.start` — site → extensão

| Campo | Tipo | Observação |
|---|---|---|
| `returnUrl` | string | origem exata, sem fragmento |
| `quizSessionId`, `goalId`, `studyPlanId`, `blockId` | string | |
| `sessionNumber` | inteiro ≥ 1 | número visível do bloco |
| `mainTarget` | inteiro ≥ 1 | 15 na prática |
| `availableQuestions` | inteiro[] | questões do bloco, na ordem do catálogo |
| `history` | `SeenQuestion[]` | `{questionId, timesSeen, correctAnswers, incorrectAnswers, lastSeenAt}` |
| `historyComplete` | booleano | `false` quando o site não conseguiu carregar o histórico inteiro |

`historyComplete` existe por causa de um defeito concreto da v2: ela marcava o
histórico como autoritativo mesmo truncado, e o motor passava a repetir questões
**em silêncio** depois de ~30 sessões no mesmo bloco. Ver [07](07-motor-de-selecao.md).

### `quiz.result` — extensão → site

| Campo | Tipo | Observação |
|---|---|---|
| `quizSessionId` | string | |
| `requestId` | string | chave de idempotência, gerada uma vez na origem |
| `cancel` | booleano | |
| `answers` | `QuestionAnswer[]` | `{questionId, executionOrder, round, phase, outcome, topic, sourceQuestionId, answeredAt}` |

`phase` ∈ `main` \| `reinforcement` \| `extra`; `outcome` ∈ `correct` \| `incorrect`.

---

## Superfície

| Camada | Item |
|---|---|
| Pacote | `packages/protocol` |
| Envelope | `envelope.ts` — `PROTOCOL_VERSION`, `HASH_KEYS`, `ProtocolError` |
| Formas | `messages.ts` — `QuizStart`, `QuizResult`, `SeenQuestion`, `QuestionAnswer` |
| Codec | `codec.ts` — `buildStartUrl`, `buildResultUrl`, `parseStartHash`, `parseResultHash`, `hashHasPayload` |
| Testes | `codec.test.ts`, pelo runner nativo do Node |
| Consumidores | `apps/web/src/lib/data/quiz-actions.ts`, `apps/web/src/components/student/QuizResultHandler.tsx`, `apps/extension/src/content/index.ts` |

Chaves do fragmento: `boraQuizStart` (site → extensão) e `boraQuizResult`
(extensão → site).

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | `buildStartUrl` → `parseStartHash` devolve o mesmo corpo, campo a campo | `codec.test.ts` |
| CA-02 | Base64 corrompido produz `invalid_base64`; a tela mostra "O resultado voltou da extensão em formato inválido." | F-BAT-12, `codec.test.ts` |
| CA-03 | `protocol` diferente de 1 produz `incompatible_version`; a tela pede para atualizar a extensão | F-BAT-12 |
| CA-04 | `kind` trocado produz `unexpected_kind` | `codec.test.ts` |
| CA-05 | Campo faltando ou com tipo errado produz `invalid_body` **com o nome do campo** | `codec.test.ts` |
| CA-06 | `phase="reinforcement"` sem `sourceQuestionId` — e o inverso — é recusado no codec | `codec.test.ts` |
| CA-07 | `hashHasPayload` devolve `false` para hash vazia sem lançar | `codec.test.ts` |
| CA-08 | `buildResultUrl` sobre uma `returnUrl` que já tem `#` usa `&` e preserva o fragmento existente | `codec.test.ts` |
| CA-09 | O payload que a extensão recebe no seed traz `mainTarget: 15`, 30 ids em `availableQuestions`, `history: []` e `historyComplete: true` | F-BAT-01 |
| CA-10 | Nenhum arquivo de `apps/extension` importa `@bora/database` nem o cliente Supabase | **sem cobertura** — hoje garantido só pelo `package.json` |

---

## Fora de escopo

- **Negociação de versão.** Não há downgrade nem compatibilidade retroativa: a
  versão bate ou o payload é recusado com mensagem acionável.
- **Canal que não seja o fragmento da URL.** Nada de `postMessage` nem de porta
  de extensão. O fragmento não chega ao servidor, funciona sem permissão extra
  e sobrevive à navegação de documento.
- **Criptografia ou assinatura do payload.** O conteúdo não é secreto e toda
  regra é revalidada no banco; um payload forjado esbarra na RLS e nas RPCs.
- **Mensagens além das duas.** Um `quiz.progress` intermediário chegou a ser
  considerado e não existe: a extensão persiste local e envia uma vez.
