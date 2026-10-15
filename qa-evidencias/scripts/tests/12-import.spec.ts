/** Fluxo 11 — importar MASTER com arquivos inválidos. */
import { addTheoryCatalog, go, test } from "../qa.ts";

const FILES: Array<[string, string, string]> = [
  ["texto.json", "isto não é json", "não é JSON"],
  ["vazio.json", "", "arquivo vazio"],
  ["objeto.json", "{}", "objeto vazio"],
  ["lista.json", "[1,2,3]", "lista de números"],
  ["nulo.json", "null", "null"],
];

test("F11.3 importar MASTER inválido explica e não quebra a tela", async ({ teacherPage: page, scenario, shot, finding }) => {
  await addTheoryCatalog(scenario);
  await go(page, "/professor/teoria");
  for (const [name, body, label] of FILES) {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(body) });
    await page.waitForTimeout(1500);
    const h1 = await page.locator("h1").allTextContents();
    const msg = (await page.locator('[data-testid="alert"]').allTextContents()).join(" | ");
    if (h1.some((h) => /Algo deu errado/.test(h))) {
      await shot(page, `F11.3 importar ${label}`);
      finding({ severity: "Médio", title: `Importar MASTER (${label}) derruba a tela`, detail: msg });
      await go(page, "/professor/teoria", { hard: true });
    } else if (!msg) {
      await shot(page, `F11.3 importar ${label}`);
      finding({ severity: "Baixo", title: `Importar MASTER (${label}) não dá retorno nenhum`, detail: "" });
    } else if (/Unexpected token|JSON\.parse|is not valid JSON|Cannot read|undefined/i.test(msg)) {
      await shot(page, `F11.3 importar ${label}`);
      finding({ severity: "Baixo", title: `Importar MASTER (${label}) mostra mensagem técnica`, detail: msg });
    }
  }
});
