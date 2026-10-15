# 45 — Resumos flash e anotações

**Situação:** implementada em 14/10/2026 (commit `9b124fd`, **sem spec**) e endurecida em 15/10/2026 (`20261015120000`) · **Fluxos e2e:** F-RES-01 a F-RES-03

Esta spec foi escrita **depois** do código, a partir da revisão do commit: é o retrato do que existe e do que a revisão mandou mudar, não um plano. A regra do repositório — spec antes, commitada sozinha — não foi seguida, e foi isso que deixou sem teste de banco nem de tela uma tabela de conteúdo, um bucket e uma policy.

---

## Problema

O aluno estuda com um material que não é a aula: um resumo da área, organizado por disciplina e tópico. Lê, e quer marcar o que importa e comentar, sem alterar o material — que é um só, comum a todos, e que ele não escreve.

O material tem um custo de obtê-lo que a aula não tem: vem de um arquivo do Word, com imagens, que alguém importa à mão. Importar tem de ser seguro (o arquivo não é confiável por ser "de casa"), repetível sem duplicar, e não pode expor o arquivo original a quem só precisa ler o texto.

E a anotação é do aluno, com mais volume do que parece: um tópico bem estudado passa de centenas de marcas. O salvamento tem de caber nisso e de não perder o que outra aba gravou.

---

## Regras

### O material

| Id | Regra |
|---|---|
| R-RES-01 | O conteúdo mora em `summary_topics`: `id` (slug), `subject`, `title`, `position`, `source_name`, `source_hash` e `blocks` (jsonb, um array). Os blocos são parágrafo, subtítulo, imagem (por `key`) e tabela — a tabela guarda blocos nas células, **inclusive outra tabela**. |
| R-RES-02 | Ninguém escreve pelo site: `authenticated` só tem `SELECT`, e a carga é do `service_role`. O texto só é lido com acesso vigente ou por professor (`summary_topics_read`). |
| R-RES-03 | O catálogo (lista de tópicos) lê só `id`, `subject` e `title`; o conteúdo e as URLs das imagens só ao abrir um tópico. |
| R-RES-04 | Ambiente sem a carga mostra a biblioteca vazia **com uma frase que diz isso**, e não uma tela em branco. |

### As imagens e o original

| Id | Regra |
|---|---|
| R-RES-05 | As imagens ficam no bucket privado `flash-summaries`, em `pf2029/<sha256>.<extensão>`. O aluno as lê por URL assinada de uma hora, e só com acesso vigente ou sendo professor. |
| R-RES-06 | **A policy do bucket nomeia o que se lê** (`^pf2029/[0-9a-f]{64}\.(png\|jpe?g\|jfif)$`). O `.docx` original que a carga preserva (`pf2029/source.docx`) **não é legível por `authenticated`**, nem por professor: só pelo `service_role`. *(Corrigido em 15/10: a policy cobria o bucket inteiro, e o arquivo pessoal de quem importou ficava baixável por todo aluno.)* |
| R-RES-07 | O bucket só aceita PNG, JPEG e DOCX. HTML ou SVG numa URL assinada seria script rodando na origem do projeto. |

### A anotação

| Id | Regra |
|---|---|
| R-RES-08 | A anotação é do aluno e mora em `summary_annotations`, uma linha por `(user_id, topic_id)`, com `notes` (jsonb, um array de no máximo 2000 itens e 2 MB). Cada item tem `id`, `path`, `start`, `end`, `quote`, `style`, `color` e `comment`. |
| R-RES-09 | Lê só o dono, sempre, também com o acesso vencido. **Nem o professor lê**: é anotação privada, como o grifo do cartão (R-GRIFO-11). Criar e alterar exigem acesso vigente. Não há `DELETE` — apagar uma marca é gravar o array sem ela. |
| R-RES-10 | `user_id` e `topic_id` ficam fora do grant de UPDATE. |
| R-RES-11 | A âncora é o trecho: a marca só é pintada se `quote` ainda for o texto naquele `path` e posição. Marca que deixou de casar não é pintada, e **não é apagada**. |
| R-RES-12 | `color` é `#rrggbb` e `style` é um dos sete estilos (validado ao ler, antes de virar CSS); `comment` tem até 2000 caracteres. Linha com formato inválido **não é renderizada**: a tela avisa. |

### Gravar

| Id | Regra |
|---|---|
| R-RES-13 | Gravar é `save_summary_notes(p_topic_id, p_previous, p_next)`: grava `p_next` **se o banco ainda guarda `p_previous`**, e devolve `false` quando outra aba mudou antes. O estado anterior vai no corpo da requisição — numa URL de filtro, o JSON das anotações estourava o limite dos proxies (perto de 8 KB) muito antes do teto da coluna. *(Corrigido em 15/10.)* |
| R-RES-14 | A função é **naturalmente idempotente**, e quem sustenta é a PK `(user_id, topic_id)` mais o estado final como fato: se a linha já guarda `p_next`, a retentativa devolve `true`. Esse teste vem **antes** da checagem de acesso: gravou, o acesso venceu, a retentativa responde "gravado". `security invoker`, para a RLS continuar decidindo. |
| R-RES-15 | `false` vira o aviso "as anotações mudaram em outra aba" (`conflict`), e a tela **para de gravar** até recarregar: sobrescrever às cegas seria o defeito que a comparação existe para impedir. |

### A importação

| Id | Regra |
|---|---|
| R-RES-16 | O importador (`scripts/import-flash-summaries.mjs`) lê o DOCX **sem executar nada dele**: título é reconhecido pelo NOME do estilo (`heading 1`, `Título 2`…) e, na falta, pelo id (`Heading1`, `Ttulo1`); tabelas aninhadas são mantidas; DTD e entidades XML são recusados; cada parte do ZIP tem teto de 64 MB e o total, 512 MB. |
| R-RES-17 | A carga (`scripts/load-flash-summaries.mjs`) roda em qualquer sistema, só contra o Supabase **local**, e repetida não duplica tópico. Tópico que sumiu da fonte não é apagado. O material não entra no repositório (`/content/summaries/local/` é ignorado). |

---

## Fluxo

```
Word (.docx) → import-flash-summaries.mjs → content/summaries/local/pf2029 (ignorado pelo Git)
             → load-flash-summaries.mjs  → summary_topics (service_role)
                                          → bucket flash-summaries: pf2029/<sha>.png … e source.docx (só service_role lê)

/aluno/resumos-flash              → loadSummaryCatalog → biblioteca (ou a frase de R-RES-04)
/aluno/resumos-flash?resumo=ID    → loadSummaryDocument (URLs assinadas) + loadSummaryNotes
selecionar → atalho/barra         → nova lista → saveSummaryNotes(anterior, nova)
                                  → save_summary_notes → true | false (conflito)
```

---

## Superfície

| Camada | Item |
|---|---|
| Migrations | `20261012205121_flash_summary_library.sql` (tabela, bucket e policy), `20261012212626_summary_annotations.sql` (anotação), `20261015120000_summary_hardening.sql` (policy do bucket restrita, tipos aceitos, `save_summary_notes`) |
| RPCs | `save_summary_notes` — a décima segunda. Revogada de `public` e `anon`, concedida a `authenticated` |
| Contrato | `lib/api/summaries.ts` (tipos), `loadSummaryCatalog`, `loadSummaryDocument`, `loadSummaryNotes`, `saveSummaryNotes` |
| Adaptadores | `lib/api/supabase/summaries.ts`; fixtures devolvem vazio |
| Domínio | `lib/domain/summary-notes.ts`, `summary-sections.ts`, `summary-shortcuts.ts` |
| Scripts | `import-flash-summaries.mjs`, `load-flash-summaries.mjs`, `convert-summary-metafiles.ps1` (Windows: converte EMF em PNG) |
| Testes | `supabase/tests/20_summaries.sql` (11), `07_schema.sql` (08 e 13), `import-flash-summaries.test.mjs`, `flash-summary-library.test.mjs` (opcional, `BORA_LOCAL_TEST=1`), `lib/domain/summary-*.test.ts`, `apps/e2e/tests/summaries.spec.ts` |

---

## Critérios de aceitação

| Id | Critério | Cobertura |
|---|---|---|
| CA-01 | Aluno com acesso vigente e professor leem o resumo; aluno vencido e anônimo, não. Ninguém de `authenticated` escreve em `summary_topics`. | `20_summaries.sql` (01 a 03) |
| CA-02 | `save_summary_notes` grava, a retentativa de quem já gravou devolve `true`, estado anterior desatualizado devolve `false`, e 300 anotações (~100 KB) gravam e se comparam. | `20_summaries.sql` (04, 05) e F-RES-02 |
| CA-03 | A anotação é do dono: outro aluno e o professor leem zero; `user_id` e `topic_id` estão fora do UPDATE; não há INSERT em nome alheio nem DELETE. | `20_summaries.sql` (06, 07) |
| CA-04 | `notes` só aceita array, no máximo 2000 itens. | `20_summaries.sql` (08) |
| CA-05 | Com o acesso vencido: a retentativa de quem gravou antes passa, escrita nova dá `42501`, e a leitura da própria anotação continua. | `20_summaries.sql` (09) |
| CA-06 | O aluno com acesso vê só `pf2029/<sha256>.<imagem>`; **nunca** `source.docx`; o professor também não; o vencido não vê o bucket. O bucket é privado e só aceita PNG, JPEG e DOCX. | `20_summaries.sql` (10, 11) |
| CA-07 | O importador reconhece título por nome de estilo, mantém tabela aninhada, e recusa DTD e parte do ZIP acima do teto. | `import-flash-summaries.test.mjs` |
| CA-08 | O grifo feito numa sessão aparece em outra sessão do mesmo aluno. | F-RES-01 |
| CA-09 | Com ~60 KB de anotações já gravadas, um grifo novo ainda grava. | F-RES-02 |
| CA-10 | A aba desatualizada é avisada e não sobrescreve o que a outra gravou. | F-RES-03 |

---

## Fora de escopo

- **Publicar a biblioteca em staging e produção.** A carga é manual, local e pessoal, e o material não é distribuído no repositório. Decisão sobre como (e se) o conteúdo chega a ambientes compartilhados é outra spec — hoje, nesses ambientes, a biblioteca aparece vazia (R-RES-04).
- **Os resumos das aulas** (`flashSummary` de `theory_lessons`): o link que o professor cola continua como era, e a tela os mostra numa aba à parte.
- **Mesclar conflito de anotação.** Hoje a aba desatualizada recarrega; combinar as duas listas é um problema de edição concorrente que ninguém pediu.
- **O professor ver as anotações.** Privacidade, como R-GRIFO-11.
- **Sincronizar o material quando o Word muda.** A carga atualiza o texto, e a reancoragem das marcas é só a verificação de R-RES-11; não há reposicionamento.
