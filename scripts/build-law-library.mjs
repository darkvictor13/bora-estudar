import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "content", "laws", "source");
const publicDir = path.join(root, "apps", "web", "public", "laws");
const indexPath = path.join(root, "apps", "web", "src", "data", "laws", "index.json");

// A matéria vem da pasta do pacote; o texto de cada norma permanece canônico.
const files = [
  ["07_crimes_hediondos.md", "Legislação Penal Especial"],
  ["08_tortura.md", "Legislação Penal Especial"],
  ["09_estatuto_desarmamento.md", "Legislação Penal Especial"],
  ["10_lei_drogas.md", "Legislação Penal Especial"],
  ["11_organizacoes_criminosas.md", "Legislação Penal Especial"],
  ["12_abuso_autoridade.md", "Legislação Penal Especial"],
  ["13_maria_da_penha.md", "Legislação Penal Especial"],
  ["14_estatuto_pessoa_idosa.md", "Direitos Humanos e Proteção"],
  ["15_crimes_preconceito_raca_cor.md", "Legislação Penal Especial"],
  ["16_estatuto_igualdade_racial.md", "Direitos Humanos e Proteção"],
  ["17_crimes_ambientais.md", "Legislação Penal Especial"],
  ["18_interceptacao_telefonica.md", "Direito Processual Penal"],
  ["19_identificacao_criminal.md", "Direito Processual Penal"],
  ["20_juizados_especiais.md", "Direito Processual Penal"],
  ["21_lei_acesso_informacao.md", "Direito Administrativo e Transparência"],
];

function unescapeMarkdown(value) {
  return value.replace(/\\([\\`*_{}\[\]()#+\-.!<>])/g, "$1");
}

function plainText(value) {
  return unescapeMarkdown(value)
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)[^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/, "• ")
    .trim();
}

function metadata(raw) {
  const lines = raw.split(/\r?\n/).map(unescapeMarkdown);
  if (lines[0].trim() !== "---") throw new Error("Missing front matter");
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) throw new Error("Unclosed front matter");
  const values = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([a-z_]+):\s*"?(.+?)"?\s*$/);
    if (match) values[match[1]] = match[2].replace(/"$/, "");
  }
  return { lines: lines.slice(end + 1), values };
}

function parseArticles(lines) {
  const articles = [];
  let section = "Texto integral";
  let anchor = null;
  let current = null;
  let paragraph = [];
  const flush = () => {
    if (current && paragraph.length) {
      const text = plainText(paragraph.join(" "));
      if (text) current.paragraphs.push(text);
      paragraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const link = line.match(/^<a id="([^"]+)"><\/a>$/);
    if (link) { anchor = link[1]; continue; }

    const group = line.match(/^##\s+(.+)/);
    if (group) { flush(); section = plainText(group[1]); continue; }

    const heading = line.match(/^###\s+(Art\.\s*.+)/);
    if (heading) {
      flush();
      current = {
        id: anchor ?? `art-${articles.length + 1}`,
        label: plainText(heading[1]),
        section,
        paragraphs: [],
      };
      articles.push(current);
      anchor = null;
      continue;
    }

    if (!current || line.startsWith("#")) continue;
    if (!line) { flush(); continue; }
    paragraph.push(line);
  }
  flush();
  // Algumas alterações foram acrescentadas ao fim do arquivo de origem
  // (por exemplo, art. 8-A depois do art. 12). O leitor segue a numeração legal.
  const articleOrder = (article) => {
    const match = article.label.match(/^Art\.\s*(\d+)(?:[ºo°])?(?:-([A-Z]+))?/i);
    return match ? { number: Number(match[1]), suffix: match[2] ?? "" } : null;
  };
  return articles.sort((left, right) => {
    const a = articleOrder(left);
    const b = articleOrder(right);
    if (!a || !b) return 0;
    return a.number - b.number || a.suffix.localeCompare(b.suffix);
  });
}

await mkdir(publicDir, { recursive: true });
await mkdir(path.dirname(indexPath), { recursive: true });
const index = [];

for (const [filename, subject] of files) {
  const raw = await readFile(path.join(sourceDir, filename), "utf8");
  const { lines, values } = metadata(raw);
  if (!values.id || !values.nome || !values.norma || !values.fonte_oficial) {
    throw new Error(`Incomplete metadata in ${filename}`);
  }
  const articles = parseArticles(lines);
  if (articles.length < 2 || articles.some((article) => !article.paragraphs.length)) {
    throw new Error(`Missing article text in ${filename}`);
  }
  const id = values.id.toLowerCase();
  const officialUrl = values.fonte_oficial;
  if (!officialUrl.startsWith("https://www.planalto.gov.br/")) {
    throw new Error(`Unexpected official source in ${filename}`);
  }
  const doc = { id, articles };
  await writeFile(path.join(publicDir, `${id}.json`), JSON.stringify(doc));
  index.push({
    id,
    title: values.nome,
    norm: values.norma,
    subject,
    officialUrl,
    articleCount: articles.length,
    contentPath: `/laws/${id}.json`,
    sourceDate: values.coleta_pacote ?? null,
  });
}

await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Generated ${index.length} laws and ${index.reduce((sum, law) => sum + law.articleCount, 0)} articles.`);
