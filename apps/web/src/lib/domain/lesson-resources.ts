import type { LessonMaterialBlock, TheoryLesson } from "../api/contract.ts";

type Resources = TheoryLesson["resources"];
type ResourceName = keyof Resources;

const SESSION_PARAMETERS = new Set(["api_key", "access_token", "token", "signature", "sig"]);

/** O teto de um link, o mesmo de `char_length(<coluna>) <= 2048` nas CHECKs de link. */
export const MAX_LINK_LENGTH = 2048;

/**
 * Qualquer `https://` com host, sem usuário e senha na URL, até
 * `MAX_LINK_LENGTH`. Devolve a frase da recusa, ou `null`. Quem grava em coluna
 * com a CHECK `^https://[^[:space:]]+$` recusa o espaço à parte (`checkLink`):
 * `new URL` aceita `https://x.com/a b`, e aqui a regra é a de quem lê.
 */
export function validateHttpsLink(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Informe um link HTTPS válido.";
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    value.length > MAX_LINK_LENGTH
  ) {
    return "Informe um link HTTPS válido, sem usuário ou senha na URL.";
  }
  return null;
}

function validateLink(value: string): string | null {
  // PDFs publicados pela Fronteira podem ser servidos como arquivos do próprio site.
  if (value.startsWith("/materials/prf/")) {
    return /^\/materials\/prf\/[a-z0-9/-]+\.pdf$/.test(value)
      ? null
      : "Use um caminho de PDF publicado em /materials/prf/, sem parâmetros.";
  }
  const invalid = validateHttpsLink(value);
  if (invalid) return invalid;
  if ([...new URL(value).searchParams.keys()].some((key) => SESSION_PARAMETERS.has(key.toLowerCase()))) {
    return "Use um link permanente. Links com token de sessão não podem ser salvos.";
  }
  return null;
}

/** Os links do catálogo precisam ser permanentes, sem credenciais de sessão. */
export function validateLessonResources(resources: Resources): { field: ResourceName; message: string } | null {
  for (const [field, value] of Object.entries(resources) as [ResourceName, string | null][]) {
    if (value === null) continue;
    const message = validateLink(value);
    if (message) return { field, message };
  }
  return null;
}

export function validateLessonMaterialBlocks(blocks: readonly LessonMaterialBlock[]): string | null {
  if (blocks.length > 30) return "Cada aula pode ter até 30 blocos de materiais.";
  const titles = new Set<string>();
  for (const block of blocks) {
    const title = block.title.trim();
    if (!title || title.length > 120) return "Cada bloco precisa de um título com até 120 caracteres.";
    const key = title.toLocaleLowerCase("pt-BR");
    if (titles.has(key)) return "Os blocos da aula precisam ter títulos diferentes.";
    titles.add(key);
    for (const value of [block.pdf, block.tecQuestions, block.qcQuestions]) {
      if (value === null) continue;
      const message = validateLink(value);
      if (message) return message;
    }
  }
  return null;
}

export function readLessonMaterialBlocks(value: unknown): readonly LessonMaterialBlock[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.title !== "string" || !row.title.trim() || row.title.length > 120) return [];
    const link = (key: string) => {
      const candidate = row[key];
      return typeof candidate === "string" && validateLink(candidate) === null ? candidate : null;
    };
    return [{ title: row.title.trim(), pdf: link("pdf"), tecQuestions: link("tecQuestions"), qcQuestions: link("qcQuestions") }];
  });
}
