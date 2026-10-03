/**
 * Reprova o `dist` que levaria conteúdo editorial para o ar (spec 41).
 *
 *   node scripts/check-dist-content.mjs [dist]     # padrão: apps/web/dist
 *
 * Lê os arquivos de `content/` como referência e procura, em cada arquivo do
 * `dist`, toda linha de frente ou verso de cartão e todo parágrafo de artigo
 * com 40 caracteres ou mais (R-PUB-07). Cada linha é procurada crua e escapada
 * como string JSON: são as duas formas em que um texto chega a um chunk.
 *
 * Roda no `dist` que vai para o ar (R-PUB-08): no `ci.yml` e no job `site`
 * dos dois deploys, antes de publicar. Varrer depois de publicar só diz que o
 * conteúdo já saiu.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Abaixo disso, frase genérica de lei casaria com texto que não é conteúdo. */
export const MIN_LENGTH = 40;

/** O que não é texto. Todo o resto do `dist` é varrido. */
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|otf|eot|mp4|webm|wasm)$/i;

const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));

/** O conteúdo de `content/` como pares `{ text, source }`, antes de quebrar em linhas. */
export function readContent() {
  const texts = [];
  for (const subject of readJson("content/flashcards/pf2029-policial-flashcards.json").subjects) {
    for (const deck of subject.decks) {
      for (const card of deck.cards) texts.push({ text: card.front, source: `cartão ${card.id}` }, { text: card.back, source: `cartão ${card.id}` });
    }
  }
  for (const deck of readJson("content/flashcards/pf2029-informatica-flashcards.json").decks) {
    for (const card of deck.cards) texts.push({ text: card.front, source: `cartão ${card.id}` }, { text: card.back, source: `cartão ${card.id}` });
  }
  for (const law of readJson("content/laws/library/index.json")) {
    for (const article of readJson(`content/laws/library/text/${law.id}.json`).articles) {
      for (const paragraph of article.paragraphs) texts.push({ text: paragraph, source: `artigo ${article.id}` });
    }
  }
  return texts;
}

/**
 * As agulhas: cada linha com `MIN_LENGTH` ou mais, nas duas formas,
 * agrupadas pelos primeiros `MIN_LENGTH` caracteres para a varredura não
 * comparar cada agulha com cada posição.
 */
export function buildNeedles(texts) {
  const byPrefix = new Map();
  let count = 0;
  for (const { text, source } of texts) {
    for (const line of text.split("\n").map((item) => item.trim())) {
      if (line.length < MIN_LENGTH) continue;
      for (const form of new Set([line, JSON.stringify(line).slice(1, -1)])) {
        const key = form.slice(0, MIN_LENGTH);
        const bucket = byPrefix.get(key) ?? [];
        if (bucket.some((needle) => needle.form === form)) continue;
        bucket.push({ form, line, source });
        byPrefix.set(key, bucket);
        count += 1;
      }
    }
  }
  return { byPrefix, count };
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}

/** Os achados: um por arquivo e linha de conteúdo. */
export function scanDist(dist, { byPrefix }) {
  const found = [];
  for (const file of walk(dist).filter((item) => !BINARY.test(item))) {
    const body = readFileSync(file, "utf8");
    const seen = new Set();
    for (let index = 0; index + MIN_LENGTH <= body.length; index += 1) {
      const bucket = byPrefix.get(body.slice(index, index + MIN_LENGTH));
      if (!bucket) continue;
      for (const needle of bucket) {
        if (seen.has(needle.line) || !body.startsWith(needle.form, index)) continue;
        seen.add(needle.line);
        found.push({ file: path.relative(dist, file), line: needle.line, source: needle.source });
      }
    }
  }
  return found;
}

function main() {
  const dist = path.resolve(process.argv[2] ?? path.join(root, "apps", "web", "dist"));
  if (!statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`Não achei o dist em ${dist}. Compile o site antes de varrer.`);
    process.exit(2);
  }
  const needles = buildNeedles(readContent());
  const found = scanDist(dist, needles);
  if (found.length === 0) {
    console.log(`OK  nenhum conteúdo de content/ em ${path.relative(process.cwd(), dist) || dist} (${needles.count} trechos procurados)`);
    return;
  }
  console.error(`O dist leva conteúdo editorial para o ar (spec 41, R-PUB-01): ${found.length} trecho(s).`);
  for (const { file, line, source } of found.slice(0, 20)) {
    console.error(`  ${file}: ${source}: "${line.length > 80 ? `${line.slice(0, 77)}...` : line}"`);
  }
  if (found.length > 20) console.error(`  ... e mais ${found.length - 20}.`);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
