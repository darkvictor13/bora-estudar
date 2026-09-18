# Arquitetura

O repositório entrega duas coisas que precisam evoluir juntas: o site e o
banco. Elas estão no mesmo repositório porque compartilham contratos que,
quando versionados separadamente, derivam.

> **A extensão de navegador foi removida**, e com ela `packages/protocol`. Este
> documento guarda o registro do que ela era e do que ficou no lugar — o que
> ainda descreve o sistema está no presente; o que descreve a extensão está
> marcado como histórico.

## Mapa

```
bora-estudar/
├── apps/
│   ├── web/                 # SPA React + MUI + Vite — painéis de aluno e professor
│   └── e2e/                 # Suíte Playwright, contra o site
├── packages/
│   ├── ui/                  # @bora/ui — tokens, tema e primitivas (com playground)
│   └── database/            # Tipos gerados do schema Supabase
├── supabase/
│   ├── config.toml
│   ├── migrations/          # Schema versionado
│   ├── seed.sql             # Usuários e dados de desenvolvimento
│   └── tests/               # 86 asserções de invariante, em 8 suítes (npm run db:test)
└── docs/
```

`docs/fluxos-e2e.md` cataloga os fluxos exercitáveis de ponta a ponta, no
formato que um teste e2e precisa. `docs/bugs-encontrados.md` registra a
varredura de QA que produziu esse catálogo.

Workspaces do npm. Sem Turborepo, Lerna ou pnpm: quatro pacotes não justificam
uma camada extra de orquestração, e `npm run <script> --workspaces` resolve.

## Idioma

Identificadores em inglês — no TypeScript e também no banco: tabelas, colunas,
enums, valores de enum e funções. Comentários, mensagens de erro, texto de
interface e descrições de teste em português, porque é o idioma do time e do
usuário final.

## Por que os limites estão onde estão

### `packages/protocol` era o núcleo da decisão — histórico

Site e extensão trocavam dados pelo fragmento (`#`) da URL, e esse contrato era
a peça mais frágil do sistema: as duas pontas eram versionadas separadamente na
prática — o site atualizava sozinho, a extensão só quando o usuário quisesse.
Por isso existia **uma** definição, importada pelos dois, com `PROTOCOL_VERSION`
comparada em toda leitura e validação de runtime na fronteira.

Duas lições dali continuam valendo para qualquer fronteira que venha a
substituí-la:

- **uma definição só, importada pelas duas pontas.** Na versão anterior do
  produto cada lado mantinha sua cópia das formas de payload, e elas derivaram;
  o sintoma aparecia só em runtime, quando um campo chegava faltando;
- **admitir o que não se sabe.** O payload levava `historyComplete: boolean`
  para o site poder dizer que não conseguiu carregar o histórico inteiro. A
  versão anterior marcava o histórico como autoritativo mesmo truncado, e o
  motor passava a repetir questões em silêncio.

### `packages/database` é separado de `web`

Os tipos vêm de `supabase gen types` e são versionados. Ficam num pacote, e não
dentro de `apps/web`, por dois motivos: o diff de cada migration mostra o
impacto na superfície de tipos, e Edge Functions futuras consomem os mesmos
tipos sem depender do app.

### A interface fala com um contrato, não com o Supabase

`apps/web/src/lib/api/` expõe funções tipadas por caso de uso — `loadWeek`,
`saveTheoryProgress`, `generateWeek`. A interface importa daí e de nenhum outro
lugar; qual implementação atende (`supabase` ou `fixtures`) é decidido uma vez,
por variável de ambiente, no carregamento do módulo.

A camada nasceu na reconstrução da v2 por uma razão de cronograma — as telas
foram escritas enquanto o schema ainda mudava —, mas o que a mantém é outra
coisa: **é onde a falta fica visível**. As seis operações que o banco não
permite lançam ali, com o motivo e o caminho do de-para na mensagem, em vez de
cada tela inventar o próprio jeito de recusar. Quando a RPC nascer, muda um
arquivo de `lib/api/supabase/` e nenhuma tela.

`contract.ts` é, por isso, o pedido formal ao banco: a lista de operações que a
interface precisa, com os tipos de entrada e saída já travados.

### `packages/ui` é pacote, e não pasta dentro de `web`

O tema tem `npm run typecheck` e um playground que valem por si: revisar uma
primitiva sem subir o app inteiro é o que evita que o design system derive para
"o que a tela do momento precisava". Os testes de contraste
(`packages/ui/src/contrast.test.ts`) rodam contra os tokens, não contra a tela —
uma cor que quebra AA falha no pacote, antes de existir tela que a use.

### A extensão não falava com o Supabase — histórico

Ela recebia um payload do site e devolvia outro. Nunca via uma chave do
Supabase, nunca abria conexão com o banco: o pacote distribuído na loja não
carregava credencial, e toda regra de negócio permanecia atrás das RPCs, onde é
verificável. É a mesma exigência que qualquer superfície de execução nova
precisa cumprir.

## Fluxo de uma bateria

**A execução não existe hoje.** O caminho abaixo é o que havia até a remoção da
extensão, e está aqui porque o banco continua exatamente assim — quem desenhar a
execução nova encaixa no mesmo ledger.

```
  aluno pede para iniciar
        │
  web ──┤ RPC start_quiz_session ──────────────► supabase
        │ ◄── quiz_session (id, session_number, main_target)
        │
        │ [removido] payload com o catálogo do bloco e o histórico do aluno
        ▼
  [removido] a extensão conduzia as questões no TEC e devolvia o resultado
        │
        ▼
  web ──► RPC finish_quiz_session (idempotente por requestId)
        │
        ▼
  aluno registra o tempo ──► RPC record_quiz_session_time ──► goal concluída
```

Do que sobrou, sobrou o BANCO: `quiz_sessions` com a máquina de estados inteira,
o ledger com as três fases e as FKs compostas que amarram sessão, meta e
caderno. Nenhuma das RPCs foi portada para o schema de 14/09/2026 — nem
`start_quiz_session`, nem `finish_quiz_session`, nem
`record_quiz_session_time` —, então hoje não há caminho nenhum que abra uma
bateria. As telas que a pressupõem dizem isso em vez de oferecer um botão que
falha.

Duas propriedades do desenho antigo valem ser lembradas antes de escrever o
novo, porque cada uma corresponde a uma perda real de bateria já respondida:
**confirmar a gravação antes de descartar a única cópia do resultado**, e
**gerar o `request_id` uma vez, na origem, reusando-o em toda retentativa**.

## Banco

O contrato está em `supabase/migrations`. O schema foi **recriado em 14/09/2026 a
partir do banco de produção**, com a auditoria aplicada: o de-para coluna a
coluna está em [`de-para-schema.md`](de-para-schema.md). Resumo do que a
arquitetura assume hoje:

- `quiz_session_questions` é um ledger append-only e a única fonte de
  desempenho da bateria; a escrita dele é de RPC, e nenhuma RPC de execução foi
  portada ainda — ver *Decisões pendentes*;
- a escrita se divide entre planejar e executar: o professor grava DIRETO em
  `study_plans`, `study_plan_notebooks` e `goals`, restrito por RLS e por
  **grant de coluna**; as tabelas de execução (`quiz_sessions`,
  `quiz_session_questions`, `reinforcement_cycles`) são SELECT e nada mais;
- **a RLS decide qual LINHA, nunca qual COLUNA.** O que impede um UPDATE
  legítimo de carregar junto a troca de dono é o grant por coluna, e o que
  impede o aluno de reescrever o planejamento são os gatilhos de `app_private`;
- as FKs que carregam contexto são **compostas** — `(study_plan_id, teacher_id,
  student_id)` e parentes. A FK de coluna única garantia que a linha EXISTE, não
  que ela é de quem está escrevendo;
- o que é administrativo (`role`, `access_status`, `access_expires_at`,
  `teacher_id`) fica fora de todo grant. `teacher_id`, `access_status` e
  `access_expires_at` ganharam RPC em `20260918120000` (`link_student` e
  `set_student_access`); `role` continua sem escritor no produto, e resgatar
  cupom e anular bateria **ainda precisam nascer como RPC**.

### Linha de base do schema

Contagens conferidas por consulta ao banco, para servir de referência quando
alguém precisar saber se algo regrediu:

| | |
|---|---|
| Tabelas | 24, todas com RLS habilitada |
| Policies | 62 |
| Views | 1 (`vw_quiz_session_performance`), com `security_invoker = true` |
| Tipos enumerados | 12 |
| Foreign keys | 53, sendo 14 compostas |
| Privilégio para `anon` | zero, em tabela nenhuma |
| Funções | 14 (`public` + `app_private`), das quais 5 com `execute` para `authenticated` |
| Gatilho de criação de perfil | **ausente** — não foi portado |

As cinco funções com grant são os predicados que as policies usam —
`is_teacher`, `is_teacher_of`, `can_access_teacher`, `has_active_access` e
`my_teacher`. As de gatilho vivem em `app_private` e não recebem `execute` de
ninguém: rodam pelo gatilho, com o privilégio do dono.

A ausência do gatilho de perfil é o que mantém `F-AUTH-08` em `fixme` — o
cadastro cria o usuário no GoTrue e para aí. Ele embute uma decisão de produto
que ainda falta: a qual professor um aluno sem metadado é anexado.

Todos estes números são conferidos por `supabase/tests/07_schema.sql`, que falha
quando um deles muda — e a mensagem manda atualizar a tabela equivalente do
de-para junto.

### Duas medidas de desempenho — histórico

> As duas views que sustentavam esta seção (`vw_block_performance` e
> `vw_block_errors`) não foram portadas, e `record_reinforcement` também não. A
> distinção continua valendo como DECISÃO DE PRODUTO e volta junto com o motor
> de baterias; o que a implementava não existe hoje.

O produto distingue, desde a v93, duas coisas que costumam ser confundidas:

- **desempenho oficial** — acertos sobre questões `main`. É a nota da meta e o
  critério de ordenação dos blocos;
- **aproveitamento total** — acertos sobre `main` + `extra` + `reinforcement`.

As duas saem do mesmo ledger, por `vw_block_performance`. O caderno de erros
(`vw_block_errors`) reúne as três fases, cada questão rotulada com a fase da
ocorrência mais recente.

O reforço automático a cada três sessões continua avaliando **somente** as
principais — `record_reinforcement` soma `main_count`/`main_correct` e exige
revisão apenas dos erros de `phase = 'main'`.

`npm run db:test` recria a base e roda **86 asserções** em oito suítes,
organizadas por DEFESA e não por feature: grant por coluna, isolamento de RLS,
os cinco gatilhos que protegem a meta, o perfil, a lista de espera, a teoria e
os invariantes do schema inteiro. Cada asserção que testa um estado proibido usa
`raise exception` se o banco aceitar — então a suíte falha quando uma constraint
desaparece, não só quando o código quebra.

As suítes atacam a fronteira **pelo lado de fora da interface**: nenhum teste de
tela tenta `PATCH /profiles?role=teacher`, que é o que uma chamada direta à API
faria. É por isso que elas não são redundantes com o e2e.

`supabase/seed.sql` insere direto, e não mais pelas RPCs — elas não existem
neste schema, e a fronteira mudou junto: planejar é escrita direta com RLS e
grant por coluna. Inserir ali é percorrer o mesmo caminho da tela do professor.

## O site é uma SPA, e por que isso é possível

`apps/web` é React servido por Vite: arquivo estático, sem servidor de
aplicação. Isso não é uma escolha de conveniência — é uma consequência de onde
a fronteira de segurança está.

Nada no site guarda segredo. Toda leitura passa por RLS, toda escrita de
execução passa por RPC, e o bundle carrega apenas a publishable key, que é
pública por definição. Não existe caminho em que o front decida o que a pessoa
pode ver: quem decide é o banco. Retirar a camada de servidor não afrouxou
nenhuma verificação porque nenhuma verificação morava nela.

O que a camada de servidor de fato fazia era atender ao framework. Dois
arquivos existiam só por isso, e o comentário de ambos dizia a razão em voz
alta — "só Route Handler grava cookie", "Server Component não consegue gravar
cookie". No navegador, gravar cookie é o comportamento normal do cliente do
Supabase, então os dois desapareceram.

O que se perdeu, explicitamente: não há mais HTML renderizado no servidor, e a
primeira pintura espera a cascata de sessão (validar token, ler perfil, ler
assinatura). Como toda tela é painel autenticado e não existe superfície de
marketing, nenhuma delas dependia de SEO nem de primeira pintura instantânea.
Também não há mais status HTTP 404: o servidor devolve o mesmo `index.html` para
qualquer caminho, e "este aluno não é seu" é uma decisão que depende de
autenticação e RLS — coisas que só acontecem depois de a página carregar.

### Roteamento

A árvore de rotas está em `src/router.tsx`, explícita numa estrutura de dados.
Cada tela é um arquivo em `src/routes/`, e o dado de cada uma vem de um `loader`
— que é o corpo do componente assíncrono de antes, movido para fora da
renderização, sem mudar uma consulta.

Duas coisas que o framework fazia e agora são explícitas:

- **título da aba** — declarado no `handle` da rota e aplicado por um efeito
  único em `RootLayout`, no lugar de `export const metadata` em 19 arquivos;
- **redirecionar e revalidar depois de uma action** — a action devolve
  `redirectTo` ou `success`, e `useFormActionState` executa. É o par
  `redirect()` + `revalidatePath()` de antes, num lugar só.

Os formulários não mudaram de forma: `useActionState` e `useFormStatus` são
React 19, não do framework, e aceitam função async comum.

O controle de acesso mora em duas camadas:

1. o `loader` do layout de cada área chama `requireRole`, que redireciona para a
   home do papel real quando o papel não bate;
2. o `loader` de cada tela de estudo chama `requireStudentAccess`, que exige
   assinatura ativa. Conta e lista de espera ficam de fora dessa exigência —
   quem ainda aguarda liberação precisa conseguir se cadastrar.

A renovação do token deixou de precisar de camada própria: o cliente do
Supabase no navegador renova sozinho, o que dispensa o `proxy.ts` que rodava
antes de cada renderização.

Vale repetir o que isso NÃO é: essas duas camadas são conveniência de
navegação, não segurança. Quem recusa acesso a dado é a RLS. Uma guarda de
rota no cliente pode ser burlada por qualquer pessoa com um console aberto, e
continua não rendendo uma linha de outro aluno.

`src/lib/routes.ts` é a única fonte dos caminhos; nada monta URL na mão — nem a
sidebar, nem os redirecionamentos, nem a árvore de rotas.

### A sessão é consultada uma vez por navegação

`getSessionContext()` memoiza a consulta **em voo**, e só ela. O React Router
dispara os loaders de todas as rotas casadas em paralelo, então o layout da
área e a página pedem o contexto no mesmo instante; sem a memoização seriam
duas idas ao servidor de auth e quatro consultas por navegação.

A memoização é liberada quando a consulta termina, de propósito: guardar o
contexto entre navegações deixaria `hasAccess` velho, e o aluno cujo acesso o
professor acabou de liberar continuaria empurrado para a lista de espera até
recarregar a página.

## Decisões pendentes

- ~~**Admin não enxerga dado de domínio.**~~ Sem efeito: `user_role` tem dois
  valores no schema de 14/09/2026, `teacher` e `student`. Não há mais papel
  admin para acomodar, e `can_view_context` deu lugar a `can_access_teacher` e
  `is_teacher_of`. Uma área de administração, se nascer, nasce com um papel novo
  e uma decisão nova.
- **As três operações que o banco ainda não permite.** Anular bateria, resgatar
  cupom e selecionar as matérias do ciclo lançam com o motivo em
  `lib/api/supabase/`, em vez de recusar em silêncio. Nas três a defesa do banco
  é a certa: o que falta é a RPC `security definer` que valida do lado do
  servidor. A quarta, o tema na conta, espera uma coluna `theme_preference` em
  `profiles`.

  **Eram seis.** Liberar acesso, suspender acesso e vincular candidato saíram em
  18/09/2026, com a migration `20260918120000` e a spec 13 — e promover a
  professor, que nunca esteve nesta lista, continua sendo o `update` deliberado
  de quem tem a chave do banco.
- **Como o aluno responde uma bateria.** É a pendência que a remoção da
  extensão abriu, e a maior: o banco tem a sessão, o ledger e as três fases;
  não há superfície que as execute. Enquanto não houver, a tela do aluno abre
  nenhuma bateria — de propósito, para não produzir sessão travada.
- ~~**Reforços e extras na extensão.**~~ Sem efeito: as três fases eram
  conduzidas pelo content script, que saiu. As fases continuam no schema
  (`question_phase`) e nos agregados.
- ~~**Correlação de tópico na seleção.**~~ Sem efeito pelo mesmo motivo: o
  rodízio por tópico vivia no motor da extensão. O tópico continua no catálogo
  e no ledger, que é o que uma seleção nova precisa.
