import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");

test("o hash do script embutido de index.html está na CSP", () => {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  // Um só script embutido (o tema). Outro exigiria o hash dele também.
  assert.equal(inline.length, 1);
  const hash = createHash("sha256").update(inline[0]![1]!).digest("base64");
  assert.ok(
    headers.includes(`'sha256-${hash}'`),
    `a CSP de public/_headers não tem 'sha256-${hash}': o script do tema mudou`,
  );
});

test("os cabeçalhos de segurança estão na regra da casca", () => {
  const shell = headers.slice(headers.indexOf("\n/*\n"), headers.indexOf("\n/assets/*"));
  for (const name of [
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Referrer-Policy:",
    "Permissions-Policy:",
    "Strict-Transport-Security:",
    "Content-Security-Policy-Report-Only:",
  ]) {
    assert.ok(shell.includes(name), `falta ${name} na regra /*`);
  }
});

test("a CSP não abre o que o app não usa", () => {
  const csp = headers.split("\n").find((line) => line.includes("Content-Security-Policy-Report-Only:"))!;
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), "script-src não pode aceitar 'unsafe-inline'");
  assert.ok(!/script-src[^;]*'unsafe-eval'/.test(csp), "script-src não pode aceitar 'unsafe-eval'");
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
});
