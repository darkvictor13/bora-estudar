import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LINK_LENGTH,
  readLessonMaterialBlocks,
  validateHttpsLink,
  validateLessonMaterialBlocks,
  validateLessonResources,
} from "./lesson-resources.ts";

const empty = {
  pdf: null,
  flashcards: null,
  flashSummary: null,
  tecQuestions: null,
  qcQuestions: null,
};

test("aceita links permanentes HTTPS para os materiais da aula", () => {
  assert.equal(validateLessonResources({
    ...empty,
    pdf: "https://fronteira.example/materiais/aula-01.pdf",
    tecQuestions: "https://www.tecconcursos.com.br/questoes/123",
  }), null);
});

test("recusa link temporário com credencial de sessão", () => {
  assert.deepEqual(validateLessonResources({
    ...empty,
    pdf: "https://media.example/aula.pdf?access_token=segredo",
  }), {
    field: "pdf",
    message: "Use um link permanente. Links com token de sessão não podem ser salvos.",
  });
});

test("recusa esquemas que poderiam executar código no navegador", () => {
  assert.equal(validateLessonResources({ ...empty, flashcards: "javascript:alert(1)" })?.field, "flashcards");
});

test("aceita blocos por tópico com PDF próprio e cadernos", () => {
  assert.equal(validateLessonMaterialBlocks([
    { title: "Segurança da informação", pdf: "/materials/prf/informatica/conceitos-protecao-seguranca.pdf", tecQuestions: "https://www.tecconcursos.com.br/s/Q5FFjM", qcQuestions: null },
  ]), null);
});

test("recusa bloco com token, caminho inseguro ou título duplicado", () => {
  const block = { title: "Acentuação", pdf: "https://media.example/aula.pdf?access_token=segredo", tecQuestions: null, qcQuestions: null };
  assert.match(validateLessonMaterialBlocks([block]) ?? "", /token de sessão/);
  assert.match(validateLessonMaterialBlocks([{ ...block, pdf: "/materials/prf/../segredo.pdf" }]) ?? "", /caminho de PDF/);
  assert.match(validateLessonMaterialBlocks([{ ...block, pdf: null }, { ...block, pdf: null }]) ?? "", /títulos diferentes/);
});

test("descarta links inseguros recebidos do banco antes de exibi-los", () => {
  assert.deepEqual(readLessonMaterialBlocks([
    { title: " Aula 1 ", pdf: "javascript:alert(1)", tecQuestions: "https://www.tecconcursos.com.br/s/Q5FFjM", qcQuestions: "https://media.example/aula?access_token=segredo" },
  ]), [
    { title: "Aula 1", pdf: null, tecQuestions: "https://www.tecconcursos.com.br/s/Q5FFjM", qcQuestions: null },
  ]);
});

test("QA-24 · validateHttpsLink aceita qualquer https com host e recusa o resto, com a mesma frase de sempre", () => {
  assert.equal(validateHttpsLink("https://www.tecconcursos.com.br/"), null);
  assert.equal(validateHttpsLink("https://outro.example/a?b=1#c"), null);
  assert.equal(validateHttpsLink("https://x.com/" + "a".repeat(MAX_LINK_LENGTH - 14)), null);

  // Não é URL: a frase curta.
  assert.equal(validateHttpsLink("x.com"), "Informe um link HTTPS válido.");
  // É URL, e não é https, ou tem credencial, ou passa do teto: a frase longa.
  for (const recusado of [
    "javascript:alert(1)",
    "http://x.com",
    "ftp://x.com/y",
    "https://user:senha@x.com",
    "https://x.com/" + "a".repeat(MAX_LINK_LENGTH),
  ]) {
    assert.equal(
      validateHttpsLink(recusado),
      "Informe um link HTTPS válido, sem usuário ou senha na URL.",
      recusado,
    );
  }
  // Token de sessão não é assunto dela: quem cobra é `validateLessonResources`.
  assert.equal(validateHttpsLink("https://m.example/a.pdf?token=x"), null);
});
