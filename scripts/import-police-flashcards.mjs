import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const sources = new URL("content/flashcards/pf2029-v2/FLASHCARDS/", root);
const definitions = [
  ["informatica", "Informática", 1175, "V2 auditada"],
  ["portugues", "Português", 652, "V2 auditada"],
  ["direito-penal", "Direito Penal", 496, "Auditoria jurídica parcial"],
  ["processo-penal", "Direito Processual Penal", 213, "Auditoria jurídica parcial"],
  ["constitucional", "Direito Constitucional", 289, "Revisão inicial"],
  ["administrativo", "Direito Administrativo", 336, "Revisão inicial"],
  ["direitos-humanos", "Direitos Humanos", 401, "Revisão inicial"],
  ["legislacao-especial", "Legislação Especial", 450, "Revisão inicial"],
  ["contabilidade", "Contabilidade", 469, "V2 auditada"],
  ["rlm", "Raciocínio Lógico-Matemático", 143, "V2 auditada"],
  ["arquivologia", "Arquivologia", 149, "V2 auditada"],
  ["estatistica", "Estatística", 71, "V2 auditada"],
  ["criminologia", "Criminologia", 122, "V2 auditada"],
  ["medicina-legal", "Medicina Legal", 142, "V2 auditada"],
];

// The appendices lack topic headings. Keep their source number for traceability,
// but place each range beside the corresponding material in this release.
const appendixTopics = {
  "direito-penal": [[487, 489, "04"], [490, 496, "06"]],
  "processo-penal": [[207, 213, "03"]],
  contabilidade: [[432, 434, "01"], [435, 439, "05"], [440, 441, "06"], [442, 450, "07"], [451, 462, "12"], [463, 466, "15"], [467, 469, "13"]],
  arquivologia: [[118, 138, "01"], [139, 145, "02"], [146, 148, "04"], [149, 149, "03"]],
  estatistica: [[50, 67, "01"], [68, 71, "02"]],
  criminologia: [[98, 108, "02"], [109, 112, "03"], [113, 113, "01"], [114, 116, "04"], [117, 122, "02"]],
  "medicina-legal": [[117, 121, "01"], [122, 122, "02"], [123, 123, "06"], [124, 124, "04"], [125, 134, "03"], [135, 137, "04"], [138, 142, "05"]],
};

export const normalize = (text) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
export const slug = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function uuid(key) {
  const chars = createHash("sha256").update(key).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "89ab"[parseInt(chars[16], 16) % 4];
  const h = chars.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Parse only content fields; metadata and audit prose never become an answer. */
export function parseFlashcardSource(body) {
  const cards = [];
  let deck = null;
  let topic = "Conceitos gerais";
  let card = null;
  let field = null;
  const finish = () => {
    if (!card) return;
    if (!card.front.trim() || !card.back.trim()) throw new Error(`Cartão incompleto: ${card.number}`);
    cards.push({ ...card, front: card.front.trim(), back: card.back.trim() });
    card = null;
    field = null;
  };
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^(#{1,4}) (.+)$/.exec(line);
    if (heading) {
      finish();
      const [, level, title] = heading;
      const cardHeading = /^Flashcard\s+(\d+)/.exec(title);
      if (cardHeading) {
        if (!deck) throw new Error(`Cartão sem tópico: ${title}`);
        card = { number: cardHeading[1], deck: { ...deck }, topic, front: "", back: "", origin: "nao_informada", status: "", tags: [] };
        continue;
      }
      const numbered = /^(\d{1,2})(?:\s+(?:—|---)\s+|\.\s+)(.+)$/.exec(title);
      if (level.length <= 2 && numbered) {
        deck = { number: numbered[1].padStart(2, "0"), title: numbered[2] };
        topic = "Conceitos gerais";
      } else if (level.length === 1 && /^Lei\s/.test(title)) {
        deck = { number: null, title };
        topic = "Conceitos gerais";
      } else if (level.length === 1 && /^COMPLEMENTO/i.test(title)) {
        deck = { number: null, title: "Complemento de auditoria" };
        topic = "Complemento de auditoria";
      } else if (level.length === 1) {
        deck = null;
      } else if (deck) {
        topic = title;
      }
      continue;
    }
    if (!card) continue;
    // Some files place Origem and Status on the same line.
    const labels = [...line.matchAll(/\*\*([^*]+):\*\*\s*/g)];
    if (labels.length && labels[0].index === 0) {
      field = null;
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i][1];
        const value = line.slice(labels[i].index + labels[i][0].length, labels[i + 1]?.index).trim();
        if (label === "Frente" || label === "Verso") {
          field = label === "Frente" ? "front" : "back";
          card[field] = value;
        } else if (label === "Origem") card.origin = value;
        else if (label.startsWith("Status")) card.status = value;
        else if (label === "Tags") card.tags = value.split("|").map((x) => x.trim()).filter(Boolean);
      }
    } else if (/^-{3,}\s*$/.test(line) || /^<!--/.test(line)) {
      field = null;
    } else if (field && line.trim()) {
      card[field] += `\n${line.trim()}`;
    }
  }
  finish();
  return cards;
}

export function buildCatalog() {
  const legacy = JSON.parse(readFileSync(new URL("content/flashcards/pf2029-informatica-flashcards.json", root), "utf8"));
  const files = readdirSync(sources).filter((name) => name.endsWith(".md")).sort();
  const claimedLegacyIds = new Set();
  const report = { totalCards: 0, subjects: [], legacy: { preserved: 0, aliases: 0, unmapped: [] } };
  const subjects = definitions.map(([key, subject, expected, auditLabel], index) => {
    const sourceFile = files.find((name) => name.startsWith(`${String(index + 1).padStart(2, "0")}_`));
    if (!sourceFile) throw new Error(`Fonte ausente: ${subject}`);
    const parsed = parseFlashcardSource(readFileSync(new URL(sourceFile, sources), "utf8"));
    if (parsed.length !== expected) throw new Error(`${subject}: ${parsed.length} cartões, esperados ${expected}`);
    const sourceTopics = new Map(parsed.filter((c) => !/^Complement/i.test(c.deck.title)).map((c) => [c.deck.number, c.deck]));
    if (key === "contabilidade") sourceTopics.set("15", { number: "15", title: "Valor recuperável e impairment" });
    for (const c of parsed.filter((c) => /^Complement/i.test(c.deck.title))) {
      const range = appendixTopics[key]?.find(([from, to]) => Number(c.number) >= from && Number(c.number) <= to);
      const destination = range && sourceTopics.get(range[2]);
      if (!destination) throw new Error(`Complemento sem classificação: ${subject}/${c.number}`);
      c.deck = { ...destination };
      if (c.topic === "Complemento de auditoria") c.topic = "Complemento do tópico";
    }
    const decks = new Map();
    for (const input of parsed) {
      const deckKey = input.deck.number ?? slug(input.deck.title);
      const deckId = key === "informatica" ? `pf2029-informatica-${deckKey}` : `pf2029-${key}-${slug(input.deck.title)}`;
      let deck = decks.get(deckId);
      if (!deck) {
        deck = { id: deckId, subjectId: key, number: input.deck.number ?? String(decks.size + 1).padStart(2, "0"), title: input.deck.title, historical: /histórico\/revogado/.test(input.deck.title), cards: [] };
        decks.set(deckId, deck);
      }
      const previous = key === "informatica" ? legacy.decks.find((d) => d.id === deckId)?.cards ?? [] : [];
      const sameQuestion = previous.filter((c) => normalize(c.front) === normalize(input.front) && !claimedLegacyIds.has(c.id));
      const exact = sameQuestion.filter((c) => normalize(c.back) === normalize(input.back));
      const matches = exact.length ? exact : sameQuestion.length === 1 ? sameQuestion : [];
      const id = matches[0]?.id ?? uuid(`pf2029:${key}:${deckKey}:${normalize(input.front)}`);
      matches.forEach((c) => claimedLegacyIds.add(c.id));
      report.legacy.preserved += matches.length ? 1 : 0;
      report.legacy.aliases += Math.max(0, matches.length - 1);
      deck.cards.push({ id, topic: input.topic, front: input.front, back: input.back, origin: input.origin, tags: input.tags, status: input.status, sourceNumber: input.number, previousReviews: matches.slice(1).map((c) => ({ deckId, cardId: c.id })) });
    }
    report.subjects.push({ subject, sourceFile, cards: parsed.length, decks: decks.size, auditLabel });
    return { id: key, subject, sourceFile, auditLabel, auditPartial: index >= 2 && index <= 7, totalCards: parsed.length, decks: [...decks.values()] };
  });
  // V2 consolidates eight equivalent questions, including some across decks.
  // Preserve these references; adapters merge their latest review without deleting rows.
  const renamed = new Map([
    ["O que é hardening de servidor?", "O que é hardening de um servidor?"],
    ["O que é sistema operacional?", "O que é um sistema operacional?"],
  ]);
  const informatica = subjects[0].decks.flatMap((d) => d.cards);
  for (const deck of legacy.decks) for (const old of deck.cards) {
    if (claimedLegacyIds.has(old.id)) continue;
    const equivalent = informatica.filter((c) => normalize(c.front) === normalize(renamed.get(old.front) ?? old.front));
    if (equivalent.length !== 1) {
      report.legacy.unmapped.push({ deckId: deck.id, id: old.id, front: old.front });
      continue;
    }
    equivalent[0].previousReviews.push({ deckId: deck.id, cardId: old.id });
    claimedLegacyIds.add(old.id);
    report.legacy.aliases++;
  }
  if (report.legacy.unmapped.length) throw new Error(`Revisões antigas sem destino: ${JSON.stringify(report.legacy.unmapped)}`);
  const allCards = subjects.flatMap((s) => s.decks.flatMap((d) => d.cards));
  if (new Set(allCards.map((c) => c.id)).size !== allCards.length) throw new Error("IDs duplicados no pacote");
  report.totalCards = allCards.length;
  return { catalog: { id: "pf2029-policial", source: "PF 2029", totalCards: allCards.length, subjects }, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { catalog, report } = buildCatalog();
  writeFileSync(new URL("content/flashcards/pf2029-policial-flashcards.json", root), `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(new URL("content/flashcards/pf2029-v2/import-report.json", root), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${catalog.subjects.length} matérias, ${catalog.totalCards} cartões. IDs antigos preservados: ${report.legacy.preserved}; aliases: ${report.legacy.aliases}; não mapeados: ${report.legacy.unmapped.length}.`);
}
