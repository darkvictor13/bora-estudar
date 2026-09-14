# Banco de perguntas

De onde tirar as perguntas de cada rodada do Passo 3. **Não é questionário para
aplicar inteiro** — pule tudo que a leitura do Passo 2 já respondeu, e pare
quando as respostas pararem de mudar a spec.

Cada pergunta traz o **default** a propor. O usuário responde "ok" ou corrige,
que é muito mais barato que responder uma pergunta aberta.

---

## Rodada 1 — Problema

Nunca pulada, nem quando o pedido parece óbvio.

| Pergunta | Por que muda a spec | Default a propor |
|---|---|---|
| Quem sofre com isso hoje — aluno, professor ou admin? | Define o papel, e com ele a fronteira da escrita inteira | O papel que o pedido sugere, dito em voz alta para confirmação |
| O que essa pessoa faz hoje no lugar? | Gambiarra existente é o melhor retrato do problema; às vezes ela revela que a feature é outra | "Não faz — fica travada" |
| Com que frequência? Toda semana, ou uma vez por trimestre? | Frequência baixa costuma justificar deixar em `Fora de escopo` e resolver no banco à mão | — |
| O que se perde quando não dá para fazer? Tempo, dado, ou outra pessoa travada? | Perda de **dado** muda tudo: vira ordenação que não pode inverter | — |
| Como você vai saber que funcionou? | É a semente dos critérios de aceitação — anote as palavras dele | — |

> Se a resposta à primeira pergunta for "ninguém pediu, só achei que seria bom",
> diga isso ao usuário antes de gastar a entrevista.

---

## Rodada 2 — Fronteira da escrita

Confronte cada resposta com a tabela de fronteira do `CLAUDE.md`.

| Pergunta | Por que muda a spec | Default a propor |
|---|---|---|
| É **planejar** ou **executar**? | Planejar → escrita direta com RLS. Executar → RPC, sem exceção | Se toca `quiz_sessions`, `quiz_session_questions`, `reinforcements` ou `review_cycles`, é executar |
| Quem dispara a ação? | Define as policies e o `WITH CHECK` | O papel da rodada 1 |
| Uma pessoa pode fazer isso **pela outra**? | Professor agindo pelo aluno é caso legítimo e precisa estar escrito | Professor pode pelo aluno com vínculo vigente; aluno nunca por outro aluno |
| O que a pessoa **não** pode fazer, mesmo autenticada e com o papel certo? | É literalmente o conteúdo do `WITH CHECK` | Mover linha entre dois alunos; alterar `student_id`, `teacher_id` ou `study_plan_id` |
| Alguma coluna que ela lê mas não escreve? | Vira o `GRANT UPDATE` por coluna | As colunas de contexto ficam fora do grant |
| Exige vínculo vigente? Assinatura ativa? Planejamento ativo? | Cada "sim" é uma regra numerada com o predicado que a impõe | Vínculo por `is_teacher_of`; planejamento `active` |
| Admin faz o mesmo que o professor? | Evita descobrir no meio da implementação que falta uma policy | Não — admin cuida de catálogo |

---

## Rodada 3 — Estado, repetição e reversão

| Pergunta | Por que muda a spec | Default a propor |
|---|---|---|
| A ação tem estados intermediários? Quais? | Vira a tabela status × marcos temporais, e dela sai a `check` constraint | — |
| Quais transições são **proibidas**? | Estado alcançável que ninguém previu é o que a constraint impede | Nenhum estado final volta atrás |
| A pessoa clica duas vezes: o que deve acontecer? | Decide a forma de idempotência | Devolve o mesmo resultado, sem reexecutar |
| A ação carrega payload? | Com payload → `request_id` + `reserve_operation`. Sem → precisa justificar por que é naturalmente idempotente | Com payload |
| A rede cai depois do envio: o que ela vê ao voltar? | É o que decide se a retentativa é do cliente, e se o dado sobrevive | O estado já gravado, sem refazer o trabalho |
| Dá para desfazer? Quem desfaz, e até quando? | Vira regra e, quase sempre, uma RPC separada | Só o autor, enquanto o estado não fechou |
| Desfazer apaga ou marca? | Nada é apagado fisicamente neste repositório | `deleted_at` mais `audit_log` |
| O que essa ação produz entra em algum número já exibido? Qual view? | Número novo vem de view, nunca de coluna de contador mantida à mão | Sai de view derivada do ledger |
| Duas pessoas fazendo ao mesmo tempo: o que é verdade depois? | Invariante que dá para expressar em constraint vai para o banco — índice único parcial, não `UPDATE` em sequência | Só uma vence, por índice único parcial |
| Existe limite de quantidade? Por dia, por aluno, por planejamento? | Vira `check` ou validação de RPC | Sem limite |
| A ordem entre os passos importa? O que se perde se inverter? | Se a resposta envolve perder dado do aluno, vira regra numerada **e** critério próprio | — |

---

## Rodada 4 — Bordas

Monte estas a partir do que você leu no Passo 2, usando os objetos reais do
schema. As de baixo valem para quase toda feature deste domínio.

| Pergunta | Default a propor |
|---|---|
| Planejamento arquivado ou inativo: a ação ainda vale? | Não — exige `active` |
| Bloco com `deleted_at`: some da tela ou continua visível no histórico? | Some das ações, continua no histórico |
| Assinatura expirada no meio de algo em andamento: o que acontece? | O que estava aberto pode ser concluído; nada novo começa |
| Meta já concluída: dá para refazer? | Não, sem uma ação explícita de reabrir |
| Vínculo professor–aluno encerrado: quem continua vendo o histórico? | O aluno; o professor perde o acesso |
| Aluno sem planejamento ativo: o que ele vê? | Estado vazio, sem erro |
| Precisa de valor novo num enum existente? | Migration nova, nunca reescrita da inicial |
| Tem campo de texto livre? O que vai nele? | Só texto que humano escreve para humano ler — tipo, origem e flag são enum ou FK |
| Alguma FK nova? Apagar o pai deixa órfão? | `ON DELETE RESTRICT`, nunca `SET NULL` |

---

## Rodada 5 — Fora de escopo

Curta. Existe para a mesma discussão não voltar a cada revisão.

| Pergunta | Default a propor |
|---|---|
| O que é tentador incluir e **não** entra agora? | — |
| A v2 fazia algo parecido? Como, e o que deu errado? | Ver `docs/comparativo-fluxos-v2.md` |
| Precisa de notificação, e-mail ou aviso fora da tela? | Não |
| Basta o `audit_log`, ou o histórico precisa de tela? | Basta o `audit_log` |
| Precisa aparecer em relatório ou exportação? | Não |

---

## Perguntas que você nunca faz

- **O que o schema responde.** "Existe `deleted_at` nessa tabela?" é leitura sua,
  não pergunta dele.
- **Implementação.** Qual componente, qual arquivo, como nomear a função, qual
  rota. Isso é a seção Superfície, e você deriva do resto.
- **Preferência de formato.** A spec tem seis seções fixas; não pergunte quais
  usar.
- **Permissão para seguir a convenção do repositório.** `deleted_at`, enum em vez
  de texto, RPC para execução — isso é default, não decisão de produto. Pergunte
  só quando a feature parecer exigir a exceção, e aí pergunte pelo motivo.
