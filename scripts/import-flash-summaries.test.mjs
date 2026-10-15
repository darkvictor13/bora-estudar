/** Verifica a estrutura, quebras de linha, imagens e tabelas da importação. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { strToU8, zipSync } from "fflate";
import { extract } from "./import-flash-summaries.mjs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const document = (body, extra = "") =>
  `<w:document xmlns:w="${W}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"${extra}><w:body>${body}</w:body></w:document>`;
const heading = (style, text) => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;

/** Roda `fn` numa pasta temporária, apagada no fim. */
function withDirectory(fn) {
  const directory = mkdtempSync(join(tmpdir(), "import-flash-summaries-"));
  try {
    return fn(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Monta um DOCX mínimo em disco. `parts` sobrescreve ou acrescenta partes do ZIP. */
function docx(directory, body, { styles, rels = "<Relationships/>", parts = {} } = {}) {
  const files = { "word/_rels/document.xml.rels": strToU8(rels), "word/document.xml": strToU8(document(body)) };
  if (styles) files["word/styles.xml"] = strToU8(styles);
  for (const [name, content] of Object.entries(parts)) files[name] = typeof content === "string" ? strToU8(content) : content;
  const path = join(directory, "caso.docx");
  writeFileSync(path, zipSync(files));
  return path;
}

describe("importação do DOCX dos resumos flash", () => {
  it("preserva a ordem e as imagens", () => {
    withDirectory((directory) => {
      const body = `${heading("Ttulo1", "Informática")}${heading("Ttulo2", "Redes")}
        <w:p><w:r><w:t>Antes</w:t><w:br/><w:t>da imagem</w:t><a:blip r:embed="r1"/><w:t>Depois</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Célula</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
      const source = docx(directory, body, {
        rels: '<Relationships><Relationship Id="r1" Type="test/image" Target="media/image.png"/></Relationships>',
        parts: { "word/media/image.png": strToU8("original-image") },
      });
      const result = extract(source, join(directory, "out"));
      const blocks = result.topics[0].blocks;
      assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "image", "paragraph", "table"]);
      assert.equal(blocks[0].text, "Antes\nda imagem");
      assert.equal(blocks[3].rows[0][0][0].text, "Célula");
      assert.equal(readFileSync(join(directory, "out/media", blocks[1].key), "utf8"), "original-image");
      assert.equal(JSON.parse(readFileSync(join(directory, "out/library.json"), "utf8")).source, "caso.docx");
    });
  });

  it("reconhece título pelo nome do estilo, e não só pelo id em pt-BR", () => {
    // Word em inglês grava "Heading1"; um id personalizado vem do styles.xml.
    const styles =
      `<w:styles xmlns:w="${W}">` +
      '<w:style w:styleId="MeuTitulo"><w:name w:val="heading 1"/></w:style>' +
      '<w:style w:styleId="MeuSub"><w:name w:val="Título 2"/></w:style></w:styles>';
    const body =
      heading("MeuTitulo", "Penal") + heading("MeuSub", "Inquérito") + "<w:p><w:r><w:t>Corpo</w:t></w:r></w:p>" +
      heading("Heading1", "Processo") + heading("Heading2", "Prazos") + "<w:p><w:r><w:t>Outro corpo</w:t></w:r></w:p>";
    withDirectory((directory) => {
      const result = extract(docx(directory, body, { styles }), join(directory, "out"));
      assert.deepEqual(result.topics.map((t) => [t.subject, t.title]), [["Penal", "Inquérito"], ["Processo", "Prazos"]]);
    });
  });

  it("mantém tabelas aninhadas", () => {
    const inner = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Interna</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const body = `${heading("Ttulo1", "A")}${heading("Ttulo2", "B")}<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Externa</w:t></w:r></w:p>${inner}</w:tc></w:tr></w:tbl>`;
    withDirectory((directory) => {
      const result = extract(docx(directory, body), join(directory, "out"));
      const cell = result.topics[0].blocks[0].rows[0][0];
      assert.equal(cell[0].text, "Externa");
      assert.equal(cell[1].type, "table");
      assert.equal(cell[1].rows[0][0][0].text, "Interna");
    });
  });

  it("recusa DTD e partes acima do teto", () => {
    withDirectory((directory) => {
      const dtd = docx(directory, "", {
        parts: { "word/document.xml": `<!DOCTYPE d [<!ENTITY a "x">]>${document("")}` },
      });
      assert.throws(() => extract(dtd, join(directory, "out")), /DTD/);
      assert.throws(
        () => extract(docx(directory, "<w:p/>"), join(directory, "out2"), { maxPartBytes: 10 }),
        /descomprime/,
      );
      assert.throws(
        () => extract(docx(directory, "<w:p/>"), join(directory, "out3"), { maxTotalBytes: 10 }),
        /limite total/,
      );
    });
  });

  it("ignora imagem cujo alvo escapa de word/media", () => {
    withDirectory((directory) => {
      const body = `${heading("Ttulo1", "A")}${heading("Ttulo2", "B")}<w:p><w:r><w:t>x</w:t><a:blip r:embed="r1"/></w:r></w:p>`;
      const source = docx(directory, body, {
        rels: '<Relationships><Relationship Id="r1" Type="test/image" Target="../customXml/item.png"/></Relationships>',
        parts: { "customXml/item.png": strToU8("fora") },
      });
      const result = extract(source, join(directory, "out"));
      assert.deepEqual(result.topics[0].blocks.map((b) => b.type), ["paragraph"]);
      assert.deepEqual(result.assets, []);
    });
  });
});
