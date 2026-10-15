/** Roda os testes em Python do repositório com o interpretador que existir: `python3` (Linux, macOS, CI) ou `python` (Windows). */
import { spawnSync } from "node:child_process";

const tests = ["scripts/import-flash-summaries.test.py"];
const interpreter = ["python3", "python"].find((name) => spawnSync(name, ["--version"], { stdio: "ignore" }).status === 0);
if (!interpreter) throw new Error("Nenhum interpretador Python encontrado (tentei python3 e python).");
for (const test of tests) {
  // -I: isolado — não carrega módulo do diretório atual nem do script.
  const { status } = spawnSync(interpreter, ["-I", test], { stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
}
