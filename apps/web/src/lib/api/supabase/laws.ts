import { diffLawMarks } from "@/lib/domain/law-markings";
import { supabase } from "@/lib/supabase/client";

import type { Result } from "../contract.ts";
import type { LawDocument, LawExamMaps, LawLibrary, LawMark, LawMarkColor, LawMarkStyle, SaveLawMarksInput } from "../laws.ts";
import { done, failure, throwDb, translateDbError } from "./errors.ts";
import { once } from "./idempotency.ts";
import { requireSession } from "./session.ts";

// O Vade Mecum vem do banco (spec 40). O índice é aberto a autenticado; o
// texto de `law_articles`, só a quem tem acesso vigente ou é professor.

interface LibraryRow { law_id: string; norm_id: string; title: string; norm_label: string; subject_id: string; official_url: string; source_date: string | null; article_count: number }
interface ItemRow { notice_id: string; section_position: number; position: number; norm_id: string; scope: string; norm: { title: string; law: { id: string } | { id: string }[] | null } | null }
interface MarkRow { id: string; article_id: string; paragraph_index: number; start_offset: number; end_offset: number; style: LawMarkStyle; color: LawMarkColor; quote: string; prefix: string; suffix: string }

const MARK_COLUMNS = "id,article_id,paragraph_index,start_offset,end_offset,style,color,quote,prefix,suffix";

export async function loadLawLibrary(): Promise<LawLibrary> {
  await requireSession();
  const [subjects, laws] = await Promise.all([
    supabase.from("law_subjects").select("id,name").order("position"),
    supabase.from("vw_law_library").select("law_id,norm_id,title,norm_label,subject_id,official_url,source_date,article_count").order("position"),
  ]);
  if (subjects.error) throwDb(subjects.error);
  if (laws.error) throwDb(laws.error);
  const names = new Map((subjects.data ?? []).map((row) => [row.id, row.name]));
  return {
    subjects: (subjects.data ?? []).map((row) => row.name),
    laws: ((laws.data ?? []) as LibraryRow[]).map((row) => ({
      id: row.law_id, canonicalId: row.norm_id, title: row.title, norm: row.norm_label,
      subject: names.get(row.subject_id) ?? row.subject_id, officialUrl: row.official_url,
      sourceDate: row.source_date, articleCount: row.article_count,
    })),
  };
}

export async function loadLawDocument(lawId: string): Promise<LawDocument | null> {
  await requireSession();
  const { data: law, error } = await supabase.from("laws").select("id").eq("id", lawId).maybeSingle();
  if (error) throwDb(error);
  if (!law) return null;
  const { data: articles, error: articlesError } = await supabase.from("law_articles")
    .select("id,label,section,paragraphs").eq("law_id", lawId).is("retired_at", null).order("position");
  if (articlesError) throwDb(articlesError);
  return { id: lawId, articles: articles ?? [] };
}

export async function loadExamMaps(): Promise<LawExamMaps> {
  await requireSession();
  const [notices, sections, items] = await Promise.all([
    supabase.from("exam_notices").select("id,canonical_id,short_name,title,accent,base_date").order("position"),
    supabase.from("exam_notice_sections").select("notice_id,position,title").order("notice_id").order("position"),
    supabase.from("exam_notice_items")
      .select("notice_id,section_position,position,norm_id,scope,norm:legal_norms(title,law:laws(id))")
      .order("notice_id").order("section_position").order("position"),
  ]);
  if (notices.error) throwDb(notices.error);
  if (sections.error) throwDb(sections.error);
  if (items.error) throwDb(items.error);
  const itemRows = (items.data ?? []) as unknown as ItemRow[];
  return {
    baseDate: notices.data?.[0]?.base_date ?? "",
    maps: (notices.data ?? []).map((notice) => ({
      id: notice.id, shortName: notice.short_name, title: notice.title, accent: notice.accent, canonicalId: notice.canonical_id,
      sections: (sections.data ?? []).filter((section) => section.notice_id === notice.id).map((section) => ({
        title: section.title,
        items: itemRows.filter((item) => item.notice_id === notice.id && item.section_position === section.position).map((item) => {
          // Um para um (`laws.norm_id` é UNIQUE), mas o PostgREST pode devolver
          // a relação embutida como lista; aceitar as duas formas não custa nada.
          const law = Array.isArray(item.norm?.law) ? item.norm.law[0] ?? null : item.norm?.law ?? null;
          return { canonicalId: item.norm_id, title: item.norm?.title ?? item.norm_id, scope: item.scope, libraryId: law?.id ?? null, available: Boolean(law) };
        }),
      })),
    })),
  };
}

export async function loadLawMarks(lawId: string): Promise<readonly LawMark[]> {
  const session = await requireSession();
  const { data, error } = await supabase.from("law_marks").select(MARK_COLUMNS)
    .eq("student_id", session.profileId).eq("law_id", lawId);
  if (error) throwDb(error);
  return ((data ?? []) as MarkRow[]).map((row) => ({
    id: row.id, articleId: row.article_id, paragraphIndex: row.paragraph_index, start: row.start_offset, end: row.end_offset,
    style: row.style, color: row.color, quote: row.quote, prefix: row.prefix, suffix: row.suffix,
  }));
}

function markValues(mark: LawMark) {
  return {
    paragraph_index: mark.paragraphIndex, start_offset: mark.start, end_offset: mark.end,
    style: mark.style, color: mark.color, quote: mark.quote, prefix: mark.prefix, suffix: mark.suffix,
  };
}

/**
 * Grava a diferença entre o antes e o depois, por id (R-LEI-15). Repetir é
 * inofensivo — e é a PK `law_marks_pkey` que garante: criar é `on conflict do
 * nothing` com o id que o navegador gerou, alterar grava valores absolutos e
 * apagar é por id.
 */
export function saveLawMarks(input: SaveLawMarksInput): Promise<Result<null>> {
  return once(input.requestId, async () => {
    const session = await requireSession();
    const diff = diffLawMarks(input.previous, input.next);
    if (diff.remove.length > 0) {
      const { error } = await supabase.from("law_marks").delete()
        .eq("student_id", session.profileId).eq("law_id", input.lawId).in("id", diff.remove);
      if (error) return failure<null>(translateDbError(error));
    }
    if (diff.insert.length > 0) {
      const { error } = await supabase.from("law_marks").upsert(
        diff.insert.map((mark) => ({ id: mark.id, student_id: session.profileId, law_id: input.lawId, article_id: mark.articleId, ...markValues(mark) })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) return failure<null>(translateDbError(error));
    }
    for (const mark of diff.update) {
      const { error } = await supabase.from("law_marks").update(markValues(mark))
        .eq("student_id", session.profileId).eq("id", mark.id);
      if (error) return failure<null>(translateDbError(error));
    }
    return done(null);
  });
}
