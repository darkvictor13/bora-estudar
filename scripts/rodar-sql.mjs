/**
 * Executa um arquivo `.sql` contra um banco Supabase.
 *
 * Existe porque não há `psql` nesta máquina e porque colar senha de banco num
 * comando é pior do que lê-la do ambiente. O `pg` já é dependência de
 * `apps/e2e`, então não há pacote novo a instalar.
 *
 * ## Uso
 *
 *   SUPABASE_DB_PASSWORD='…' node scripts/rodar-sql.mjs promover-professor.sql
 *
 * ou, se você já tem a URL inteira:
 *
 *   SUPABASE_DB_URL='postgresql://…' node scripts/rodar-sql.mjs criar-turma.sql
 *
 * O caminho é procurado a partir de onde você está e, se não achar lá, de
 * `scripts/` — o nome pelado funciona de qualquer diretório do repositório.
 *
 * ## A trava do ambiente mora no ARQUIVO SQL, e não aqui
 *
 * Os scripts desta pasta não correm o mesmo risco. `turma-de-teste.sql` CRIA
 * CONTAS, e quatro contas de teste em produção é o tipo de engano que uma
 * variável de ambiente trocada produz sozinha — e que não é desfazível por lá,
 * porque `quiz_sessions` referencia `profiles` com ON DELETE RESTRICT.
 * `promover-professor.sql` e `criar-turma.sql` operam sobre contas que já
 * existem, e são justamente o que se roda em produção enquanto as RPCs de
 * `docs/specs/13-vinculo-e-liberacao-de-acesso.md` não existem.
 *
 * Uma trava única para os três só teria dois destinos: ou proíbe produção, e
 * aí dois dos três arquivos passam a exigir `--forcar` todo dia, ou não proíbe
 * nada. `--forcar` que se digita por hábito não protege ninguém. Então quem
 * diz onde pode rodar é cada arquivo, na primeira linha que casar:
 *
 *   -- @ambiente: staging     só contra o projeto de staging
 *   -- @ambiente: qualquer    onde a URL apontar
 *
 * Sem a diretiva vale `staging`: arquivo que não diz onde pode rodar não roda
 * em produção. `--forcar` passa por cima, e aí a responsabilidade é de quem
 * digitou.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const AQUI = dirname(fileURLToPath(import.meta.url));

/** O ref versionado em `supabase/config.toml`, bloco `[remotes.staging]`. */
const STAGING_REF = "gumvfizrjexbygrbceei";

/** Sessão, e não transaction pooling: os arquivos são `do $$ … $$`. */
const POOLER = `postgresql://postgres.${STAGING_REF}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;

function connectionString() {
  const pronta = process.env["SUPABASE_DB_URL"];
  if (pronta) return pronta;

  const senha = process.env["SUPABASE_DB_PASSWORD"];
  if (!senha) {
    throw new Error(
      "Faltou a credencial. Defina SUPABASE_DB_PASSWORD (a mesma do secret do " +
        "GitHub, usada por .github/workflows/deploy-staging.yml) ou SUPABASE_DB_URL.",
    );
  }

  // `encodeURIComponent` e não interpolação crua: senha com `@`, `/` ou `#`
  // quebra a URL em silêncio e o erro que volta é "database does not exist".
  return POOLER.replace(
    `postgres.${STAGING_REF}@`,
    `postgres.${STAGING_REF}:${encodeURIComponent(senha)}@`,
  );
}

/** Para onde a conexão vai, sem a senha. É o que o aviso de antes de escrever mostra. */
function alvo(url) {
  try {
    const { username, host, pathname } = new URL(url);
    return `${username}@${host}${pathname}`;
  } catch {
    return "(URL em formato não reconhecido)";
  }
}

/** O arquivo pedido, procurado a partir do diretório atual e depois de `scripts/`. */
async function lerArquivo(pedido) {
  const candidatos = isAbsolute(pedido)
    ? [pedido]
    : [resolve(process.cwd(), pedido), join(AQUI, pedido)];

  for (const caminho of candidatos) {
    try {
      return { caminho, sql: await readFile(caminho, "utf8") };
    } catch (erro) {
      if (erro.code !== "ENOENT") throw erro;
    }
  }

  const aqui = (await readdir(AQUI)).filter((f) => f.endsWith(".sql")).sort();
  throw new Error(`Arquivo não encontrado: ${pedido}\nEm scripts/: ${aqui.join(", ")}`);
}

/** `-- @ambiente: staging` ou `qualquer`. Ausente é `staging`. */
function ambienteExigido(sql, pedido) {
  const achado = /^\s*--\s*@ambiente:\s*(\S+)/im.exec(sql);
  const valor = (achado?.[1] ?? "staging").toLowerCase();

  if (valor !== "staging" && valor !== "qualquer") {
    throw new Error(`${pedido}: @ambiente aceita 'staging' ou 'qualquer', e o arquivo diz '${valor}'.`);
  }
  return valor;
}

async function main() {
  const argumentos = process.argv.slice(2);
  const forcar = argumentos.includes("--forcar");
  const pedido = argumentos.find((a) => !a.startsWith("--"));

  if (!pedido) {
    const aqui = (await readdir(AQUI)).filter((f) => f.endsWith(".sql")).sort();
    throw new Error(
      "Falta o arquivo. Ex.: node scripts/rodar-sql.mjs promover-professor.sql\n" +
        `Em scripts/: ${aqui.join(", ")}`,
    );
  }

  const { caminho, sql } = await lerArquivo(pedido);
  const ambiente = ambienteExigido(sql, pedido);
  const url = connectionString();

  if (ambiente === "staging" && !url.includes(STAGING_REF) && !forcar) {
    throw new Error(
      `${pedido} está marcado '@ambiente: staging' e a URL não aponta para o projeto ` +
        `${STAGING_REF}. Se é intencional, repita com --forcar.`,
    );
  }

  // Dito antes de escrever, e não depois: a senha vem do ambiente, e variável
  // de ambiente trocada é exatamente o engano que ninguém percebe sozinho.
  console.log(`arquivo:  ${caminho}`);
  console.log(`ambiente: ${ambiente}${forcar ? " (--forcar)" : ""}`);
  console.log(`alvo:     ${alvo(url)}\n`);

  // O pooler do Supabase exige TLS; o Postgres do stack local não fala TLS
  // nenhum e derruba a conexão com "the server does not support SSL
  // connections" — é o que permite ensaiar estes arquivos localmente antes de
  // apontá-los para staging.
  //
  // Sem uma CA em mãos a verificação fica desligada: o tráfego vai cifrado,
  // mas nada prova com quem se está falando. Aponte SUPABASE_DB_CA para o
  // certificado do projeto (painel → Database → SSL) e ela volta a valer.
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const ssl = local
    ? false
    : process.env["SUPABASE_DB_CA"]
      ? { ca: await readFile(process.env["SUPABASE_DB_CA"], "utf8") }
      : { rejectUnauthorized: false };

  const client = new pg.Client({ connectionString: url, ssl });

  // O `raise notice` do arquivo SQL só aparece se alguém escutar.
  client.on("notice", (n) => console.log(`  ${n.message}`));

  await client.connect();
  try {
    // Sem parâmetro nenhum, o driver manda por simple query e o servidor aceita
    // os vários comandos do arquivo de uma vez, devolvendo um resultado por
    // comando. A conferência é o último que tem linha.
    const resultados = await client.query(sql);
    const lista = Array.isArray(resultados) ? resultados : [resultados];
    const conferencia = lista.reverse().find((r) => r.rows?.length);

    // Aviso, e não erro. Enquanto isto rodava um arquivo só, "sem linha" era
    // sinônimo de "não terminou"; rodando arquivo arbitrário deixou de ser, e
    // quem sinaliza falha é o `raise exception` do próprio SQL — que chega
    // aqui como exceção e derruba o processo.
    if (conferencia) console.table(conferencia.rows);
    else console.log("(nenhum comando devolveu linha: este arquivo não tem conferência)");
  } finally {
    await client.end();
  }
}

// A mensagem, e não a pilha. Quase todo erro daqui é esperado — arquivo que
// não existe, trava de ambiente, `raise exception` do próprio SQL — e a pilha
// do Node esconderia a frase que interessa no meio de caminhos de arquivo.
try {
  await main();
} catch (erro) {
  console.error(`\n${erro.message ?? erro}`);
  process.exitCode = 1;
}
