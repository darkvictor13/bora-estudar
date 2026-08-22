# Bora Estudar

Plataforma de estudos para concursos. Um repositório, três entregáveis: o site,
a extensão de navegador e o banco.

| Pacote | O que é |
|---|---|
| `apps/web` | Next.js 16 — painéis de aluno e professor |
| `apps/extension` | Extensão MV3 — conduz a bateria no TEC Concursos |
| `packages/protocol` | Contrato site ↔ extensão |
| `packages/database` | Tipos gerados do schema Supabase |
| `supabase` | Migrations e seed |

A arquitetura e as razões por trás de cada limite estão em
[`docs/arquitetura.md`](docs/arquitetura.md).

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
| `npm run db:test` | Recria o banco e roda as 59 checagens de invariante |
| `npm run db:types` | Regenera `packages/database` a partir do schema local |
| `npm run ext:build` | Compila a extensão em `apps/extension/dist` |
| `npm run ext:watch` | Recompila a extensão a cada alteração |

Rode `npm run db:types` depois de **toda** migration; o arquivo gerado é
versionado.

## Carregando a extensão

**Firefox** — `about:debugging#/runtime/this-firefox` → "Carregar extensão
temporária" → selecione `apps/extension/dist/manifest.json` (o arquivo, não a
pasta).

**Chrome** — `chrome://extensions` → modo desenvolvedor → "Carregar sem
compactação" → selecione a pasta `apps/extension/dist`.

Um único código-fonte atende os dois: `src/shared/browser.ts` resolve
`browser.*` no Firefox e `chrome.*` no Chrome, ambos com promises.

## Serviços locais

| | |
|---|---|
| Site | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| E-mails de auth | http://127.0.0.1:54324 |
