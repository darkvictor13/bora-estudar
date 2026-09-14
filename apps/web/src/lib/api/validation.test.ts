/**
 * A validação é do CONTRATO, não de quem o cumpre.
 *
 * Estes testes existem para que `fixtures` e `supabase` não possam divergir na
 * frase que a pessoa lê: a tela construída contra a fixture mostraria um texto
 * em desenvolvimento e outro em produção, e o teste que fixou o primeiro
 * passaria a mentir sem falhar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { checkCredentials, checkName, checkPassword, checkSignUp } from "./validation.ts";

test("entrar sem e-mail ou sem senha pede os dois, sem culpar um campo", () => {
  // Sem `field`: apontar o e-mail quando faltam os dois manda a pessoa
  // preencher metade e tentar de novo.
  assert.deepEqual(checkCredentials({ email: "", password: "" }), {
    code: "validation",
    message: "Informe e-mail e senha.",
  });
  assert.deepEqual(checkCredentials({ email: "  ", password: "x" })?.message, "Informe e-mail e senha.");
  assert.equal(checkCredentials({ email: "a@b.com", password: "x" }), null);
});

test("a senha curta é recusada com o campo, para a tela saber o que marcar", () => {
  const erro = checkPassword("12345");
  assert.equal(erro?.field, "password");
  assert.match(erro!.message, /pelo menos 6 caracteres/);
  assert.equal(checkPassword("123456"), null);
});

test("o cadastro recusa na ordem em que a pessoa preenche", () => {
  // Nome primeiro: reclamar da senha de quem nem digitou o nome faz a pessoa
  // corrigir de baixo para cima.
  const semNada = checkSignUp({ name: "Jo", email: "", password: "123" });
  assert.equal(semNada?.field, "name");

  const semEmail = checkSignUp({ name: "Maria Silva", email: " ", password: "123" });
  assert.equal(semEmail?.field, "email");

  const senhaCurta = checkSignUp({ name: "Maria Silva", email: "a@b.com", password: "123" });
  assert.equal(senhaCurta?.field, "password");

  assert.equal(checkSignUp({ name: "Maria Silva", email: "a@b.com", password: "123456" }), null);
});

test("o nome é medido sem os espaços em volta", () => {
  assert.equal(checkName("  Jo  ")?.field, "name");
  assert.equal(checkName("  Ana  "), null);
});
