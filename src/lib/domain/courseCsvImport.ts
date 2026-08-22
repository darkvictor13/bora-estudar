export type CsvEncoding = "UTF-8" | "Windows-1252";

export type ImportedNotebook = {
  rowNumber: number;
  date: string;
  name: string;
  link: string;
  totalQuestions: number;
  discipline: string | null;
};

export type CourseCsvResult = {
  encoding: CsvEncoding;
  hasDisciplineColumn: boolean;
  notebooks: ImportedNotebook[];
  warnings: string[];
};

const REQUIRED_COLUMNS = ["nome", "link", "total"] as const;
const MAX_ROWS = 5_000;

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[\s_-]+/g, "");
}

function decodeCsv(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "UTF-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "Windows-1252",
    };
  }
}

function detectDelimiter(text: string) {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === ",") commas += 1;
    else if (!quoted && character === ";") semicolons += 1;
    else if (!quoted && (character === "\n" || character === "\r")) break;
  }

  return semicolons > commas ? ";" : ",";
}

function parseRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("O CSV termina dentro de um campo entre aspas.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((item) => item.some((value) => value.trim().length > 0));
}

function parseTotal(value: string, rowNumber: number) {
  const normalized = value.trim().replace(/\./g, "");
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Linha ${rowNumber}: Total deve ser um número inteiro maior ou igual a zero.`);
  }
  const total = Number(normalized);
  if (!Number.isSafeInteger(total)) {
    throw new Error(`Linha ${rowNumber}: Total está fora do intervalo aceito.`);
  }
  return total;
}

function validateLink(value: string, rowNumber: number) {
  const link = value.trim();
  if (!link) return "";
  try {
    const url = new URL(link);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  } catch {
    throw new Error(`Linha ${rowNumber}: Link deve ser uma URL HTTP ou HTTPS válida.`);
  }
  return link;
}

export function parseCourseCsv(bytes: Uint8Array): CourseCsvResult {
  if (bytes.byteLength === 0) throw new Error("O arquivo CSV está vazio.");

  const decoded = decodeCsv(bytes);
  const text = decoded.text.replace(/^\uFEFF/, "");
  const rows = parseRows(text, detectDelimiter(text));
  if (rows.length < 2) throw new Error("O CSV precisa conter o cabeçalho e pelo menos um caderno.");

  const header = rows[0].map(normalizeHeader);
  const indexes = new Map(header.map((name, index) => [name, index]));
  const missing = REQUIRED_COLUMNS.filter((column) => !indexes.has(column));
  if (missing.length > 0) {
    throw new Error(`Coluna(s) obrigatória(s) ausente(s): ${missing.join(", ")}.`);
  }

  const dataIndex = indexes.get("data");
  const nameIndex = indexes.get("nome")!;
  const linkIndex = indexes.get("link")!;
  const totalIndex = indexes.get("total")!;
  const disciplineIndex = indexes.get("disciplina");
  const notebooks: ImportedNotebook[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const source = rows[index];
    const rowNumber = index + 1;
    const name = (source[nameIndex] ?? "").trim();
    if (!name) throw new Error(`Linha ${rowNumber}: Nome do caderno é obrigatório.`);

    notebooks.push({
      rowNumber,
      date: dataIndex === undefined ? "" : (source[dataIndex] ?? "").trim(),
      name,
      link: validateLink(source[linkIndex] ?? "", rowNumber),
      totalQuestions: parseTotal(source[totalIndex] ?? "", rowNumber),
      discipline: disciplineIndex === undefined
        ? null
        : (source[disciplineIndex] ?? "").trim() || null,
    });
  }

  if (notebooks.length > MAX_ROWS) {
    throw new Error(`O CSV possui ${notebooks.length} linhas; o limite por importação é ${MAX_ROWS}.`);
  }

  const warnings: string[] = [];
  const duplicateLinks = notebooks.length - new Set(notebooks.map((item) => item.link).filter(Boolean)).size;
  const linkedRows = notebooks.filter((item) => item.link).length;
  if (duplicateLinks > notebooks.length - linkedRows) {
    warnings.push("Há links repetidos no arquivo. Eles serão mantidos como cadernos separados.");
  }
  if (disciplineIndex === undefined) {
    warnings.push("O arquivo não possui a coluna Disciplina. Organize os cadernos por disciplina antes de importar.");
  } else if (notebooks.some((item) => !item.discipline)) {
    warnings.push("Algumas linhas não informam Disciplina e precisam ser classificadas antes da importação.");
  }

  return {
    encoding: decoded.encoding,
    hasDisciplineColumn: disciplineIndex !== undefined,
    notebooks,
    warnings,
  };
}

export function courseNameFromFileName(fileName: string) {
  return fileName
    .replace(/\.csv$/i, "")
    .replace(/^\s*\d+\s*[-–—_]+\s*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function courseCodeFromName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
