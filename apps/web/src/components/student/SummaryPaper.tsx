import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Tooltip from "@mui/material/Tooltip";
import { Alert } from "@bora/ui";
import { MarkingToolbar } from "@/components/MarkingToolbar";
import { api, type SummaryBlock, type SummaryDocument, type SummaryNote, type SummaryNoteStyle } from "@/lib/api";
import { selectedTexts } from "@/lib/ui/textSelection";
import { useMarkingSession } from "@/lib/ui/useMarkingSession";
import { MARK_COLORS } from "@/lib/domain/text-markings";
import { summarySegments, eraseSummaryRanges } from "@/lib/domain/summary-notes";
import { summarySections } from "@/lib/domain/summary-sections";
import { summaryShortcut, isSummaryRangeBold, SUMMARY_HIGHLIGHT_KEYS } from "@/lib/domain/summary-shortcuts";

const colorShortcuts = Object.fromEntries(SUMMARY_HIGHLIGHT_KEYS.map((color, index) => [color, String(index + 1)]));

interface Range { path: string; start: number; end: number; quote: string }
function readSelection(root: HTMLElement): Range[] {
  return selectedTexts(root, "[data-summary-text]").map(({ element, start, end }) => ({ path: element.dataset.path!, start, end, quote: element.textContent!.slice(start, end) }));
}
interface CommentActions { onEdit: (note: SummaryNote) => void; onDelete: (id: string) => void; canChange: boolean }

function CommentBlock({ note, onEdit, onDelete, canChange }: { note: SummaryNote } & CommentActions) {
  return <Box role="note" aria-label="Comentário sobre o trecho" sx={{ bgcolor: "#fff7cf", color: "#3d3520", p: 2, mb: 2, borderRadius: 2, borderLeft: "4px solid #d4aa20", overflowWrap: "anywhere" }}>
    <Typography component="blockquote" sx={{ m: 0, mb: 1, fontSize: ".8rem", opacity: 0.85 }}>“{note.quote}”</Typography>
    <Typography component="p" sx={{ whiteSpace: "pre-wrap", mb: 1 }}>{note.comment}</Typography>
    <Box sx={{ display: "flex", gap: 1 }}>
      <Button size="small" disabled={!canChange} sx={{ color: "#146a4a" }} onClick={() => onEdit(note)}>Editar comentário</Button>
      <Button size="small" disabled={!canChange} sx={{ color: "#8b3226" }} onClick={() => onDelete(note.id)}>Excluir comentário</Button>
    </Box>
  </Box>;
}

function Blocks({ blocks, notes, prefix = "", offset = 0, ...actions }: { blocks: SummaryBlock[]; notes: readonly SummaryNote[]; prefix?: string; offset?: number } & CommentActions) {
  return <>{blocks.map((block, index) => {
    const path = `${prefix}${index + offset}`;
    if (block.type === "image") return <Box key={path} component="img" src={block.url} alt={block.alt} loading="lazy" sx={{ display: "block", maxWidth: "100%", height: "auto", mx: "auto", my: 2, borderRadius: 1 }} />;
    if (block.type === "table") return <Box key={path} sx={{ overflowX: "auto", my: 2 }}><Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td": { p: 1.5, border: "1px solid #cbd5d0", verticalAlign: "top" } }}><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><Blocks blocks={cell} notes={notes} prefix={`${path}.${rowIndex}.${cellIndex}.`} {...actions} /></td>)}</tr>)}</tbody></Box></Box>;
    return <Box key={path}><Typography component={block.type === "heading" ? "h2" : "p"} data-summary-text data-path={path} id={`summary-text-${path}`} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: block.type === "heading" ? 1.4 : 1.85, color: block.type === "heading" ? "#146a4a" : "inherit", fontWeight: block.type === "heading" ? 800 : 400, fontSize: block.type === "heading" ? "1.1rem" : "1rem", mt: 0, mb: block.type === "heading" ? 3 : 2, pb: block.type === "heading" ? 2 : 0, borderBottom: block.type === "heading" ? "2px solid #243c32" : undefined, scrollMarginTop: 230 }}>
      {summarySegments(block.text, path, notes).map((segment, i) => {
        const highlight = segment.notes.filter(note => note.style === "highlight").at(-1);
        const color = segment.notes.filter(note => note.style === "color").at(-1);
        const underline = segment.notes.filter(note => note.style === "underline").at(-1);
        const strike = segment.notes.filter(note => note.style === "strike").at(-1);
        const outline = segment.notes.filter(note => note.style === "outline").at(-1);
        const commented = segment.notes.some(note => note.style === "comment");
        return <Box component="span" key={i} data-testid={segment.notes.length ? "summary-mark" : undefined} sx={{
          backgroundColor: highlight?.color,
          color: color?.color ?? (highlight ? "#18201e" : "inherit"),
          fontWeight: segment.notes.some(note => note.style === "bold") ? 800 : "inherit",
          textDecorationLine: [underline || commented ? "underline" : "", strike ? "line-through" : ""].filter(Boolean).join(" ") || undefined,
          textDecorationColor: underline?.color ?? strike?.color ?? (commented ? "#947300" : undefined),
          textDecorationStyle: commented && !underline ? "dotted" : "solid",
          textUnderlineOffset: "3px",
          boxShadow: outline ? `inset 0 0 0 2px ${outline.color}` : undefined,
        }}>{segment.text}</Box>;
      })}
    </Typography>{notes.filter(note => note.style === "comment" && note.path === path).map(note => <CommentBlock key={note.id} note={note} {...actions} />)}</Box>;
  })}</>;
}

export function SummaryPaper({ document: summary, initialNotes, focusMode, onToggleFocus }: { document: SummaryDocument; initialNotes: SummaryNote[]; focusMode: boolean; onToggleFocus: () => void }) {
  const { marks, change, undoLast, canUndo, saveError } = useMarkingSession(initialNotes,
    (previous, next) => api.saveSummaryNotes(summary.id, previous, next));
  const content = useRef<HTMLDivElement>(null);
  const restoreSelection = useRef<Range[] | null>(null);
  const focusAnchor = useRef<{ element: HTMLElement; top: number } | null>(null);
  const [selection, setSelection] = useState<Range[]>([]);
  const [textColor, setTextColor] = useState("#146a4a");
  const [commentOpen, setCommentOpen] = useState(false);
  const [editing, setEditing] = useState<SummaryNote | null>(null);
  const [draft, setDraft] = useState("");
  const [toolbarPosition, setToolbarPosition] = useState<"top" | "right">(() => {
    try { return localStorage.getItem("bora.summary-toolbar-position") === "right" ? "right" : "top"; }
    catch { return "top"; }
  });
  const [stickyTop, setStickyTop] = useState(200);
  const sections = summarySections(summary.blocks);
  const toggleFocus = useCallback(() => {
    if (content.current) {
      restoreSelection.current = readSelection(content.current);
      const element = [...content.current.querySelectorAll<HTMLElement>("[data-summary-text]")]
        .find(item => item.getBoundingClientRect().bottom > stickyTop + 150);
      if (element) focusAnchor.current = { element, top: element.getBoundingClientRect().top };
    }
    onToggleFocus();
  }, [onToggleFocus, stickyTop]);
  useLayoutEffect(() => {
    const anchor = focusAnchor.current;
    focusAnchor.current = null;
    const scroll = content.current?.closest("[data-summary-focus-scroll], main");
    if (anchor && scroll) scroll.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top;
  }, [focusMode]);
  useEffect(() => {
    if (!focusMode) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !commentOpen) toggleFocus();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [focusMode, commentOpen, toggleFocus]);
  useLayoutEffect(() => {
    const main = content.current?.closest("[data-summary-focus-scroll], main");
    if (!main) return;
    const header = main.querySelector<HTMLElement>('[data-testid="page-header"]');
    const timer = main.querySelector<HTMLElement>('[aria-label="Ferramenta de estudo"]');
    const update = () => {
      const top = main.getBoundingClientRect().top;
      setStickyTop(Math.ceil(Math.max(header ? header.getBoundingClientRect().bottom - top : 0,
        timer ? timer.getBoundingClientRect().bottom - top : 0, 0)) + 12);
    };
    const observer = new ResizeObserver(update);
    if (header) observer.observe(header);
    if (timer) observer.observe(timer);
    observer.observe(main);
    main.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); main.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [focusMode]);
  const moveToolbar = () => {
    if (content.current) restoreSelection.current = readSelection(content.current);
    const next = toolbarPosition === "top" ? "right" : "top";
    setToolbarPosition(next);
    try { localStorage.setItem("bora.summary-toolbar-position", next); } catch { /* Preferência opcional. */ }
  };
  const capture = () => {
    if (!content.current) return;
    setSelection(readSelection(content.current));
  };
  const dismiss = () => { setSelection([]); window.getSelection()?.removeAllRanges(); };
  const apply = (style: SummaryNoteStyle, color: string, comment = "") => {
    if (!selection.length || saveError) return;
    change([...marks, ...selection.map(range => ({ ...range, id: crypto.randomUUID(), style, color, comment }))]);
  };
  const applyShortcut = useCallback((ranges: Range[], style: "bold" | "highlight", color: string) => {
    if (!ranges.length || saveError) return;
    const sameStyle = marks.filter(note => note.style === style);
    const otherStyles = marks.filter(note => note.style !== style);
    const cleared = [...otherStyles, ...eraseSummaryRanges(sameStyle, ranges)];
    const removeBold = style === "bold" && ranges.every(range => isSummaryRangeBold(range, sameStyle));
    restoreSelection.current = ranges;
    change(removeBold ? cleared : [...cleared, ...ranges.map(range => ({ ...range, id: crypto.randomUUID(), style, color, comment: "" }))]);
    setSelection(ranges);
  }, [marks, change, saveError]);
  useLayoutEffect(() => {
    const ranges = restoreSelection.current;
    restoreSelection.current = null;
    if (!ranges?.length || !content.current) return;
    const elements = [...content.current.querySelectorAll<HTMLElement>("[data-summary-text]")];
    const boundary = (range: Range, offset: number) => {
      const element = elements.find(item => item.dataset.path === range.path);
      if (!element || element.textContent?.slice(range.start, range.end) !== range.quote) return null;
      const walker = window.document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let consumed = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const length = node.textContent?.length ?? 0;
        if (consumed + length >= offset) return { node, offset: offset - consumed };
        consumed += length;
      }
      return null;
    };
    const first = ranges[0]!;
    const last = ranges.at(-1)!;
    const start = boundary(first, first.start);
    const end = boundary(last, last.end);
    if (!start || !end) return;
    const range = window.document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }, [marks, toolbarPosition, focusMode]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (commentOpen || saveError || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select,[role="textbox"],[role="combobox"]'))) return;
      const shortcut = summaryShortcut(event.key);
      if (!shortcut || !content.current) return;
      const ranges = readSelection(content.current);
      if (!ranges.length) return;
      event.preventDefault();
      applyShortcut(ranges, shortcut.style, shortcut.color);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyShortcut, commentOpen, saveError]);
  return <Box sx={{ minWidth: 0, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: toolbarPosition === "right" ? "minmax(0, 1fr) 210px" : "minmax(0, 1fr)" } }}>
    <Box data-testid="summary-toolbar" sx={{ position: "sticky", top: `${stickyTop}px`, alignSelf: "start", gridColumn: { xs: "1", xl: toolbarPosition === "right" ? "2" : "1" }, gridRow: { xl: toolbarPosition === "right" ? "1 / span 3" : "auto" }, maxHeight: `calc(100dvh - ${stickyTop + 12}px)`, overflowY: "auto", zIndex: 6, bgcolor: "background.paper", borderRadius: 2, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 1, px: 1, py: 0.5 }}>
        <Button size="small" variant="outlined" onMouseDown={event => event.preventDefault()} onClick={toggleFocus} aria-pressed={focusMode}>{focusMode ? "Sair do foco (Esc)" : "Modo foco"}</Button>
        <Button size="small" variant="text" onMouseDown={event => event.preventDefault()} onClick={moveToolbar} aria-pressed={toolbarPosition === "right"} title="Em telas menores, a barra permanece no topo">{toolbarPosition === "top" ? "Barra à direita →" : "↑ Barra no topo"}</Button>
      </Box>
      <MarkingToolbar selectionCount={selection.length} canUndo={canUndo && !saveError} selectHint="Selecione um trecho do resumo" colorShortcuts={colorShortcuts}
        onPaint={(style, color) => style === "highlight" ? applyShortcut(selection, "highlight", MARK_COLORS[color]) : apply(style, MARK_COLORS[color])}
        onErase={() => { if (!saveError) change(eraseSummaryRanges(marks, selection)); }} onUndo={undoLast} onDismiss={dismiss} />
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, p: 1 }}>
        <Tooltip title="Negrito · atalho N"><span><Button size="small" variant="outlined" disabled={!selection.length || Boolean(saveError)} onMouseDown={event => event.preventDefault()} onClick={() => applyShortcut(selection, "bold", textColor)} sx={{ fontWeight: 800 }}>Negrito</Button></span></Tooltip>
        <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: ".75rem" }}>Cor da letra
          <Box component="input" type="color" aria-label="Escolher cor da letra" value={textColor} onChange={event => setTextColor(event.target.value)} sx={{ width: 30, height: 28, p: 0, border: 0, bgcolor: "transparent", cursor: "pointer" }} />
        </Box>
        <Button size="small" disabled={!selection.length || Boolean(saveError)} onMouseDown={event => event.preventDefault()} onClick={() => apply("color", textColor)}>Aplicar cor</Button>
        <Button size="small" variant="outlined" disabled={!selection.length || Boolean(saveError)} onMouseDown={event => event.preventDefault()} onClick={() => { setEditing(null); setDraft(""); setCommentOpen(true); }}>Comentar trecho</Button>
      </Box>
    </Box>
    {saveError && <Box sx={{ gridColumn: "1" }}><Alert status="warning">Não foi possível salvar: {saveError} Recarregue para recuperar as anotações gravadas.</Alert></Box>}
    <Typography component="p" variant="caption" color="text.secondary" sx={{ gridColumn: "1" }}>Resumo Área Policial</Typography>
    <Box component="article" ref={content} onMouseUp={capture} onKeyUp={capture} onTouchEnd={capture} sx={{ gridColumn: "1", display: "grid", gap: 2, minWidth: 0 }}>
      {sections.map((section, index) => <Box component="section" key={section.start} id={`summary-section-${section.start}`} aria-label={section.title} sx={{ bgcolor: "#ffffff", color: "#263730", border: "1px solid #d9e2dd", borderRadius: 2.5, p: { xs: 2, md: 3.5 }, minWidth: 0, scrollMarginTop: 230 }}>
        <Typography aria-hidden="true" sx={{ fontSize: ".75rem", letterSpacing: ".1em", fontWeight: 800, color: "#146a4a", mb: 1 }}>{String(index + 1).padStart(2, "0")}</Typography>
        {section.blocks[0]?.type !== "heading" && <Typography component="h2" sx={{ fontWeight: 800, color: "#146a4a", fontSize: "1.1rem", pb: 2, mb: 3, borderBottom: "2px solid #243c32" }}>Visão geral</Typography>}
        <Blocks blocks={section.blocks} offset={section.start} notes={marks} canChange={!saveError}
          onEdit={note => { setEditing(note); setDraft(note.comment); setCommentOpen(true); }}
          onDelete={id => change(marks.filter(note => note.id !== id))} />
      </Box>)}
    </Box>
    <Dialog open={commentOpen} onClose={() => setCommentOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? "Editar comentário" : "Comentário sobre o trecho"}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>{editing?.quote ?? selection.map(range => range.quote).join(" … ")}</Typography>
        <TextField autoFocus fullWidth multiline minRows={4} label="Seu comentário" value={draft} onChange={event => setDraft(event.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} helperText={`${draft.length}/2000`} />
      </DialogContent>
      <DialogActions><Button onClick={() => setCommentOpen(false)}>Cancelar</Button><Button variant="contained" disabled={!draft.trim() || Boolean(saveError)} onClick={() => {
        if (editing) change(marks.map(note => note.id === editing.id ? { ...note, comment: draft.trim() } : note));
        else apply("comment", "#d4aa20", draft.trim());
        setCommentOpen(false);
        dismiss();
      }}>Salvar comentário</Button></DialogActions>
    </Dialog>
  </Box>;
}
