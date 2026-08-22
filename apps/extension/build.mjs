import { context, build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const watchMode = process.argv.includes("--watch");
const root = new URL("./", import.meta.url).pathname;

/**
 * Cada alvo vira um bundle independente e autocontido.
 *
 * O content script não pode usar `import` em runtime: ele é injetado como
 * script clássico na página. Por isso `format: "iife"` e o código de
 * @bora/protocol embutido no bundle, em vez de resolvido pelo navegador.
 */
const targets = [
  { entry: "src/content/index.ts", output: "dist/content.js" },
  { entry: "src/popup/index.ts", output: "dist/popup.js" },
];

const sharedOptions = {
  bundle: true,
  format: "iife",
  target: ["chrome114", "firefox115"],
  platform: "browser",
  sourcemap: watchMode ? "inline" : false,
  minify: !watchMode,
  logLevel: "info",
};

async function copyStaticFiles() {
  await cp(`${root}static`, `${root}dist`, { recursive: true });
}

await rm(`${root}dist`, { recursive: true, force: true });
await mkdir(`${root}dist`, { recursive: true });
await copyStaticFiles();

if (watchMode) {
  const contexts = await Promise.all(
    targets.map((target) =>
      context({ ...sharedOptions, entryPoints: [target.entry], outfile: target.output }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("[extensão] observando alterações. Ctrl+C para sair.");
} else {
  await Promise.all(
    targets.map((target) =>
      build({ ...sharedOptions, entryPoints: [target.entry], outfile: target.output }),
    ),
  );
  console.log("[extensão] build concluído em dist/");
}
