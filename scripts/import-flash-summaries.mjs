/** Extrai o DOCX fornecido para conteúdo estruturado; nunca executa seu conteúdo. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DOMParser } from "@xmldom/xmldom";
import { unzipSync } from "fflate";

const NS = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  v: "urn:schemas-microsoft-com:vml",
};

// Teto do bucket (64 MB) por arquivo, e um total que um DOCX legítimo não alcança.
export const MAX_PART_BYTES = 64 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const HEADING_NAME = /^(?:heading|t[ií]tulo)\s*([1-3])$/i;
const HEADING_ID = /^(?:Heading|Ttulo|T[ií]tulo)([1-3])$/;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function slug(text) {
  const ascii = text.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
  return ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "topico";
}

const isElement = (node, ns, local) => node.nodeType === 1 && node.namespaceURI === ns && node.localName === local;
const elementChildren = (node) => Array.from(node.childNodes).filter((child) => child.nodeType === 1);
const childOf = (node, ns, local) => elementChildren(node).find((child) => isElement(child, ns, local)) ?? null;
const childrenOf = (node, ns, local) => elementChildren(node).filter((child) => isElement(child, ns, local));
const descendants = (node) => Array.from(node.getElementsByTagName("*"));
const wval = (node) => node.getAttributeNS(NS.w, "val");

/**
 * Abre o ZIP sem descomprimir nada: só o diretório central, onde cada parte
 * declara o tamanho. `read` descomprime UMA parte, recusando a que passa do teto.
 */
function openArchive(bytes, { maxPartBytes, maxTotalBytes }) {
  const sizes = new Map();
  let total = 0;
  unzipSync(bytes, {
    filter(file) {
      sizes.set(file.name, file.originalSize);
      total += file.originalSize;
      return false;
    },
  });
  if (total > maxTotalBytes) throw new Error("O DOCX descomprime além do limite total.");
  return {
    has: (name) => sizes.has(name),
    /** Lê uma parte do ZIP recusando o que descomprime além do razoável. */
    read(name) {
      if (!sizes.has(name)) throw new Error(`${name} não existe no DOCX.`);
      const size = sizes.get(name);
      if (size > maxPartBytes) throw new Error(`${name} descomprime para ${size} bytes (limite ${maxPartBytes}).`);
      return unzipSync(bytes, { filter: (file) => file.name === name })[name];
    },
  };
}

/** O parser expande entidades: DOCX não precisa de DTD, então recusamos. */
function parseXml(payload, name) {
  const text = new TextDecoder("utf-8").decode(payload);
  if (text.includes("<!DOCTYPE") || text.includes("<!ENTITY")) throw new Error(`${name} declara DTD ou entidades; recusado.`);
  const parser = new DOMParser({
    onError(level, message) {
      if (level !== "warning") throw new Error(`${name} não é XML válido: ${message}`);
    },
  });
  return parser.parseFromString(text, "text/xml").documentElement;
}

export function extract(source, output, { maxPartBytes = MAX_PART_BYTES, maxTotalBytes = MAX_TOTAL_BYTES } = {}) {
  const media = resolve(output, "media");
  mkdirSync(media, { recursive: true });
  const topics = [];
  const subjects = [];
  const assets = new Map();
  const topicIds = new Set();
  let subject = null;
  let topic = null;

  const sourceBytes = readFileSync(source);
  const archive = openArchive(sourceBytes, { maxPartBytes, maxTotalBytes });

  // Estilo de título pelo NOME do estilo (e não só pelo id): o id de
  // "Título 1" muda com o idioma do Word, e nada era reconhecido.
  const headingLevels = new Map();
  if (archive.has("word/styles.xml")) {
    const styles = parseXml(archive.read("word/styles.xml"), "word/styles.xml");
    for (const style of childrenOf(styles, NS.w, "style")) {
      const name = childOf(style, NS.w, "name");
      const match = name ? HEADING_NAME.exec(wval(name)) : null;
      if (match) headingLevels.set(style.getAttributeNS(NS.w, "styleId"), Number(match[1]));
    }
  }
  const relsName = "word/_rels/document.xml.rels";
  const rels = parseXml(archive.read(relsName), relsName);
  const images = new Map();
  for (const rel of elementChildren(rels)) {
    if ((rel.getAttribute("Type") ?? "").endsWith("/image") && rel.getAttribute("TargetMode") !== "External") {
      images.set(rel.getAttribute("Id"), posix.normalize(`word/${rel.getAttribute("Target")}`));
    }
  }
  const root = parseXml(archive.read("word/document.xml"), "word/document.xml");

  function headingLevel(p) {
    const pPr = childOf(p, NS.w, "pPr");
    const pStyle = pPr ? childOf(pPr, NS.w, "pStyle") : null;
    const style = pStyle ? wval(pStyle) : "";
    if (headingLevels.has(style)) return headingLevels.get(style);
    const match = HEADING_ID.exec(style);
    return match ? Number(match[1]) : 0;
  }

  function newTopic(title) {
    const base = `pf2029-${subject.id}-${slug(title)}`;
    let id = base;
    for (let suffix = 2; topicIds.has(id); suffix += 1) id = `${base}-${suffix}`;
    topicIds.add(id);
    topic = { id, subject: subject.name, title, position: topics.length, blocks: [] };
    topics.push(topic);
  }

  function paragraph(p) {
    const blocks = [];
    const parts = [];
    const flush = () => {
      if (parts.length) {
        const text = parts.join("");
        if (text.trim()) blocks.push({ type: "paragraph", text });
        parts.length = 0;
      }
    };
    for (const node of [p, ...descendants(p)]) {
      if (isElement(node, NS.w, "t")) {
        parts.push(node.textContent ?? "");
      } else if (isElement(node, NS.w, "br") || isElement(node, NS.w, "cr")) {
        parts.push("\n");
      } else if (isElement(node, NS.w, "tab")) {
        parts.push("\t");
      } else if (isElement(node, NS.a, "blip") || isElement(node, NS.v, "imagedata")) {
        const rid = node.getAttributeNS(NS.r, "embed") || node.getAttributeNS(NS.r, "id");
        const target = images.get(rid);
        if (target?.startsWith("word/media/")) {
          flush();
          const payload = archive.read(target);
          const key = sha256(payload) + posix.extname(target).toLowerCase();
          if (!assets.has(key)) {
            writeFileSync(resolve(media, key), payload);
            assets.set(key, { key, filename: posix.basename(target) });
          }
          blocks.push({ type: "image", key, alt: "Ilustração do resumo" });
        }
      }
    }
    flush();
    return blocks;
  }

  /** Células guardam parágrafos e TABELAS aninhadas, na ordem do documento. */
  function tableBlock(tbl) {
    const cellBlocks = (cell) => {
      const blocks = [];
      for (const child of elementChildren(cell)) {
        if (isElement(child, NS.w, "p")) blocks.push(...paragraph(child));
        else if (isElement(child, NS.w, "tbl")) blocks.push(tableBlock(child));
      }
      return blocks;
    };
    return {
      type: "table",
      rows: childrenOf(tbl, NS.w, "tr").map((row) => childrenOf(row, NS.w, "tc").map(cellBlocks)),
    };
  }

  const ensureSubject = () => {
    if (subject === null) {
      subject = { id: "introducao", name: "Introdução", position: 0 };
      subjects.push(subject);
    }
  };

  for (const element of elementChildren(childOf(root, NS.w, "body"))) {
    if (isElement(element, NS.w, "p")) {
      const level = headingLevel(element);
      const title = descendants(element)
        .filter((node) => isElement(node, NS.w, "t"))
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
      if (level === 1 && title) {
        subject = { id: slug(title), name: title, position: subjects.length };
        subjects.push(subject);
        topic = null;
        continue;
      }
      ensureSubject();
      if (level === 2 && title) {
        newTopic(title);
        continue;
      }
      if (topic === null) newTopic("Visão geral");
      if (level === 3 && title) topic.blocks.push({ type: "heading", text: title });
      else topic.blocks.push(...paragraph(element));
    } else if (isElement(element, NS.w, "tbl")) {
      ensureSubject();
      if (topic === null) newTopic("Visão geral");
      topic.blocks.push(tableBlock(element));
    }
  }

  const kept = topics.filter((t) => t.blocks.length > 0);
  const result = { source: basename(source), sha256: sha256(sourceBytes), subjects, topics: kept, assets: [...assets.values()] };
  writeFileSync(resolve(output, "library.json"), JSON.stringify(result), "utf8");
  console.log(`Extraídos ${subjects.length} seções, ${kept.length} tópicos e ${assets.size} imagens únicas.`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { output: { type: "string", default: "content/summaries/local/pf2029" } },
  });
  if (positionals.length !== 1) {
    console.error("uso: node scripts/import-flash-summaries.mjs <arquivo.docx> [--output <pasta>]");
    process.exit(2);
  }
  extract(resolve(positionals[0]), resolve(values.output));
}
