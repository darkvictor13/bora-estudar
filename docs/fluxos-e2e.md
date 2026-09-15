# Fluxos da aplicação

Catálogo dos fluxos exercitáveis de ponta a ponta: **o id, o que ele cobre,
onde o teste mora e em que estado está**.

A versão anterior deste arquivo descrevia cada fluxo passo a passo, com o
seletor de cada elemento, porque foi escrita ANTES da suíte — era um roteiro de
QA feito percorrendo a aplicação com um navegador. Hoje a suíte existe, casa por
`data-testid` e se lê sozinha: repetir os passos aqui criaria duas descrições do
mesmo comportamento, e a que apodrece é sempre a que não roda. O que ficou é o
que o teste **não** diz: o índice, o ambiente, e o registro do que saiu.

> **O id é o contrato entre spec e teste.** Uma spec cita `F-TEO-04`; o teste
> carrega `F-TEO-04` no `describe`. Renomear um id quebra os dois lados, e é por
> isso que ids não são renumerados — ver as convenções em
> [`specs/README.md`](specs/README.md).

Estado medido em 14/09/2026, com `npm run e2e`: **171 verdes, 8 `fixme`, zero
falhas**.

---

## Como montar o ambiente do teste

```bash
npm run db:start        # exige Docker
npm run db:reset        # ponto de partida conhecido: seed
npm run dev             # http://localhost:3000
npm run e2e             # a suíte, modo rápido
```

`global-setup.ts` **não** roda `supabase db reset`: o reset custa uns 25 s e
cada teste cria o próprio par professor/aluno (`fixtures/scenario.ts`). O que
ele confere é que o banco responde e que o schema está aplicado.

**`npm run db:test` apaga os usuários do seed** — as suítes de invariante
truncam `auth.users` para partir do zero. Rodar `db:reset` depois devolve o
login local.

### Rodando contra um ambiente remoto

A suíte aponta para onde as variáveis mandarem, e roda contra um projeto
hospedado — com quatro ressalvas que custam meia hora cada quando descobertas
na marra:

```bash
E2E_BASE_URL=https://<dominio> \
E2E_SUPABASE_URL=https://<ref>.supabase.co \
E2E_SUPABASE_KEY=sb_publishable_... \
E2E_DATABASE_URL="postgresql://postgres:<senha>@db.<ref>.supabase.co:5432/postgres" \
npm run e2e --workspace @bora/e2e
```

- **`auth.spec.ts` vai falhar.** `support/mailpit.ts` fala a API do Mailpit,
  que não existe fora do ambiente local. Ou aponte `E2E_MAILPIT_URL` para um
  catcher com API compatível, ou exclua esse arquivo da execução.
- **As fixtures apagam usuários.** `fixtures/scenario.ts` escreve direto em
  `auth.users` e limpa o que criou. Não aponte para um ambiente com dado que
  alguém precisa.
- **Use a conexão direta, na 5432** — não o pooler em modo transaction.
- **O `webServer` tem `reuseExistingServer: true`**, então com uma URL remota
  que responde ele não sobe o Vite. É o comportamento desejado, mas significa
  que uma URL remota fora do ar faz o Playwright servir o site local sem avisar.

### Usuários do seed

| Papel | E-mail | Senha |
|---|---|---|
| Professor | `professor@local.dev` | `SenhaLocal#2026` |
| Aluno | `aluno@local.dev` | `SenhaLocal#2026` |

Não há conta de administrador: `user_role` tem dois valores, `teacher` e
`student`. O perfil dos dois é inserido pelo próprio seed — o gatilho de criação
de perfil em `auth.users` não foi portado, e é o que mantém `F-AUTH-08` em
`fixme`.

### Dados do seed

| Objeto | Quantidade | Para quê |
|---|---|---|
| Disciplinas do professor | 4, com peso e meta | distribuição por peso na geração da semana |
| Blocos e aulas por disciplina | 3 e 2 | catálogo do professor |
| Cadernos TEC do planejamento | 1 por disciplina | as metas de bateria têm onde apontar |
| Catálogo de teoria | 1, ligado ao planejamento | o fluxo da teoria |
| Aulas de teoria | 5 por disciplina auditada | progresso por página |
| Disciplina **sem** páginas auditadas | 1 (Raciocínio Lógico) | o diagnóstico de `F-TEO-06` |
| Regras de questões iniciais e de revisão | por disciplina, 2 revisões | `F-TEO-04` e `F-TEO-05` |
| Metas | 2 semanas × 4 | teoria e bateria, agrupadas por dia |
| Registros | nas metas de teoria, espalhados por 20 dias | série temporal de verdade em `/aluno/estatisticas` |

O planejamento começa na segunda-feira da semana corrente, de propósito: um
seed com data fixa envelhece e a semana 1 sai da tela.

`quiz_sessions` e o ledger ficam **fora** do seed. A execução de bateria é de
RPC, as RPCs não voltaram, e fabricar bateria por INSERT produziria desempenho
que nenhuma tela consegue explicar.

### `data-testid`: como a suíte encontra as coisas

O testid nomeia o **papel** do elemento; o que varia entra num `data-*` ao
lado — `data-testid="alert" data-status="error"`, e não `alert-error`. Em
kebab-case, em inglês, e sem o nome da tela. Os helpers estão em
`apps/e2e/support/ui.ts`.

| Área | Testids |
|---|---|
| Casca | `content`, `sidebar`, `sidebar-toggle`, `sidebar-foot`, `nav-item`, `user-chip`, `user-name`, `sign-out`, `theme-toggle`, `theme-unsaved` |
| Primitivas | `alert` (+`data-status`), `badge`, `card`, `metric`, `metric-value`, `page-header`, `empty`, `day-chip` |
| Autenticação | `auth-card`, `auth-overlay` |
| Semana do aluno | `week-hero`, `week-stat`, `week-stat-value`, `day-group`, `day-count`, `goal-row` (+`data-goal-id`, `data-status`), `goal-check`, `goal-actions`, `goal-blocked`, `goal-theory`, `record-study-dialog`, `extra-study-dialog` |
| Teoria | `theory-dialog`, `theory-tabs`, `theory-subject`, `theory-percent`, `theory-review`, `theory-save-continue`, `theory-save-end`, `initial-questions-form`, `initial-questions-count`, `lesson-row` (+`data-lesson-id`) |
| Revisões e reforço | `review-row` (+`data-review-id`), `review-rule`, `spacing-form`, `cycle-row`, `reinforcement-row` |
| Gráficos | `chart-bar`, `chart-point`, `chart-single-value`, `chart-table`, `chart-tooltip`, `ranked-row`, `ranked-target` |
| Professor | `student-card` (+`data-student-id`), `plan-row` (+`data-plan-id`), `plan-dialog`, `plan-activate`, `plan-archive`, `plan-students`, `week-preview`, `preview-goal`, `goals-preview`, `goals-generate`, `goals-confirm`, `quiz-session-row`, `topic-difficulties-empty` |
| Cadernos e catálogo | `notebook-row`, `notebook-form`, `notebook-toggle`, `notebook-remove`, `notebook-restore`, `toggle-removed`, `subject-card`, `subject-item`, `subject-rule-form`, `master-input`, `import-result` |
| Conta | `account-form`, `waitlist-form` |

### Duas armadilhas do harness

1. **`button[type=submit]` também casa o "Sair" da casca.** Todo clique de
   formulário é escopado em `content(page)`. Onde a tela tem dois formulários —
   `/aluno/lista-espera` mostra o cadastro e o resgate de cupom —, clique pelo
   NOME do botão.
2. **Toda figura tem a tabela ao lado.** `chart-table` existe em cada gráfico, e
   é por ela que o teste confere número; ler valor de SVG é ler pixel. É também
   o que torna a tela legível por leitor de tela — ver `F-EST-01`.

### Isolando o TEC Concursos

O site linka para `https://www.tecconcursos.com.br` no caderno e na revisão. A
suíte intercepta `**://*.tecconcursos.com.br/**` automaticamente, em todo
teste, e responde localmente — nenhuma requisição pode sair para o site de
terceiro, inclusive num teste novo escrito por quem não leu isto.

---

## Mapa das rotas

| Rota | Papel | Guarda |
|---|---|---|
| `/` | — | redireciona para a home do papel, ou `/entrar` |
| `/entrar`, `/cadastro`, `/recuperar-senha` | anônimo | com sessão, redireciona para a home |
| `/redefinir-senha`, `/confirmar` | link do e-mail | sem sessão, mostra "link expirou" |
| `/aluno`, `/aluno/planejamento`, `/aluno/teoria`, `/aluno/disciplinas`, `/aluno/cadernos`, `/aluno/estatisticas`, `/aluno/revisoes` | aluno | exige acesso vigente |
| `/aluno/conta`, `/aluno/lista-espera` | aluno | alcançáveis sem liberação — é por elas que se pede acesso |
| `/professor`, `/professor/planejamentos`, `/professor/metas`, `/professor/teoria`, `/professor/cadernos`, `/professor/revisoes`, `/professor/estatisticas`, `/professor/conta` | professor | papel `teacher` |
| `/professor/alunos/:studentId` | professor | `notFound()` sem vínculo vigente |

A lista vive duplicada em `apps/e2e/support/routes.ts`, de propósito: tela
protegida nova que não entre lá deixa `F-AUTH-01` contando as rotas antigas, e o
diff mostra a omissão.

---

## O catálogo

### Autenticação e conta — `tests/auth.spec.ts`

| Id | Cobre |
|---|---|
| F-AUTH-01 | anônimo é mandado para o login, em toda rota protegida |
| F-AUTH-02/03 | credencial recusada, sem revelar se a conta existe; campos vazios validados pela action |
| F-AUTH-04 | login leva cada papel para a própria casa |
| F-AUTH-05 | papel errado é devolvido para a própria casa |
| F-AUTH-06 | tela pública com sessão ativa redireciona |
| F-AUTH-07 | logout apaga o cookie e a área volta a barrar |
| F-AUTH-08 | cadastro público cria o perfil e cai na lista de espera — **`fixme`** |
| F-AUTH-09 | validações do cadastro: nome curto, senha curta, e-mail repetido |
| F-AUTH-10/11/12 | recuperação de senha, do pedido à senha nova; link expirado; validações |
| F-CONTA-01 | meus dados: o nome salva, o resto é contexto — `tests/student-analysis.spec.ts` |

### Casca e navegação — `tests/shell.spec.ts`

| Id | Cobre |
|---|---|
| F-UI-01 | recolher a barra lateral, e o conteúdo ganhar a largura |
| F-UI-02 | o estado persiste entre navegação e recarregamento |
| F-UI-03 | `aria-expanded` acompanha, e o rótulo diz a ação |
| F-UI-04/05/06 | mostrar e ocultar a senha; o botão não submete; começa sempre oculta — `tests/auth.spec.ts` |
| F-UI-07 | abaixo de 820px a barra recolhe à força |
| F-UI-08 | o item ativo é o da rota mais específica, e só ele |
| F-UI-09 | o rodapé identifica quem está logado, nos dois papéis |
| F-UI-10 | sem acesso liberado, os itens de estudo ficam inertes e os da conta não |

### Aluno — semana e execução — `tests/student-week.spec.ts`

| Id | Cobre |
|---|---|
| F-META-01 | os quatro números do cabeçalho saem dos REGISTROS, não das metas |
| F-META-02 | a semana escolhida mora na URL, e o botão voltar funciona |
| F-META-03 | registrar estudo entra no ledger e **não** conclui a meta; dois registros somam |
| F-META-04 | concluir e reabrir devolve o estado que os registros justificam |
| F-META-05 | meta de bateria não se mexe pela tela |
| F-META-06 | aluno sem planejamento ativo: as três telas explicam em vez de quebrar |
| F-META-07 | planejamento em rascunho é o mesmo que nenhum |
| F-EXTRA-01 | estudo fora das metas: cria meta e registro numa operação só |
| F-PLAN-01 | o planejamento como o aluno o vê: identidade, números e ciclo por peso |
| F-DISC-01 | disciplinas e blocos, só leitura |
| F-ALU-01 | todas as telas do aluno abrem — `tests/student.spec.ts` |

### Aluno — teoria — `tests/student-theory.spec.ts`

| Id | Cobre |
|---|---|
| F-TEO-01 | o modal abre na primeira aula não concluída, com as três abas |
| F-TEO-02 | o progresso é por página, preso ao intervalo auditado, e continua de onde parou |
| F-TEO-03 | encerrar a sessão grava a página e **não** conclui a aula |
| F-TEO-04 | as questões iniciais liberam a próxima aula, e entram no ledger da meta |
| F-TEO-05 | a revisão nasce pela regra, não bloqueia o avanço, e fecha no mínimo |
| F-TEO-06 | disciplina fora do catálogo auditado recebe diagnóstico, não página inventada |
| F-TEO-07 | o controle por disciplina: aula atual, progresso e revisões vencidas |

### Aluno — análise, revisão e conta — `tests/student-analysis.spec.ts`

| Id | Cobre |
|---|---|
| F-EST-01 | os números vêm do ledger; toda figura traz a tabela; um ponto vira número; sem registro, a tela diz isso |
| F-REV-01 | a grade de revisão mostra o espaçamento do professor; a vencida é marcada; o reforço tem lugar próprio |
| F-ESP-01 | lista de espera: a inscrição grava e pode ser corrigida enquanto o professor não responde |
| F-CUP-01 | resgatar cupom libera o acesso — **`fixme`** |
| F-CAD-01 | cadernos TEC do aluno: lista por disciplina, com link e sem botão de bateria |

### Professor — `tests/teacher.spec.ts`

| Id | Cobre |
|---|---|
| F-PROF-01 | todas as telas do professor abrem |
| F-PROF-02 | a lista abre pelos atrasados; filtros somam; o recorte fica na URL |
| F-PROF-03 | a ficha do aluno é uma ROTA; aluno de outro professor não existe; a tela diz o que ainda não dá para fazer |
| F-PROF-04 | a prévia vem antes da escrita, e não grava nada |
| F-PROF-05 | a substituição segura preserva a meta concluída; replanejar a semana exige confirmação |
| F-PROF-06 | copiar a semana anterior copia o PLANO, nunca o resultado |
| F-GPLAN-01 | planejamento nasce pausado; ativar arquiva o anterior; arquivar tira da vista do aluno |
| F-CAD-01 | cadernos: desativar tira do aluno; remover é MARCAR; restaurar traz de volta |
| F-TCAT-01 | catálogo de teoria: regras por disciplina, até cinco revisões, páginas auditadas, vínculo com o planejamento |
| F-TREV-01 | é na tela do professor que o espaçamento se configura |
| F-TEST-01 | estatísticas do professor: as mesmas do aluno, apontadas para o planejamento dele |
| F-VINC | liberar acesso, suspender, vincular candidato — **3 `fixme`** |
| F-ANUL | anular bateria sem sumir do histórico — **`fixme`** |

### Isolamento — `tests/isolation.spec.ts`

| Id | Cobre |
|---|---|
| F-ISO-01 | o aluno 2 não vê nada do aluno 1; o professor 2 não vê o aluno 1 em tela nenhuma |
| F-ISO-02 | a query string não é uma porta: `?plano=`, `?catalogo=` e semana alheia são ignorados |

O isolamento pelo lado de FORA da interface — chamada direta à API, sem tela —
é assunto de `supabase/tests/`, e não daqui.

### Tema — `tests/theme.spec.ts`

| Id | Cobre |
|---|---|
| F-TEMA-01 | escolher o tema aplica na hora, fica guardado e sobrevive ao recarregar |
| F-TEMA-02 | a escolha é da conta, e aparece em outro navegador — **`fixme`** |
| F-TEMA-03 | sem piscada: o documento já está escuro antes de a rota renderizar |
| F-TEMA-04 | quando a gravação falha, a tela avisa — **`fixme`** |
| F-TEMA-05 | sair apaga a cópia local e o próximo não herda |
| F-TEMA-06 | os dois papéis |
| F-TEMA-07 | contraste AA nos dois temas, medido em cada tela |
| F-TEMA-08 | sem escolha, abre claro mesmo com o sistema no escuro |

---

## Os oito `fixme`, e por que continuam visíveis

Nenhum é bug de interface: os cinco primeiros esperam o banco, e os dois do tema
esperam a mesma coluna. Ficam como `fixme` em vez de apagados porque um teste
que some leva a falta junto — e um que passa sem exercitar nada é pior ainda.

| Fluxo | O que falta |
|---|---|
| F-AUTH-08 | o gatilho de criação de perfil em `auth.users`, e a decisão de produto que ele embute: a qual professor um aluno sem metadado é anexado |
| F-CUP-01 | a RPC de resgate. `coupons` está com RLS ligada, zero policy e zero grant, de propósito |
| F-VINC (3) | liberar e suspender acesso precisam nascer como RPC: `access_status` e `access_expires_at` estão fora do `GRANT UPDATE` de `profiles` |
| F-ANUL | `void_quiz_session` não foi portada, e `quiz_sessions` é SELECT |
| F-TEMA-02, F-TEMA-04 | uma coluna `theme_preference` em `profiles`. Enquanto não existir, a escolha vale por aparelho |

A mesma lista, do lado do banco, está em
[`de-para-schema.md`](de-para-schema.md); do lado da interface, em
[`plano-v2-react-mui.md`](plano-v2-react-mui.md).

---

## O que saiu, e para onde foi

A suíte tinha 142 testes antes da reconstrução, e a maior parte dos ids deste
catálogo vinha de fluxos que hoje não existem. Duas causas, e nenhuma delas é
"o teste era ruim":

**A extensão de navegador saiu** (`8569f1a`), e com ela `tests/quiz.spec.ts` e
`tests/extension.spec.ts`. Morreram junto os fluxos de EXECUÇÃO de bateria —
`F-BAT-01` a `F-BAT-19`, `F-FASE-01` a `F-FASE-06`, `F-TOPI-01/02/03`,
`F-PAIN-01` a `F-PAIN-06` e `F-LIVR-01` a `F-LIVR-05`. O que eles descreviam
continua registrado nas specs [05](specs/05-bateria-inteligente.md),
[06](specs/06-protocolo-site-extensao.md), [07](specs/07-motor-de-selecao.md),
[21](specs/21-fases-na-extensao.md), [22](specs/22-rodizio-por-topico.md),
[28](specs/28-painel-arrastavel-e-topicos.md) e
[31](specs/31-iniciar-bateria-pelo-caderno.md), que são o material de partida de
quem for desenhar a execução nova.

**As telas foram reescritas a partir da v2** (fases 2 a 7 do plano), e os fluxos
que sobreviveram mudaram de nome junto com a tela. O mapa, para quem procurar um
id antigo num comentário de código ou numa mensagem de commit:

| Id antigo | Hoje |
|---|---|
| F-ALU-02 (seletor de semana) | F-META-02 |
| F-ALU-03 e F-LIVR-\* (cadernos) | F-CAD-01 |
| F-ALU-04 (meus dados) | F-CONTA-01 |
| F-ALU-05 (lista de espera) | F-ESP-01 |
| F-ALU-06 (sem planejamento) | F-META-06 e F-META-07 |
| F-CONC-\* (concluir meta) | F-META-03 e F-META-04 |
| F-EXTRA-02 a 06 | F-EXTRA-01 |
| F-REVE-\* (revisão espaçada) | F-REV-01, e F-TREV-01 do lado do professor |
| F-TEMP-\* (tempo e série) | F-EST-01 |
| F-PREV-\* (prévia e distribuição) | F-PROF-04 e F-PROF-05 |
| F-TURMA-\* (ficha da turma) | F-PROF-02 |
| F-GPLAN-02 a 07 | F-GPLAN-01 |
| F-CAD-02 a 06 | F-CAD-01 |
| F-RCIC-\*, F-RESU-\*, F-DIFI-\* | sem cobertura: dependem do motor de baterias |
| F-CUP-02 a 04 | sem cobertura enquanto F-CUP-01 estiver `fixme` |

O mesmo mapa está no cabeçalho de `tests/student.spec.ts` e de
`tests/teacher.spec.ts`, ao lado do código que o cumpre. O histórico completo
dos testes apagados está em `git show 8569f1a:apps/e2e/tests/student.spec.ts`.

---

## Como acrescentar um fluxo

1. **O id nasce com a spec**, não com o teste — ver
   [`specs/README.md`](specs/README.md). Sem spec, o teste não tem critério de
   aceitação a citar.
2. **O prefixo é da ÁREA**, não da tela: `F-TEO` serve ao modal e ao controle
   por disciplina. Prefixo por tela multiplica ids quando a tela é dividida.
3. **Um `describe` por id**, com o id no começo do título: é o que faz
   `npx playwright test -g F-TEO-04` funcionar.
4. **Selecione por `data-testid`**, e acrescente o testid novo à tabela deste
   arquivo no mesmo commit.
5. **Acrescente a linha ao catálogo acima.** Um fluxo que roda e não está aqui
   é invisível para quem escreve a próxima spec.
