import ArrowOutwardIcon from "@mui/icons-material/ArrowOutwardOutlined";
import BorderColorIcon from "@mui/icons-material/BorderColorOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import CropSquareIcon from "@mui/icons-material/CropSquareOutlined";
import FormatStrikethroughIcon from "@mui/icons-material/FormatStrikethroughOutlined";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlinedOutlined";
import BackspaceIcon from "@mui/icons-material/BackspaceOutlined";
import MouseIcon from "@mui/icons-material/MouseOutlined";
import UndoIcon from "@mui/icons-material/UndoOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card } from "@bora/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { LawDocument, LawEntry } from "@/lib/domain/law-library";
import {
  LAW_MARK_COLORS,
  eraseLawRanges,
  paintLawRanges,
  segmentLawText,
  validateLawMarks,
  type LawMark,
  type LawMarkColor,
  type LawMarkStyle,
  type LawTextRange,
} from "@/lib/domain/law-markings";

interface Props {
  readonly law: LawEntry;
  readonly document: LawDocument;
  readonly profileId: string;
  readonly requestedArticleId: string | null;
  readonly onActiveArticle: (articleId: string) => void;
}

const TOOLS: readonly { style: LawMarkStyle; label: string; icon: ReactNode }[] = [
  { style: "highlight", label: "Marca-texto", icon: <BorderColorIcon fontSize="small" /> },
  { style: "underline", label: "Sublinhar", icon: <FormatUnderlinedIcon fontSize="small" /> },
  { style: "strike", label: "Tachar", icon: <FormatStrikethroughIcon fontSize="small" /> },
  { style: "outline", label: "Contornar", icon: <CropSquareIcon fontSize="small" /> },
];

const COLOR_LABELS: Readonly<Record<LawMarkColor, string>> = {
  yellow: "Amarelo",
  mint: "Verde",
  blue: "Azul",
  pink: "Rosa",
  lilac: "Lilás",
  peach: "Pêssego",
  salmon: "Salmão",
};

function storageKey(profileId: string, lawId: string): string {
  return `fronteira:law-marks:v1:${profileId}:${lawId}`;
}

function readMarks(key: string, document: LawDocument): LawMark[] {
  try {
    const saved = localStorage.getItem(key);
    return saved ? validateLawMarks(JSON.parse(saved), document) : [];
  } catch {
    return [];
  }
}

function selectedParagraphRanges(root: HTMLElement): LawTextRange[] {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return [];

  const result: LawTextRange[] = [];
  for (const paragraph of root.querySelectorAll<HTMLElement>("[data-law-paragraph]")) {
    if (!range.intersectsNode(paragraph)) continue;
    const articleId = paragraph.dataset.articleId;
    const paragraphIndex = Number(paragraph.dataset.paragraphIndex);
    if (!articleId || !Number.isInteger(paragraphIndex)) continue;

    const whole = document.createRange();
    whole.selectNodeContents(paragraph);
    const portion = range.cloneRange();
    if (portion.compareBoundaryPoints(Range.START_TO_START, whole) < 0) {
      portion.setStart(whole.startContainer, whole.startOffset);
    }
    if (portion.compareBoundaryPoints(Range.END_TO_END, whole) > 0) {
      portion.setEnd(whole.endContainer, whole.endOffset);
    }
    const prefix = whole.cloneRange();
    prefix.setEnd(portion.startContainer, portion.startOffset);
    const start = prefix.toString().length;
    const end = start + portion.toString().length;
    if (end > start) result.push({ articleId, paragraphIndex, start, end });
  }
  return result;
}

function markSx(mark: LawMark | null) {
  if (!mark) return undefined;
  const color = LAW_MARK_COLORS[mark.color];
  switch (mark.style) {
    case "highlight": return { backgroundColor: color, color: "#18201e", borderRadius: "2px" };
    case "underline": return { textDecoration: `underline 3px ${color}`, textUnderlineOffset: "3px" };
    case "strike": return { textDecoration: `line-through 2px ${color}` };
    case "outline": return { boxShadow: `inset 0 0 0 2px ${color}`, borderRadius: "3px" };
  }
}

export function LawContinuousReader({ law, document: lawDocument, profileId, requestedArticleId, onActiveArticle }: Props) {
  const key = storageKey(profileId, law.id);
  const [marks, setMarks] = useState<LawMark[]>(() => readMarks(key, lawDocument));
  const [selection, setSelection] = useState<LawTextRange[]>([]);
  const [style, setStyle] = useState<LawMarkStyle>("highlight");
  const [color, setColor] = useState<LawMarkColor>("yellow");
  const [saveError, setSaveError] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const undo = useRef<LawMark[][]>([]);
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

  const changeMarks = (next: LawMark[]) => {
    undo.current.push(marks);
    if (undo.current.length > 30) undo.current.shift();
    setUndoCount(undo.current.length);
    setMarks(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setSaveError(false); }
    catch { setSaveError(true); }
  };

  const paint = (nextStyle: LawMarkStyle, nextColor: LawMarkColor) => {
    if (selection.length === 0) return;
    changeMarks(paintLawRanges(marks, selection, nextStyle, nextColor));
  };

  const erase = () => {
    if (selection.length === 0) return;
    changeMarks(eraseLawRanges(marks, selection));
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

      <Box sx={(theme) => ({
        position: "sticky", top: { xs: 112, md: 104 }, zIndex: 5,
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.4,
        p: 0.8, border: `1px solid ${theme.vars.palette.surface.border}`,
        borderRadius: `${theme.brand.radius.md}px`,
        backgroundColor: theme.vars.palette.surface.raised,
        boxShadow: "0 10px 28px rgba(0,0,0,0.13)",
      })} onMouseDown={(event) => event.preventDefault()} aria-label="Ferramentas de marcação">
        <Tooltip title="Selecione um trecho da lei"><IconButton size="small" aria-label="Selecionar texto" onClick={dismiss}><MouseIcon fontSize="small" /></IconButton></Tooltip>
        {TOOLS.map((tool) => (
          <Tooltip key={tool.style} title={tool.label}>
            <span><IconButton size="small" aria-label={tool.label} aria-pressed={style === tool.style} disabled={!selection.length} onClick={() => { setStyle(tool.style); paint(tool.style, color); }} sx={{ backgroundColor: style === tool.style ? "action.selected" : undefined }}>{tool.icon}</IconButton></span>
          </Tooltip>
        ))}
        <Tooltip title="Apagar marcação do trecho"><span><IconButton size="small" aria-label="Apagar marcação" disabled={!selection.length} onClick={erase}><BackspaceIcon fontSize="small" /></IconButton></span></Tooltip>
        <Box aria-hidden="true" sx={{ width: "1px", flex: "0 0 1px", height: 25, backgroundColor: "divider", mx: 0.4 }} />
        {(Object.keys(LAW_MARK_COLORS) as LawMarkColor[]).map((tone) => (
          <Tooltip key={tone} title={COLOR_LABELS[tone]}>
            <span><IconButton
              size="small"
              aria-label={`Marcar em ${COLOR_LABELS[tone].toLowerCase()}`}
              aria-pressed={color === tone}
              onClick={() => { setColor(tone); paint(style, tone); }}
              sx={{ p: 0.35, border: color === tone ? "2px solid" : "2px solid transparent", borderColor: color === tone ? "text.primary" : "transparent" }}
            ><Box sx={{ width: 18, height: 18, borderRadius: "50%", backgroundColor: LAW_MARK_COLORS[tone], border: "1px solid rgba(0,0,0,0.12)" }} /></IconButton></span>
          </Tooltip>
        ))}
        <Tooltip title="Desfazer última marcação"><span><IconButton size="small" aria-label="Desfazer marcação" disabled={!undoCount} onClick={() => {
          const previous = undo.current.pop();
          if (!previous) return;
          setUndoCount(undo.current.length);
          setMarks(previous);
          try { localStorage.setItem(key, JSON.stringify(previous)); setSaveError(false); }
          catch { setSaveError(true); }
        }}><UndoIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Limpar seleção"><span><IconButton size="small" aria-label="Limpar seleção" disabled={!selection.length} onClick={dismiss}><CloseIcon fontSize="small" /></IconButton></span></Tooltip>
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto", px: 0.6 }}>
          {selection.length ? `${selection.length} trecho${selection.length > 1 ? "s" : ""} selecionado${selection.length > 1 ? "s" : ""}` : "Selecione um trecho para marcar"}
        </Typography>
      </Box>
      {saveError && <Alert status="warning">Não foi possível salvar as marcações neste navegador.</Alert>}

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
                        <Box component="span" key={index} sx={markSx(segment.mark)}>{segment.text}</Box>
                      ))}
                    </Typography>
                  );
                })}
              </Box>
            </Card>
          </Box>
        ))}
      </Box>
      <Alert status="info">O arquivo recebido pode conter redações históricas e dispositivos vetados. A fonte oficial prevalece. As marcações ficam salvas neste navegador; os recortes de PMPR, PPPR e PRF aguardam conferência dos editais.</Alert>
    </Box>
  );
}
