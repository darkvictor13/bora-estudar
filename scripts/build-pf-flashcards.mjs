import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const source = new URL("content/flashcards/PF2029_INFORMATICA_COMPLETO_FLASHCARDS.md", root);
const output = new URL("content/flashcards/pf2029-informatica-flashcards.json", root);
const lines = readFileSync(source, "utf8").replace(/\r\n/g, "\n").split("\n");
const decks = [];
const byNumber = new Map();
const blocks = new Map();
let deck = null;
let block = 0;
let topic = "Conceitos gerais";
let card = null;
let field = null;

function stableUuid(key) {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 32).split("");
  hash[12] = "4";
  hash[16] = "89ab"[parseInt(hash[16], 16) % 4];
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function finishCard() {
  if (!card) return;
  if (!deck || !card.front.trim() || !card.back.trim()) throw new Error(`Cartão incompleto: ${deck?.number ?? "?"}/${card.number}`);
  deck.cards.push({
    id: stableUuid(`pf2029-informatica:${deck.number}:${block}:${card.number}`),
    topic: card.topic,
    front: card.front.trim(),
    back: card.back.trim(),
    origin: card.origin ?? "nao_informada",
    tags: card.tags,
  });
  card = null;
  field = null;
}

for (const line of lines) {
  const deckHeading = /^# (\d{2}) — (.+)$/.exec(line);
  if (deckHeading) {
    finishCard();
    const number = deckHeading[1];
    const title = deckHeading[2].replace(/ — (lote inicial|complemento de auditoria)$/, "");
    deck = byNumber.get(number);
    if (!deck) {
      deck = { id: `pf2029-informatica-${number}`, number, title, cards: [] };
      byNumber.set(number, deck);
      decks.push(deck);
    } else if (deck.title !== title) throw new Error(`Título divergente no tópico ${number}`);
    block = (blocks.get(number) ?? 0) + 1;
    blocks.set(number, block);
    topic = "Conceitos gerais";
    continue;
  }
  if (/^# (?:AUDITORIA|Índice|Critério|INFORMÁTICA)/.test(line) || /^## (?:Auditoria|Observação)/.test(line)) {
    finishCard();
    if (line.startsWith("# AUDITORIA")) deck = null;
    continue;
  }
  const section = /^### (?!Flashcard \d+)(.+)$/.exec(line);
  if (section) {
    finishCard();
    topic = section[1].trim();
    continue;
  }
  const heading = /^#{3,4} Flashcard (\d+)/.exec(line);
  if (heading) {
    finishCard();
    if (!deck) throw new Error(`Cartão fora de tópico: ${heading[1]}`);
    card = { number: heading[1], topic, front: "", back: "", origin: null, tags: [] };
    continue;
  }
  if (!card) continue;
  const front = /^\*\*Frente:\*\*\s*(.*)$/.exec(line);
  const back = /^\*\*Verso:\*\*\s*(.*)$/.exec(line);
  const origin = /^\*\*Origem:\*\*\s*(.*)$/.exec(line);
  const tags = /^\*\*Tags:\*\*\s*(.*)$/.exec(line);
  if (front) { field = "front"; card.front = front[1]; continue; }
  if (back) { field = "back"; card.back = back[1]; continue; }
  if (origin) { card.origin = origin[1].trim(); field = null; continue; }
  if (tags) { card.tags = tags[1].split("|").map((value) => value.trim()).filter(Boolean); field = null; continue; }
  if (/^<!-- card_id:/.test(line) || line.trim() === "---") { field = null; continue; }
  if (field && line.trim()) card[field] += `\n${line.trim()}`;
}
finishCard();

const expected = new Map([["01", 243], ["02", 161], ["03", 146], ["04", 179], ["05", 69], ["06", 125], ["08", 51], ["09", 132], ["10", 22]]);
for (const [number, count] of expected) {
  if (byNumber.get(number)?.cards.length !== count) throw new Error(`Tópico ${number}: esperados ${count}, encontrados ${byNumber.get(number)?.cards.length ?? 0}`);
}
const cards = decks.flatMap((item) => item.cards);
if (decks.length !== expected.size || cards.length !== 1128 || new Set(cards.map((item) => item.id)).size !== cards.length) throw new Error("Quantidade ou IDs inválidos");

const catalog = { id: "pf2029-informatica", exam: "PF 2029", subject: "Informática", totalCards: cards.length, decks };
writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`${fileURLToPath(output)}: ${decks.length} decks, ${cards.length} cartões`);
