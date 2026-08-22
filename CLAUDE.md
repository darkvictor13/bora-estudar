# Regras de desenvolvimento

Convenções deste repositório. A arquitetura e o porquê de cada limite estão em
[`docs/arquitetura.md`](docs/arquitetura.md) — leia antes de mexer em fronteira
entre pacotes.

---

## Idioma

**Identificadores em inglês. Texto em português.**

| Em inglês | Em português |
|---|---|
| variáveis, funções, tipos, arquivos | comentários |
| tabelas, colunas, enums e seus valores | mensagens de `raise exception` |
| funções e parâmetros SQL | texto de interface |
| chaves de JSON expostas em API | descrições de teste |
| nomes de constraint, índice e policy | documentação |

O produto é para concurseiros brasileiros e o time é brasileiro: o que a pessoa
lê fica em português. O que o compilador lê fica em inglês.

Cuidado com palavras que traduzem para duas coisas diferentes conforme o
contexto. Já aconteceu duas vezes:

- `fase` → `stage` (fase do concurso, em `study_plans`) mas `phase` (fase da
  questão, no ledger);
- `resultado` → `outcome` (acerto/erro, no ledger) mas `result` (retorno
  guardado da RPC, em `operations`).

---

## Comandos

```bash
npm install
npm run db:start      # Supabase local (exige Docker)
npm run dev           # site em http://localhost:3000

npm run check         # typecheck + lint + testes de todos os pacotes
npm run db:test       # recria o banco e roda as suítes de invariante
npm run db:reset      # recria o banco: migration + seed
npm run db:types      # regenera packages/database a partir do schema local
npm run ext:build     # compila a extensão em apps/extension/dist
```

---

## Banco

**O cliente lê tabelas e views; escreve só por RPC.** As tabelas transacionais
não têm grant de `INSERT`/`UPDATE`/`DELETE` para `authenticated`. Se uma tela
precisa gravar algo e não existe RPC, a resposta é criar a RPC — não afrouxar o
grant.

**`quiz_session_questions` é o ledger e a única fonte de desempenho.** É
append-only, protegido por trigger. Todo número agregado vem de view. Nunca
crie coluna de contador mantida à mão: o problema da versão anterior não era
ter agregados, era ter três caminhos independentes escrevendo o mesmo número.

**Toda RPC mutante precisa ser segura a retentativa.** Há duas formas, e a
escolha depende de a operação ter payload:

- **Com payload** — recebe `request_id` e passa por `reserve_operation`, que
  compara o hash: mesmo id e mesmo payload devolve o resultado anterior sem
  reexecutar; payload diferente é rejeitado. Usam isso `finish_quiz_session`,
  `record_quiz_session_time`, `void_quiz_session` e `record_reinforcement`.
- **Naturalmente idempotente** — o segundo `start_quiz_session` da mesma meta
  devolve a sessão já aberta; `activate_study_plan` chega ao mesmo estado.
  `apply_study_plan_batch` faz o replay pela própria chave do lote em
  `study_plan_batches`.

RPC nova que grava e aceita payload entra na primeira forma. Se você acha que
ela é naturalmente idempotente, escreva no comentário por quê.

**Nada é apagado fisicamente.** `deleted_at` mais a tabela `audit_log`. FKs de
histórico usam `ON DELETE RESTRICT`, não `SET NULL` — uma bateria que perde o
vínculo com a meta vira dado órfão que nenhuma tela consegue explicar.

**Nenhum dado de domínio em texto livre.** Tipo, origem e flag são enum ou FK.
A versão anterior codificava `TIPO_REFORCO:1` e o resultado inteiro de uma
bateria em base64 dentro do campo de observações, e o round-trip destruía texto
a cada gravação.

**Invariante que dá para expressar em constraint vai para o banco.** Um
planejamento ativo por aluno é índice único parcial, não uma sequência de
`UPDATE` no cliente.

**Contexto denormalizado é protegido por FK composta.** `student_id` e
`teacher_id` são repetidos nas tabelas filhas porque a RLS precisa, mas a FK
composta garante que a cópia nunca diverge do pai.

### Migrations

- Enquanto **nada estiver implantado**, o schema é uma migration única. Edite-a
  no lugar e rode `npm run db:reset`.
- **Depois do primeiro deploy**, migration nova sempre. Nunca reescreva um
  arquivo já aplicado em qualquer ambiente.
- Rode `npm run db:types` depois de **toda** alteração de schema. O arquivo
  gerado é versionado: o CI precisa dele sem subir um Supabase, e o diff mostra
  o impacto na superfície de tipos.
- Toda view precisa de `with (security_invoker = true)`. Sem isso ela roda com
  privilégio do dono e vaza dados entre alunos.

---

## Protocolo site ↔ extensão

`packages/protocol` é a **única** definição. As duas pontas importam de lá;
nenhuma redefine as formas localmente. Elas são versionadas separadamente na
prática — o site atualiza sozinho, a extensão só quando o usuário quer — e na
versão anterior cada lado tinha sua cópia e elas derivaram.

- Toda leitura compara `PROTOCOL_VERSION` e rejeita versão diferente com
  mensagem acionável.
- Valide na fronteira: `JSON.parse` devolve `any`, e tipo de TypeScript não
  sobrevive à serialização.
- Mudança incompatível incrementa `PROTOCOL_VERSION`.
- **A extensão nunca fala com o Supabase.** Recebe um payload e devolve outro.
  Assim o pacote distribuído na loja não carrega credencial e toda regra de
  negócio fica atrás das RPCs. Por isso `@bora/extension` depende de
  `@bora/protocol` e não de `@bora/database`.

---

## Três ordenações que não podem inverter

Cada uma corresponde a uma perda silenciosa de bateria já respondida na versão
anterior — o dado mais caro do sistema, porque custa uma hora de estudo do
aluno e não pode ser recriado.

1. **Persistir antes de limpar a hash.** O payload da URL é a única cópia no
   navegador. Limpar antes de confirmar a gravação e depois falhar não deixa de
   onde recuperar.

2. **Aguardar a gravação antes de navegar.** `location.assign` destrói o
   content script; um `storage.set` não aguardado se perde junto. Sempre
   `await writeSession(...)` antes de sair da página.

3. **`request_id` gerado uma vez, na origem, e reusado em todo retry.** Gerá-lo
   no ponto de uso transforma a proteção do servidor em decoração: cada
   tentativa chega ao banco como operação nova.

---

## Armadilhas já verificadas nas ferramentas

**Next.js 16** — leia `node_modules/next/dist/docs/` antes de escrever código
Next. A versão tem breaking changes em relação ao conhecimento de modelo, e o
próprio framework avisa isso em `apps/web/AGENTS.md`. Já confirmados:

- `middleware.ts` virou `proxy.ts`, e a função exportada precisa chamar `proxy`;
- o runtime do `proxy` é sempre `nodejs`, `edge` não é suportado;
- `cookies()`, `headers()`, `params` e `searchParams` são assíncronos — o modo
  síncrono foi removido;
- `LayoutProps` e `PageProps` vêm de `next typegen`, que roda no `typecheck`.

**Node roda TypeScript em modo strip-only.** Só remove tipos, não gera código.
Nada de parameter property (`constructor(readonly x: T)`), `enum` ou
`namespace` — declare o campo e atribua no corpo. Imports usam extensão `.ts`
explícita, que é o que o runner nativo exige.

**`create or replace view` só acrescenta coluna no fim.** Inserir no meio é
lido como renomear a que estava na posição, e o Postgres recusa. Reordenar
exige `drop` e `create`, respeitando a ordem de dependência.

**Substituição de string em SQL não enxerga JSON com aspas duplas.** Um replace
de `'valor'` não pega `"valor"` dentro de um literal jsonb. Já quebrou o seed
duas vezes ao renomear valor de enum.

---

## Testes

`npm run db:test` recria o banco e roda as suítes de `supabase/tests/`.

- **Teste de estado proibido usa `raise exception` se o banco aceitar.** É o
  que faz a suíte falhar quando uma constraint desaparece, e não só quando o
  código quebra.
- **As suítes compartilham estado**, rodam em sequência na mesma base. Teste
  novo que agrega por bloco precisa criar o próprio bloco, senão soma o que as
  anteriores deixaram.
- Testes de TypeScript ficam ao lado do código, em `*.test.ts`, e rodam pelo
  runner nativo do Node.

---

## Antes de commitar

1. `npm run check` — typecheck, lint e testes.
2. `npm run db:test` se tocou em schema, RPC ou view.
3. `npm run db:types` se tocou em schema, e commite o arquivo gerado.
4. Não afirme que algo funciona sem ter rodado. Se algo ficou por verificar,
   diga qual parte e por quê.
5. Nunca commite `.env.local` nem credencial. As chaves do Supabase local são
   fixas e públicas, e vivem em `apps/web/.env.example`.
