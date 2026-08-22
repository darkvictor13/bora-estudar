import assert from "node:assert/strict";
import test from "node:test";

import {
  courseCodeFromName,
  courseNameFromFileName,
  parseCourseCsv,
} from "./courseCsvImport.ts";

function bytes(text: string) {
  return new TextEncoder().encode(text);
}

test("parseCourseCsv reads the provided column contract and quoted line breaks", () => {
  const result = parseCourseCsv(bytes([
    "Data,Nome,Link,Total,Resolvidas,Acertos,Erros,Disciplina",
    "07/02/2025,\"01. Conceito, internet\",https://www.tecconcursos.com.br/s/abc,87,0,0%,0%,Informática",
    "07/02/2025,\"02. Sistemas\nOperacionais\",https://www.tecconcursos.com.br/s/def,120,0,0%,0%,Informática",
  ].join("\r\n")));

  assert.equal(result.encoding, "UTF-8");
  assert.equal(result.hasDisciplineColumn, true);
  assert.equal(result.notebooks.length, 2);
  assert.deepEqual(result.notebooks[0], {
    rowNumber: 2,
    date: "07/02/2025",
    name: "01. Conceito, internet",
    link: "https://www.tecconcursos.com.br/s/abc",
    totalQuestions: 87,
    discipline: "Informática",
  });
  assert.equal(result.notebooks[1].name, "02. Sistemas\nOperacionais");
});

test("parseCourseCsv accepts semicolons, normalized headers and Windows-1252", () => {
  const source = "NOME;Línk;Tótal\r\nNoções de Administração;https://example.com/a;1.234";
  const cp1252 = Uint8Array.from(Buffer.from(source, "latin1"));
  const result = parseCourseCsv(cp1252);

  assert.equal(result.encoding, "Windows-1252");
  assert.equal(result.notebooks[0].name, "Noções de Administração");
  assert.equal(result.notebooks[0].totalQuestions, 1234);
  assert.match(result.warnings[0], /não possui a coluna Disciplina/);
});

test("parseCourseCsv rejects missing columns and invalid links", () => {
  assert.throws(
    () => parseCourseCsv(bytes("Nome,Link\nCaderno,https://example.com")),
    /Coluna.*total/,
  );
  assert.throws(
    () => parseCourseCsv(bytes("Nome,Link,Total\nCaderno,javascript:alert(1),10")),
    /Linha 2.*HTTP ou HTTPS/,
  );
});

test("course fields are suggested from the file name", () => {
  const name = courseNameFromFileName("03---Polícia-Federal.csv");
  assert.equal(name, "Polícia Federal");
  assert.equal(courseCodeFromName(name), "POLICIA-FEDERAL");
});
