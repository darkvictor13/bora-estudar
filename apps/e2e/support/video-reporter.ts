/**
 * Lista os vídeos no fim da execução.
 *
 * O Playwright grava um `.webm` por teste, dentro de `test-results/<teste>/`, e
 * não diz onde. Sem este relatório, quem roda `npm run e2e:video` termina com a
 * pasta cheia e nenhuma pista de qual arquivo corresponde a qual teste.
 *
 * Fica calado quando não há vídeo — é o mesmo reporter nos dois projetos.
 */
import { relative } from "node:path";
import { statSync } from "node:fs";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

interface Recorded {
  readonly title: string;
  readonly path: string;
  readonly status: TestResult["status"];
}

function sizeOf(path: string): string {
  try {
    return `${(statSync(path).size / 1024 / 1024).toFixed(1)} MB`;
  } catch {
    return "—";
  }
}

export default class VideoReporter implements Reporter {
  private readonly videos: Recorded[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    for (const attachment of result.attachments) {
      if (attachment.name !== "video" || !attachment.path) continue;
      this.videos.push({ title: test.titlePath().slice(1).join(" › "), path: attachment.path, status: result.status });
    }
  }

  onEnd(): void {
    if (this.videos.length === 0) return;

    const marker = (status: TestResult["status"]) => (status === "passed" ? "✓" : "✗");
    console.log(`\n🎬 ${this.videos.length} vídeo(s) gravado(s):\n`);
    for (const video of this.videos) {
      console.log(`  ${marker(video.status)} ${video.title}`);
      console.log(`      ${relative(process.cwd(), video.path)}  (${sizeOf(video.path)})`);
    }
    console.log("");
  }
}
