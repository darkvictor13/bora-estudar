# Bora Estudar

Plataforma de estudos para concursos. Um repositório, três entregáveis: o site,
a extensão de navegador e o banco.

| Pacote | O que é |
|---|---|
| `apps/web` | SPA em React + Vite — painéis de aluno e professor |
| `apps/extension` | Extensão MV3 — conduz a bateria no TEC Concursos |
| `apps/e2e` | Suíte Playwright — site e extensão, num navegador de verdade |
| `packages/protocol` | Contrato site ↔ extensão |
| `packages/database` | Tipos gerados do schema Supabase |
| `supabase` | Migrations e seed |

A arquitetura e as razões por trás de cada limite estão em
[`docs/arquitetura.md`](docs/arquitetura.md). Os fluxos da aplicação, no
formato que um teste ponta a ponta precisa, estão em
[`docs/fluxos-e2e.md`](docs/fluxos-e2e.md). O que cada feature faz e por quê,
uma spec por feature, está em [`docs/specs/`](docs/specs/README.md).

Identificadores em inglês, no código e no banco. Comentários, mensagens e
texto de interface em português.

## Começando

Requisitos: Node 22+ (`.nvmrc` fixa a 24), Docker em execução e o
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
| Admin | `admin@boraestudar.local` | `BoraEstudar#2026!` |
| Professor | `professor@boraestudar.local` | `BoraEstudar#2026!` |
| Aluno | `aluno@boraestudar.local` | `BoraEstudar#2026!` |

Credenciais públicas, exclusivas do ambiente local.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o site |
| `npm run check` | `typecheck` + `lint` + `test` em todos os pacotes |
| `npm run db:reset` | Recria o banco: migrations + seed |
| `npm run db:test` | Recria o banco e roda as checagens de invariante |
| `npm run test:e2e` | Volta completa do fluxo da extensão, sem navegador |
| `npm run e2e` | Suíte Playwright completa, no modo mais rápido |
| `npm run e2e:video` | A mesma suíte, gravando um `.webm` por teste |
| `npm run db:types` | Regenera `packages/database` a partir do schema local |
| `npm run ext:build` | Compila a extensão em `apps/extension/dist` |
| `npm run ext:watch` | Recompila a extensão a cada alteração |

Rode `npm run db:types` depois de **toda** migration; o arquivo gerado é
versionado.

## Testes ponta a ponta

`apps/e2e` exercita o produto num Chromium de verdade: as telas de aluno e
professor, a volta completa da bateria e a extensão instalada. Cobre o que
`npm run check`, `npm run db:test` e `npm run test:e2e` não alcançam — a
camada de interface e de fluxo, onde viviam todos os bugs de
[`docs/bugs-encontrados.md`](docs/bugs-encontrados.md).

```bash
npm run db:start          # exige Docker
npm run dev               # opcional: se já estiver no ar, a suíte reaproveita
npm run e2e               # ~45 s, 142 testes
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
professor/aluno, com planejamento, blocos e metas — daí não haver `db:reset`
entre testes, e daí a suíte poder rodar tudo em paralelo. O que fica
compartilhado é só o catálogo de questões, que é leitura, e o `global-setup`
garante que exista.

Duas consequências práticas:

- **O login não passa pelo formulário**, exceto nos testes que o testam. O
  `@supabase/ssr` é usado como o site o usa, mas com armazenamento em memória,
  e os cookies resultantes vão para o navegador.
- **Sobra dado no banco local.** É intencional: cada teste só consulta o
  próprio cenário, e limpar exigiria desligar o gatilho append-only do ledger.
  `npm run db:reset` continua sendo o botão de faxina.

Nenhuma requisição sai para `tecconcursos.com.br`: o domínio é interceptado e
respondido por uma página sintética — automaticamente, em todo teste, para que
um teste novo não escape disso por esquecimento.

## Carregando a extensão

**Firefox** — `about:debugging#/runtime/this-firefox` → "Carregar extensão
temporária" → selecione `apps/extension/dist/manifest.json` (o arquivo, não a
pasta).

**Chrome** — `chrome://extensions` → modo desenvolvedor → "Carregar sem
compactação" → selecione a pasta `apps/extension/dist`.

Um único código-fonte atende os dois: `src/shared/browser.ts` resolve
`browser.*` no Firefox e `chrome.*` no Chrome, ambos com promises.

O que falta para submeter a extensão à revisão da Mozilla está em
[`docs/publicacao-extensao.md`](docs/publicacao-extensao.md).

## Serviços locais

| | |
|---|---|
| Site | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| E-mails de auth | http://127.0.0.1:54324 |
