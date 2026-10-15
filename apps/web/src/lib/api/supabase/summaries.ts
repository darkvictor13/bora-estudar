import { supabase } from "@/lib/supabase/client";
import type { SummaryBlock, SummaryDocument, SummaryTopic } from "../summaries";
import { requireSession } from "./session";
import { throwDb } from "./errors";
import { done, fail, recoverThrown, translateDbError, failure } from "./errors";
import type { Result, SummaryNote } from "../contract.ts";
import type { Json } from "@bora/database";
import { validSummaryNotes } from "@/lib/domain/summary-notes";

export async function loadSummaryCatalog(): Promise<SummaryTopic[]> {
  await requireSession();
  const { data, error } = await supabase.from("summary_topics").select("id,subject,title").order("position");
  if (error) throwDb(error);
  return data ?? [];
}

export async function loadSummaryDocument(id: string): Promise<SummaryDocument | null> {
  await requireSession();
  const { data, error } = await supabase.from("summary_topics").select("id,subject,title,source_name,blocks").eq("id", id).maybeSingle();
  if (error) throwDb(error);
  if (!data) return null;
  const blocks = data.blocks as unknown as SummaryBlock[];
  const images: Extract<SummaryBlock, { type: "image" }>[] = [];
  function collect(items: SummaryBlock[]) {
    for (const block of items) {
      if (block.type === "image") images.push(block);
      else if (block.type === "table") for (const row of block.rows) for (const cell of row) collect(cell);
    }
  }
  collect(blocks);
  if (images.length) {
    const keys = [...new Set(images.map(image => `pf2029/${image.key}`))];
    const signed = await supabase.storage.from("flash-summaries").createSignedUrls(keys, 3600);
    if (signed.error) throw new Error("Não foi possível carregar as imagens do resumo.");
    const urls = new Map((signed.data ?? []).map(item => [item.path, item.signedUrl]));
    for (const image of images) {
      const url = urls.get(`pf2029/${image.key}`);
      if (!url) throw new Error("Não foi possível carregar uma imagem do resumo.");
      image.url = url;
    }
  }
  return { id: data.id, subject: data.subject, title: data.title, sourceName: data.source_name, blocks };
}

export async function loadSummaryNotes(id: string): Promise<SummaryNote[]> {
  const session = await requireSession();
  const { data, error } = await supabase.from("summary_annotations").select("notes")
    .eq("user_id", session.profileId).eq("topic_id", id).maybeSingle();
  if (error) throwDb(error);
  if (!data) return [];
  if (!validSummaryNotes(data.notes)) throw new Error("As anotações deste resumo têm um formato inválido.");
  return data.notes;
}

export async function saveSummaryNotes(id: string, previous: readonly SummaryNote[], next: readonly SummaryNote[]): Promise<Result<null>> {
  try {
    if (!validSummaryNotes(next)) return fail("validation", "Confira as anotações: cada comentário aceita até 2.000 caracteres.");
    await requireSession();
    // A comparação com o estado anterior (para não sobrescrever outra aba) mora
    // na função e vai no corpo da requisição: no filtro de URL, o JSON das
    // anotações estourava o limite dos proxies muito antes do teto da coluna.
    const saved = await supabase.rpc("save_summary_notes", {
      p_topic_id: id, p_previous: previous as unknown as Json, p_next: next as unknown as Json,
    });
    if (saved.error) return failure(translateDbError(saved.error));
    if (!saved.data) return fail("conflict", "As anotações mudaram em outra aba. Recarregue o resumo antes de continuar.");
    return done(null);
  } catch (error) { return recoverThrown(error); }
}
