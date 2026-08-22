import { context, build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const observar = process.argv.includes("--watch");
const raiz = new URL("./", import.meta.url).pathname;

/**
 * Cada alvo vira um bundle independente e autocontido.
 *
 * O content script não pode usar `import` em runtime: ele é injetado como
 * script clássico na página. Por isso `format: "iife"` e o código de
 * @bora/protocol embutido no bundle, em vez de resolvido pelo navegador.
 */
const alvos = [
  { entrada: "src/content/index.ts", saida: "dist/content.js" },
  { entrada: "src/popup/index.ts", saida: "dist/popup.js" },
];

const opcoesComuns = {
  bundle: true,
  format: "iife",
  target: ["chrome114", "firefox115"],
  platform: "browser",
  sourcemap: observar ? "inline" : false,
  minify: !observar,
  logLevel: "info",
};

async function copiarEstaticos() {
  await cp(`${raiz}static`, `${raiz}dist`, { recursive: true });
}

await rm(`${raiz}dist`, { recursive: true, force: true });
await mkdir(`${raiz}dist`, { recursive: true });
await copiarEstaticos();

if (observar) {
  const contextos = await Promise.all(
    alvos.map((alvo) =>
      context({ ...opcoesComuns, entryPoints: [alvo.entrada], outfile: alvo.saida }),
    ),
  );
  await Promise.all(contextos.map((c) => c.watch()));
  console.log("[extensão] observando alterações. Ctrl+C para sair.");
} else {
  await Promise.all(
    alvos.map((alvo) =>
      build({ ...opcoesComuns, entryPoints: [alvo.entrada], outfile: alvo.saida }),
    ),
  );
  console.log("[extensão] build concluído em dist/");
}
