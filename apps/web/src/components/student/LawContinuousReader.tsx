import ArrowOutwardIcon from "@mui/icons-material/ArrowOutwardOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card } from "@bora/ui";
import { useEffect, useRef, useState } from "react";

import { MarkingToolbar, markSx } from "@/components/MarkingToolbar";
import type { Result } from "@/lib/api";
import { selectedTexts } from "@/lib/ui/textSelection";
import { useMarkingSession } from "@/lib/ui/useMarkingSession";
import type { LawDocument, LawEntry } from "@/lib/domain/law-library";
import {
  anchorLawMarks,
  eraseLawRanges,
  paintLawRanges,
  segmentLawText,
  withLawQuotes,
  type LawMark,
  type LawMarkColor,
  type LawMarkStyle,
  type LawTextRange,
} from "@/lib/domain/law-markings";

interface Props {
  readonly law: LawEntry;
  readonly document: LawDocument;
  /** Como estão gravadas na conta; o leitor as reancora no texto atual. */
  readonly initialMarks: readonly LawMark[];
  readonly requestedArticleId: string | null;
  readonly onActiveArticle: (articleId: string) => void;
  /** Grava UMA ação: o antes e o depois (spec 40, R-LEI-15). */
  readonly onSaveMarks: (previous: readonly LawMark[], next: readonly LawMark[]) => Promise<Result<null>>;
}

function selectedParagraphRanges(root: HTMLElement): LawTextRange[] {
  return selectedTexts(root, "[data-law-paragraph]").flatMap(({ element, start, end }) => {
    const articleId = element.dataset.articleId;
    const paragraphIndex = Number(element.dataset.paragraphIndex);
    return articleId && Number.isInteger(paragraphIndex) ? [{ articleId, paragraphIndex, start, end }] : [];
  });
}

export function LawContinuousReader({ law, document: lawDocument, initialMarks, requestedArticleId, onActiveArticle, onSaveMarks }: Props) {
  // A reancoragem roda uma vez, na montagem: as que perderam o trecho
  // continuam gravadas, não são pintadas e são contadas (R-LEI-13).
  const [anchored] = useState(() => anchorLawMarks(initialMarks, lawDocument));
  const { marks, change, undoLast, canUndo, saveError } = useMarkingSession<LawMark>(anchored.placed, onSaveMarks);
  const [selection, setSelection] = useState<LawTextRange[]>([]);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!requestedArticleId) return;
    const target = document.getElementById(requestedArticleId);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }, [requestedArticleId]);

  useEffect(() => {
    const root = content.current;
    if (!root) return;
    const scrollContainer = root.closest("main");
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-law-article]")];
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = nodes[0];
      for (const node of nodes) {
        if (node.getBoundingClientRect().top > 205) break;
        current = node;
      }
      if (current) onActiveArticle(current.id);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    scrollContainer?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      scrollContainer?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [lawDocument, onActiveArticle]);

  const captureSelection = () => {
    if (content.current) setSelection(selectedParagraphRanges(content.current));
  };

  const paint = (nextStyle: LawMarkStyle, nextColor: LawMarkColor) => {
    if (selection.length === 0) return;
    change(withLawQuotes(paintLawRanges(marks, selection, nextStyle, nextColor), lawDocument));
  };

  const erase = () => {
    if (selection.length === 0) return;
    change(withLawQuotes(eraseLawRanges(marks, selection), lawDocument));
  };

  const dismiss = () => {
    setSelection([]);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
      <Card title={law.title} sub={`${law.norm} · ${law.subject}`} action={<Badge tone="success">Lei seca</Badge>}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            Transcrição do lote recebido em {law.sourceDate ? new Date(`${law.sourceDate}T12:00:00`).toLocaleDateString("pt-BR") : "2026"}. Confira a redação vigente na fonte oficial.
          </Typography>
          <Button component="a" href={law.officialUrl} target="_blank" rel="noopener noreferrer" size="small" variant="outlined" endIcon={<ArrowOutwardIcon />}>
            Fonte oficial · Planalto
          </Button>
        </Box>
      </Card>

      <MarkingToolbar
        selectionCount={selection.length}
        canUndo={canUndo}
        selectHint="Selecione um trecho da lei"
        onPaint={paint}
        onErase={erase}
        onUndo={undoLast}
        onDismiss={dismiss}
        sx={{ position: "sticky", top: { xs: 112, md: 104 }, zIndex: 5, boxShadow: "0 10px 28px rgba(0,0,0,0.13)" }}
      />
      {saveError && <Alert status="warning">Não foi possível salvar a última marcação: {saveError} Recarregue a página para ver o que ficou gravado.</Alert>}
      {anchored.lost.length > 0 && (
        <Alert status="info">
          {anchored.lost.length === 1 ? "Uma marcação sua não foi encontrada" : `${anchored.lost.length} marcações suas não foram encontradas`} no texto atual desta lei: o trecho foi alterado ou retirado. {anchored.lost.length === 1 ? "Ela continua guardada" : "Elas continuam guardadas"}, mas não aparece{anchored.lost.length === 1 ? "" : "m"} no texto.
        </Alert>
      )}

      <Box ref={content} onMouseUp={captureSelection} onKeyUp={captureSelection} onTouchEnd={captureSelection} sx={{ display: "grid", gap: 1.5 }}>
        {lawDocument.articles.map((article) => (
          <Box component="article" key={article.id} id={article.id} data-law-article sx={{ scrollMarginTop: "184px" }}>
            <Card title={article.label} sub={article.section}>
              <Box sx={(theme) => ({
                border: `1px solid ${theme.vars.palette.surface.border}`,
                borderRadius: `${theme.brand.radius.md}px`,
                backgroundColor: theme.vars.palette.surface.sunken,
                px: { xs: 2, md: 3 }, py: { xs: 2, md: 2.5 },
              })}>
                {article.paragraphs.map((paragraph, paragraphIndex) => {
                  const paragraphMarks = marks.filter((mark) => mark.articleId === article.id && mark.paragraphIndex === paragraphIndex);
                  return (
                    <Typography
                      key={`${article.id}-${paragraphIndex}`}
                      component="p"
                      data-law-paragraph
                      data-article-id={article.id}
                      data-paragraph-index={paragraphIndex}
                      sx={{ fontSize: "0.93rem", fontWeight: paragraphIndex === 0 ? 650 : 500, lineHeight: 1.8, color: "text.primary", mb: paragraphIndex === article.paragraphs.length - 1 ? 0 : 1.35, overflowWrap: "anywhere" }}
                    >
                      {segmentLawText(paragraph, paragraphMarks).map((segment, index) => (
                        <Box component="span" key={index} sx={markSx(segment.mark)}
                          {...(segment.mark ? { "data-testid": "law-mark", "data-style": segment.mark.style, "data-color": segment.mark.color } : {})}>{segment.text}</Box>
                      ))}
                    </Typography>
                  );
                })}
              </Box>
            </Card>
          </Box>
        ))}
      </Box>
      <Alert status="info">O arquivo recebido pode conter redações históricas e dispositivos vetados. A fonte oficial prevalece. As marcações ficam salvas na sua conta; os recortes de PMPR, PPPR e PRF aguardam conferência dos editais.</Alert>
    </Box>
  );
}
