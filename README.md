# Bora Estudar

Plataforma de estudos para concursos. Um repositório, dois entregáveis: o site
e o banco.

| Pacote | O que é |
|---|---|
| `apps/web` | SPA em React + MUI + Vite — painéis de aluno e professor |
| `apps/e2e` | Suíte Playwright — o site num navegador de verdade |
| `packages/ui` | `@bora/ui` — tokens, tema e primitivas, com playground |
| `packages/database` | Tipos gerados do schema Supabase |
| `supabase` | Migrations, seed e as suítes de invariante |

> **A extensão de navegador foi removida**, e a execução de bateria saiu com
> ela. O banco continua com as TABELAS do fluxo — `quiz_sessions`, o ledger
> `quiz_session_questions` e os ciclos de reforço, com a máquina de estados
> inteira —, mas nenhuma das RPCs foi portada para o schema de 14/09/2026. Quem
> for desenhar a execução nova encontra o ledger intacto e a superfície vazia.
> As telas que a pressupõem dizem isso, em vez de oferecer um botão que falha.

A arquitetura e as razões por trás de cada limite estão em
[`docs/arquitetura.md`](docs/arquitetura.md). Os fluxos da aplicação, no
formato que um teste ponta a ponta precisa, estão em
[`docs/fluxos-e2e.md`](docs/fluxos-e2e.md). O que cada feature faz e por quê,
uma spec por feature, está em [`docs/specs/`](docs/specs/README.md).

Identificadores em inglês, no código e no banco. Comentários, mensagens e
texto de interface em português.

## Começando

Requisitos: **Node 24** (`.nvmrc`; o runner de teste precisa de um build com
suporte a TypeScript), Docker em execução e o
[CLI do Supabase](https://supabase.com/docs/guides/local-development).

```bash
npm install
npm run db:start          # sobe o Supabase local
cp apps/web/.env.example apps/web/.env.local
npm run dev               # http://localhost:3000
```

O `db:start` aplica migrations e seed. Usuários de desenvolvimento:

| Papel | E-mail | Senha |
|---|---|---|
| Professor | `professor@local.dev` | `SenhaLocal#2026` |
| Aluno | `aluno@local.dev` | `SenhaLocal#2026` |

Credenciais públicas, exclusivas do ambiente local.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o site |
| `npm run check` | `typecheck` + `lint` + `test` em todos os pacotes |
| `npm run db:reset` | Recria o banco: migrations + seed |
| `npm run db:test` | Recria o banco e roda as 86 asserções de invariante (**apaga o seed**: rode `db:reset` depois) |
| `npm run e2e` | Suíte Playwright completa, no modo mais rápido |
| `npm run e2e:video` | A mesma suíte, gravando um `.webm` por teste |
| `npm run db:types` | Regenera `packages/database` a partir do schema local |

Rode `npm run db:types` depois de **toda** migration; o arquivo gerado é
versionado.

## Testes ponta a ponta

`apps/e2e` exercita o produto num Chromium de verdade: as telas de aluno e
professor. Cobre o que `npm run check` e `npm run db:test` não alcançam — a
camada de interface e de fluxo, onde viviam todos os bugs de
[`docs/bugs-encontrados.md`](docs/bugs-encontrados.md).

```bash
npm run db:start          # exige Docker
npm run dev               # opcional: se já estiver no ar, a suíte reaproveita
npm run e2e               # a suíte do site
npm run e2e:video         # a mesma suíte, com vídeo
```

Os dois comandos rodam **a mesma suíte**; muda só o que se guarda:

| | `e2e` | `e2e:video` |
|---|---|---|
| Vídeo, trace, screenshot | nenhum | `.webm` por teste, trace, screenshot na falha |
| Workers | núcleos − 2 | metade disso |
| Para que serve | rodar antes de commitar | ver o que aconteceu, e mostrar para alguém |

O vídeo sai em `apps/e2e/test-results/<teste>/video.webm`, e o caminho de cada
arquivo é listado no fim da execução.

### Como a suíte se isola

Nenhum teste usa o aluno do seed. Cada um cria o **próprio** par
professor/aluno, com planejamento, cadernos e metas — daí não haver `db:reset`
entre testes, e daí a suíte poder rodar tudo em paralelo. O `global-setup` só
confere que o banco responde e que o schema está aplicado; ele não prepara
catálogo, porque não há catálogo de questões neste schema.

Duas consequências práticas:

- **O login não passa pelo formulário**, exceto nos testes que o testam. O
  `@supabase/ssr` é usado como o site o usa, mas com armazenamento em memória,
  e os cookies resultantes vão para o navegador.
- **Sobra dado no banco local.** É intencional: cada teste só consulta o
  próprio cenário, e limpar exigiria desligar o gatilho append-only do ledger.
  `npm run db:reset` continua sendo o botão de faxina.

Nenhuma requisição sai para `tecconcursos.com.br`: o site ainda linka para lá
no caderno de erros e no reforço, e o domínio é interceptado e respondido
localmente — automaticamente, em todo teste, para que um teste novo não escape
disso por esquecimento.

## Serviços locais

| | |
|---|---|
| Site | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| E-mails de auth | http://127.0.0.1:54324 |
