import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "content", "laws", "vade-mecum-base-v1");
const outputFile = path.join(root, "apps", "web", "src", "data", "laws", "exam-maps.json");
const lawIndexFile = path.join(root, "apps", "web", "src", "data", "laws", "index.json");

const files = [
  { file: "01_MAPA_PMPR_2025.md", id: "pmpr-2025", shortName: "PMPR", title: "PMPR Soldado 2025", accent: "Soldado" },
  { file: "02_MAPA_PPPR_2024.md", id: "pppr-2024", shortName: "PPPR", title: "Polícia Penal do Paraná 2024", accent: "Policial Penal" },
  { file: "03_MAPA_PRF_2021.md", id: "prf-2021", shortName: "PRF", title: "Polícia Rodoviária Federal 2021", accent: "Policial Rodoviário Federal" },
];

const canonicalByLawId = new Map([
  ["l8072", "BR-FED-LEI-8072-1990"],
  ["l9455", "BR-FED-LEI-9455-1997"],
  ["ed", "BR-FED-LEI-10826-2003"],
  ["ld", "BR-FED-LEI-11343-2006"],
  ["l12850", "BR-FED-LEI-12850-2013"],
  ["l13869", "BR-FED-LEI-13869-2019"],
  ["lmp", "BR-FED-LEI-11340-2006"],
  ["ei", "BR-FED-LEI-10741-2003"],
  ["l7716", "BR-FED-LEI-7716-1989"],
  ["eir", "BR-FED-LEI-12288-2010"],
  ["l9605", "BR-FED-LEI-9605-1998"],
  ["l9296", "BR-FED-LEI-9296-1996"],
  ["l12037", "BR-FED-LEI-12037-2009"],
  ["lje", "BR-FED-LEI-9099-1995"],
  ["lai", "BR-FED-LEI-12527-2011"],
]);

const namedItems = new Map([
  ["Constituição Federal — recortes expressos", { canonicalId: "BR-CF-1988", title: "Constituição Federal de 1988" }],
  ["Declaração Universal dos Direitos Humanos", { canonicalId: "DOC-ONU-DUDH-1948", title: "Declaração Universal dos Direitos Humanos" }],
  ["Convenção Americana sobre Direitos Humanos", { canonicalId: "DOC-OEA-CADH-1969", title: "Convenção Americana sobre Direitos Humanos" }],
  ["Código de Conduta para Funcionários Responsáveis pela Aplicação da Lei", { canonicalId: "DOC-ONU-RES-34-169", title: "Código de Conduta para Funcionários Responsáveis pela Aplicação da Lei" }],
  ["Estatuto Penitenciário do Paraná", { canonicalId: "PENDENTE-ESTATUTO-PENITENCIARIO-PR", title: "Estatuto Penitenciário do Paraná" }],
  ["DUDH", { canonicalId: "DOC-ONU-DUDH-1948", title: "Declaração Universal dos Direitos Humanos" }],
]);

function canonicalTitle(canonicalId) {
  const law = canonicalId.match(/^BR-(?:FED|PR)-LEI-(\d+)-(\d{4})$/);
  if (law) return `Lei nº ${Number(law[1]).toLocaleString("pt-BR")}/${law[2]}`;
  const decree = canonicalId.match(/^BR-(?:FED|PR)-DEC-(\d+)-(\d{4})$/);
  if (decree) return `Decreto nº ${Number(decree[1]).toLocaleString("pt-BR")}/${decree[2]}`;
  return canonicalId;
}

function normalizeLine(value) {
  return value.replace(/\s+/g, " ").trim();
}

function splitDescription(value) {
  const clean = normalizeLine(value.replace(/^[-*]\s+/, ""));
  const canonicalMatch = clean.match(/`([^`]+)`/);
  if (canonicalMatch && canonicalMatch[1] !== "canonical_id") {
    const canonicalId = canonicalMatch[1];
    const rest = clean.replace(canonicalMatch[0], "").replace(/^\s*[—-]\s*/, "").replace(/\.$/, "");
    return { canonicalId, scope: rest || "Conforme o edital" };
  }

  for (const [prefix, item] of namedItems) {
    if (clean.startsWith(prefix)) {
      const scope = clean.slice(prefix.length).replace(/^\s*[—-]\s*/, "").replace(/\.$/, "");
      return { ...item, scope: scope || "Conforme o edital" };
    }
  }
  return null;
}

function parseMap(source, metadata, masterById, libraryByCanonical) {
  const lines = source.split(/\r?\n/);
  const editalCanonical = source.match(/\*\*canonical_id:\*\*\s*`([^`]+)`/)?.[1] ?? metadata.id;
  const sections = [];
  let current = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (raw.startsWith("## ")) {
      const title = raw.slice(3).trim();
      if (["Regra do site", "Regra histórica", "Observação importante"].includes(title)) {
        current = null;
        continue;
      }
      current = { title, items: [] };
      sections.push(current);
      continue;
    }
    if (!current || !raw.startsWith("- ")) continue;

    let combined = raw;
    while (index + 1 < lines.length && /^\s{2,}\S/.test(lines[index + 1])) {
      combined += ` ${lines[index + 1].trim()}`;
      index += 1;
    }
    const parsed = splitDescription(combined);
    if (!parsed) continue;
    const master = masterById.get(parsed.canonicalId);
    const libraryId = libraryByCanonical.get(parsed.canonicalId) ?? null;
    current.items.push({
      canonicalId: parsed.canonicalId,
      title: parsed.title ?? master?.titulo ?? canonicalTitle(parsed.canonicalId),
      scope: parsed.scope,
      libraryId,
      available: Boolean(libraryId),
    });
  }


  if (metadata.id === "pmpr-2025") {
    sections.unshift({
      title: "Constituição Federal — recortes expressos",
      items: [{
        canonicalId: "BR-CF-1988",
        title: masterById.get("BR-CF-1988")?.titulo ?? "Constituição Federal de 1988",
        scope: "Título III, Cap. VII, Seções I e III; Título IV, Cap. III, Seções VII e VIII; Título V, Caps. II e III",
        libraryId: null,
        available: false,
      }],
    });
  }

  if (metadata.id === "pppr-2024") {
    const penitentiary = sections.find((section) => section.title === "Direito Penitenciário / Criminologia");
    if (penitentiary) {
      penitentiary.items = penitentiary.items.filter((item) => item.canonicalId !== "canonical_id");
      penitentiary.items.splice(1, 0, {
        canonicalId: "PENDENTE-ESTATUTO-PENITENCIARIO-PR",
        title: "Estatuto Penitenciário do Paraná",
        scope: "Ato normativo oficial vigente ainda será identificado",
        libraryId: null,
        available: false,
      });
    }
  }

  if (metadata.id === "prf-2021") {
    const traffic = sections.find((section) => section.title === "Legislação de Trânsito");
    if (traffic) {
      traffic.items.push({
        canonicalId: "BR-CONTRAN-RESOLUCOES-PRF-2021",
        title: "Resoluções CONTRAN do edital",
        scope: "40 resoluções, da Resolução 04/1998 à 810/2020; cadastro individual pendente",
        libraryId: null,
        available: false,
      });
    }
  }

  return {
    ...metadata,
    canonicalId: editalCanonical,
    sections: sections.filter((section) => section.items.length > 0),
  };
}

async function main() {
  const master = JSON.parse(await fs.readFile(path.join(sourceDir, "04_LISTA_MESTRA_INICIAL.json"), "utf8"));
  const library = JSON.parse(await fs.readFile(lawIndexFile, "utf8"));
  const masterById = new Map(master.normas.map((norma) => [norma.canonical_id, norma]));
  const libraryByCanonical = new Map(
    library.map((law) => [canonicalByLawId.get(law.id), law.id]).filter(([canonical]) => canonical),
  );
  const maps = [];
  for (const metadata of files) {
    const source = await fs.readFile(path.join(sourceDir, metadata.file), "utf8");
    maps.push(parseMap(source, metadata, masterById, libraryByCanonical));
  }
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify({ version: master.versao, baseDate: master.data_base, maps }, null, 2)}\n`, "utf8");
  const itemCount = maps.reduce((total, map) => total + map.sections.reduce((sum, section) => sum + section.items.length, 0), 0);
  console.log(`Generated ${maps.length} exam maps with ${itemCount} entries.`);
}

await main();
