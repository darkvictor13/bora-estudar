import ArrowBackIcon from "@mui/icons-material/ArrowBackOutlined";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutwardOutlined";
import AddCircleIcon from "@mui/icons-material/AddCircleOutline";
import BarChartIcon from "@mui/icons-material/BarChartOutlined";
import FullscreenIcon from "@mui/icons-material/FullscreenOutlined";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExitOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMoreOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import StyleIcon from "@mui/icons-material/StyleOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, PageHeader } from "@bora/ui";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, type LoaderFunctionArgs } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { MarkingToolbar, markSx } from "@/components/MarkingToolbar";
import { api, newRequestId, type FlashcardCard, type FlashcardDeckRef, type FlashcardMark, type FlashcardSide, type FlashcardTextRange, type LawMarkColor, type LawMarkStyle, type FlashcardGrade, type FlashcardReview, type LibraryFlashcardDeckSummary, type LibraryFlashcardNotice, type LibraryFlashcardSubject, type PersonalFlashcardDeck, type Result, type TheoryLesson } from "@/lib/api";
import { requireStudentAccess } from "@/lib/auth/session";
import { flashcardDeckProgress, flashcardIntervalLabel, flashcardSessionQueue, flashcardStudyStats, scheduleFlashcardReview } from "@/lib/domain/flashcards";
import { anchorFlashcardMarks, eraseFlashcardRanges, paintFlashcardRanges, sameCard, withFlashcardQuotes } from "@/lib/domain/flashcard-markings";
import { flashcardEditorialNote, lessonReviewFromLibrary, libraryCardCount, libraryDeckCards } from "@/lib/domain/library-flashcards";
import { segmentText } from "@/lib/domain/text-markings";
import { selectedTexts } from "@/lib/ui/textSelection";
import { useMarkingSession } from "@/lib/ui/useMarkingSession";
import { ROUTES } from "@/lib/routes";

export async function flashcardsLoader({ request }: LoaderFunctionArgs) {
  await requireStudentAccess();
  const lessonId = new URL(request.url).searchParams.get("aula");
  const deckId = new URL(request.url).searchParams.get("deck");
  const personalDeckId = new URL(request.url).searchParams.get("meuDeck");
  // A lista chega sem o texto; o texto, só do deck aberto (spec 39).
  const catalog = await api.loadLibraryFlashcardCatalog();
  const selectedDeck = deckId ? await api.loadLibraryFlashcardDeck(deckId) : null;
  const plan = await api.loadActivePlanOrNull();
  const subjects = plan ? await api.loadTheoryControl(plan.id) : [];
  const lessons = subjects.flatMap((subject) => subject.lessons).filter((item) => item.published);
  const lesson = lessonId ? lessons.find((item) => item.id === lessonId) ?? null : null;
  const reviews = lesson
    ? await api.loadFlashcardReviews(lesson.id)
    : !lessonId ? await api.loadFlashcardReviewsForLessons(lessons.filter((item) => (item.flashcardCards ?? []).length > 0).map((item) => item.id)) : [];
  const libraryReviews = (await api.loadLibraryFlashcardReviews(selectedDeck ? [selectedDeck.id] : catalog.subjects.flatMap((subject) => subject.decks.map((item) => item.id)))).map(lessonReviewFromLibrary);
  const personalDecks = await api.listPersonalFlashcardDecks();
  const selectedPersonalDeck = personalDeckId ? personalDecks.find((item) => item.id === personalDeckId) ?? null : null;
  const personalReviews = (await api.loadPersonalFlashcardReviews(selectedPersonalDeck ? [selectedPersonalDeck.id] : personalDecks.map((item) => item.id))).map((review): FlashcardReview => ({ ...review, lessonId: review.deckId }));
  // O grifo é do deck aberto, e só dele (spec 42).
  const markDeck: FlashcardDeckRef | null = lesson ? { kind: "lesson", deckId: lesson.id }
    : selectedDeck ? { kind: "library", deckId: selectedDeck.id }
    : selectedPersonalDeck ? { kind: "personal", deckId: selectedPersonalDeck.id } : null;
  const marks = markDeck ? await api.loadFlashcardMarks(markDeck) : [];
  return { marks, catalog, hasPlan: Boolean(plan), lessons, lesson, reviews, requestedLesson: Boolean(lessonId), selectedDeck, requestedDeck: Boolean(deckId), libraryReviews, personalDecks, selectedPersonalDeck, requestedPersonalDeck: Boolean(personalDeckId), personalReviews };
}

type LoaderData = Awaited<ReturnType<typeof flashcardsLoader>>;

const GRADES: readonly { key: FlashcardGrade; label: string }[] = [
  { key: "again", label: "Errei" },
  { key: "good", label: "Acertei" },
  { key: "hard", label: "Dúvida" },
];

interface SessionDeck {
  readonly id: string;
  readonly subject: string;
  readonly lessonCode: string;
  readonly flashcardCards: readonly (FlashcardCard & { readonly notice?: LibraryFlashcardNotice | null })[];
}

/** Quanto o ponteiro anda entre apertar e soltar para o clique ser um arrasto. */
const DRAG_DISTANCE = 4;

function FlashcardSession({ lesson, deck, initialReviews, initialMarks, onGrade, onSaveMarks }: {
  lesson: SessionDeck;
  deck: FlashcardDeckRef;
  initialReviews: readonly FlashcardReview[];
  /** Como estão gravadas na conta; a sessão as reancora no texto atual. */
  initialMarks: readonly FlashcardMark[];
  onGrade: (cardId: string, grade: FlashcardGrade) => Promise<Result<FlashcardReview>>;
  /** Grava UMA ação: o antes e o depois (spec 42, R-GRIFO-17). */
  onSaveMarks: (previous: readonly FlashcardMark[], next: readonly FlashcardMark[]) => Promise<Result<null>>;
}) {
  const cards = lesson.flashcardCards;
  const [reviews, setReviews] = useState<readonly FlashcardReview[]>(initialReviews);
  const [queue, setQueue] = useState<string[]>(() => flashcardSessionQueue(cards, initialReviews));
  const [answered, setAnswered] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = cards.find((item) => item.id === queue[0]);
  const currentReview = card ? reviews.find((item) => item.cardId === card.id) : undefined;
  const editorialNote = flashcardEditorialNote(card?.notice);
  const position = answered + 1;
  const sessionTotal = answered + queue.length;
  const studyStats = flashcardStudyStats(cards, reviews);
  const nextDue = [...reviews].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];

  // A reancoragem roda uma vez, na montagem: o que perdeu o trecho continua
  // gravado, não é pintado e o cartão o conta (R-GRIFO-13).
  const [anchored] = useState(() => anchorFlashcardMarks(initialMarks, cards));
  const { marks, change, undoLast, canUndo, saveError } = useMarkingSession<FlashcardMark>(anchored.placed, onSaveMarks);
  const [selection, setSelection] = useState<FlashcardTextRange[]>([]);
  const flipCard = useRef<HTMLDivElement>(null);
  const pendingFlip = useRef<number | undefined>(undefined);
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const visibleSide: FlashcardSide = revealed ? "back" : "front";
  const cardRef = card ? { ...deck, cardId: card.id } : null;
  const lostHere = card ? anchored.lost.get(card.id) ?? 0 : 0;

  useEffect(() => {
    const pending = pendingFlip;
    return () => window.clearTimeout(pending.current);
  }, []);

  const clearSelection = () => {
    setSelection([]);
    window.getSelection()?.removeAllRanges();
  };

  const flip = () => {
    clearSelection();
    setRevealed((current) => !current);
  };

  // Só o lado que está à vista: o outro está no DOM, virado, e um arrasto
  // pode passar por ele sem que ninguém o veja (R-GRIFO-21).
  const captureSelection = () => {
    const root = flipCard.current;
    if (!root || !cardRef) return;
    setSelection(selectedTexts(root, "[data-flashcard-side]")
      .filter(({ element }) => element.dataset.flashcardSide === visibleSide)
      .map(({ start, end }) => ({ card: cardRef, side: visibleSide, start, end })));
  };

  const paint = (style: LawMarkStyle, color: LawMarkColor) => {
    if (selection.length === 0) return;
    change(withFlashcardQuotes(paintFlashcardRanges(marks, selection, style, color), cards));
  };

  const erase = () => {
    if (selection.length === 0) return;
    change(withFlashcardQuotes(eraseFlashcardRanges(marks, selection), cards));
  };

  // R-GRIFO-20: clique simples vira; terminar uma seleção não vira. O que
  // separa os dois é o ponteiro ter andado entre apertar e soltar — e não haver
  // texto selecionado, porque clicar sobre a seleção ainda não a desfez quando
  // o clique chega. No texto, o primeiro clique pode ser o começo de um duplo
  // clique que seleciona a palavra, e virar ali a esconderia: espera o segundo.
  const clickCard = (event: MouseEvent<HTMLElement>) => {
    const from = pressedAt.current;
    pressedAt.current = null;
    if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > DRAG_DISTANCE) return;
    window.clearTimeout(pendingFlip.current);
    if (event.detail > 1) return;
    if (event.target instanceof Element && event.target.closest("[data-flashcard-side]")) {
      pendingFlip.current = window.setTimeout(flip, 300);
      return;
    }
    flip();
  };

  const renderSide = (text: string, side: FlashcardSide) =>
    segmentText(text, cardRef ? marks.filter((mark) => mark.side === side && sameCard(mark.card, cardRef)) : []).map((segment, index) => (
      <Box component="span" key={index} sx={markSx(segment.mark)}
        {...(segment.mark ? { "data-testid": "flashcard-mark", "data-style": segment.mark.style, "data-color": segment.mark.color, "data-side": side } : {})}>{segment.text}</Box>
    ));

  async function grade(value: FlashcardGrade) {
    if (!card || !revealed || pending) return;
    setPending(true);
    const result = await onGrade(card.id, value);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setReviews((current) => [...current.filter((item) => item.cardId !== card.id), result.data]);
    setQueue((current) => current.slice(1));
    setAnswered((current) => current + 1);
    clearSelection();
    setRevealed(false);
    setError(null);
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      const due = flashcardSessionQueue(cards, reviews, new Date(), 0);
      if (due.length) setQueue((current) => [...current, ...due.filter((id) => !current.includes(id))]);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [cards, reviews]);

  useEffect(() => {
    if (!focus) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
      if (event.code === "Space") {
        if (event.target instanceof HTMLElement && event.target.closest('[data-testid="flashcard-flip"]')) return;
        event.preventDefault();
        flip();
      } else if (revealed && /^[1-3]$/.test(event.key)) {
        event.preventDefault();
        const gradeValue = GRADES[Number(event.key) - 1]?.key;
        if (gradeValue) void grade(gradeValue);
      } else if (event.key === "Escape") {
        setFocus(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <Box sx={(theme) => ({
      position: focus ? "fixed" : "relative",
      inset: focus ? 0 : undefined,
      zIndex: focus ? 2000 : undefined,
      overflowY: focus ? "auto" : undefined,
      minHeight: focus ? "100dvh" : undefined,
      px: focus ? { xs: 2, md: 4 } : 0,
      py: focus ? { xs: 2, md: 3 } : 0,
      backgroundColor: focus ? theme.vars.palette.surface.base : "transparent",
      ...focus && theme.applyStyles("dark", { backgroundImage: `radial-gradient(ellipse at 50% 0%, ${theme.vars.palette.accent.primarySoft}, transparent 55%)` }),
    })}>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2 }}>
          <Button component={Link} to={ROUTES.student.flashcards} size="small" startIcon={<ArrowBackIcon />} onClick={() => setFocus(false)}>
            Flashcards
          </Button>
          <Typography variant="body2" sx={{ fontWeight: 700, color: "text.secondary" }}>
            {card ? `${position} de ${sessionTotal}` : `${cards.length} cartões`}
          </Typography>
          <Button size="small" variant="outlined" onClick={() => setFocus((current) => !current)} startIcon={focus ? <FullscreenExitIcon /> : <FullscreenIcon />}>
            {focus ? "Sair do foco" : "Modo foco"}
          </Button>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1, mb: 2 }}>
          {[
            ["Novos", studyStats.fresh],
            ["Aprendendo", studyStats.learning],
            ["Para revisar", studyStats.due],
            ["Consolidados", studyStats.consolidated],
          ].map(([label, value]) => <Box key={label} sx={(theme) => ({ p: { xs: 1, md: 1.5 }, border: `1px solid ${theme.vars.palette.surface.borderStrong}`, borderRadius: `${theme.brand.radius.md}px`, backgroundColor: theme.vars.palette.surface.raised })}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label}</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: "1rem", md: "1.2rem" } }}>{value}</Typography>
          </Box>)}
        </Box>

        {error && <Alert status="error">{error}</Alert>}
        {editorialNote && <Box sx={{ mb: 2 }}><Alert status="warning">{editorialNote}</Alert></Box>}
        {card ? (
          <>
            <MarkingToolbar
              selectionCount={selection.length}
              canUndo={canUndo}
              selectHint="Selecione um trecho do cartão"
              onPaint={paint}
              onErase={erase}
              onUndo={undoLast}
              onDismiss={clearSelection}
              sx={{ mb: 1.5 }}
            />
            {saveError && <Box sx={{ mb: 1.5 }}><Alert status="warning">Não foi possível salvar a última marcação: {saveError} Recarregue a página para ver o que ficou gravado.</Alert></Box>}
            {lostHere > 0 && (
              <Box sx={{ mb: 1.5 }}><Alert status="info">
                {lostHere === 1 ? "Uma marcação sua neste cartão não foi encontrada" : `${lostHere} marcações suas neste cartão não foram encontradas`} no texto atual: o trecho foi alterado ou retirado. {lostHere === 1 ? "Ela continua guardada, mas não aparece" : "Elas continuam guardadas, mas não aparecem"} no cartão.
              </Alert></Box>
            )}
            <Box sx={{ mb: 2, perspective: "1200px" }}>
              <Box
                role="button"
                tabIndex={0}
                data-testid="flashcard-flip"
                aria-label={revealed ? "Voltar à pergunta" : "Virar cartão para ver resposta"}
                data-flipped={revealed}
                ref={flipCard}
                onMouseDown={(event) => { pressedAt.current = { x: event.clientX, y: event.clientY }; }}
                onClick={clickCard}
                onMouseUp={captureSelection}
                onTouchEnd={captureSelection}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  flip();
                }}
                sx={{ display: "block", width: "100%", p: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer", "&:focus-visible .flashcard-face": { outline: "3px solid #1AAE80", outlineOffset: 3 } }}
              >
                <Box sx={{ display: "grid", gridTemplateAreas: '"card"', transformStyle: "preserve-3d", transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)", transition: "transform 520ms cubic-bezier(.2,.7,.2,1)", "@media (prefers-reduced-motion: reduce)": { transition: "none" } }}>
                  <Box className="flashcard-face" aria-hidden={revealed} sx={(theme) => ({
                    gridArea: "card", display: "flex", flexDirection: "column", height: { xs: 340, md: 360 }, overflowY: "auto", p: { xs: 2.5, md: 3.5 },
                    borderRadius: `${theme.brand.radius.lg}px`, border: "1px solid #DCE4E1", backgroundColor: "#FFFFFF", color: "#263532", boxShadow: theme.shadows[2],
                    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(0deg)",
                  })}>
                    <Typography variant="overline" component="p" sx={{ color: "#126347", fontWeight: 800 }}>
                      {lesson.subject} · {lesson.lessonCode}{card.topic ? ` · ${card.topic}` : ""}
                    </Typography>
                    {currentReview && <Typography variant="caption" component="p" sx={{ color: "#5A6964", mt: 0.5 }}>
                      {currentReview.state === "review" ? "Em revisão" : currentReview.state === "relearning" ? "Reaprendendo" : "Em aprendizado"} · {currentReview.reviewCount} {currentReview.reviewCount === 1 ? "resposta" : "respostas"} · última: {currentReview.lastGrade === "again" ? "errei" : currentReview.lastGrade === "hard" ? "dúvida" : "acertei"}
                    </Typography>}
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, py: 2 }}>
                      <Typography component="p" data-flashcard-side="front" sx={{ textAlign: "center", fontSize: { xs: "1.15rem", md: "1.4rem" }, lineHeight: 1.55, fontWeight: 650, whiteSpace: "pre-wrap", cursor: "text" }}>
                        {renderSide(card.front, "front")}
                      </Typography>
                    </Box>
                    <Typography variant="caption" component="p" sx={{ color: "#5A6964", textAlign: "center" }}>Clique ou pressione Espaço para virar</Typography>
                  </Box>
                  <Box className="flashcard-face" data-testid="flashcard-answer" aria-hidden={!revealed} sx={(theme) => ({
                    gridArea: "card", display: "flex", flexDirection: "column", height: { xs: 340, md: 360 }, overflowY: "auto", p: { xs: 2.5, md: 3.5 },
                    borderRadius: `${theme.brand.radius.lg}px`, border: "1px solid #B4D9CB", backgroundColor: "#FFFFFF", color: "#263532", boxShadow: theme.shadows[2],
                    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)",
                  })}>
                    <Typography component="h2" sx={{ color: "#126347", fontSize: "0.9rem", fontWeight: 800, mb: 2, textTransform: "uppercase" }}>Resposta</Typography>
                    <Box sx={{ flex: 1 }}>
                      <Typography component="p" data-flashcard-side="back" sx={{ lineHeight: 1.65, whiteSpace: "pre-wrap", fontSize: { xs: "1rem", md: "1.1rem" }, cursor: "text" }}>{renderSide(card.back, "back")}</Typography>
                    </Box>
                    <Typography variant="caption" component="p" sx={{ color: "#5A6964", mt: 2, textAlign: "center" }}>Clique para voltar à pergunta</Typography>
                  </Box>
                </Box>
              </Box>
            </Box>

            {revealed && (
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.75 }}>
                {GRADES.map((gradeOption) => {
                  const interval = scheduleFlashcardReview(lesson.id, card.id, gradeOption.key, currentReview).intervalMinutes;
                  return (
                    <Box key={gradeOption.key} sx={{ display: "grid", gap: 0.5, textAlign: "center" }}>
                      <Typography variant="caption" color="text.secondary">{flashcardIntervalLabel(interval)}</Typography>
                      <Button variant={gradeOption.key === "good" ? "contained" : "outlined"} color={gradeOption.key === "again" ? "error" : gradeOption.key === "hard" ? "warning" : "primary"} disabled={pending} onClick={() => void grade(gradeOption.key)} sx={{ minWidth: 0, px: 0.5 }}>
                        {gradeOption.label}
                      </Button>
                    </Box>
                  );
                })}
              </Box>
            )}
            <Typography variant="caption" component="p" sx={{ textAlign: "center", mt: 2, color: "text.secondary" }}>
              Clique no cartão para virar · Espaço também vira no modo foco · teclas 1 a 3 classificam · se não lembrou, escolha Errei
            </Typography>
          </>
        ) : (
          <Card title="Sessão concluída" sub="Nenhum cartão pendente neste lote">
            <Typography variant="body2" sx={{ mb: 2 }}>
              {nextDue ? `Próxima revisão: ${new Date(nextDue.dueAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.` : "Volte para acompanhar as próximas revisões."}
            </Typography>
            {studyStats.fresh > 0 && <Button variant="contained" onClick={() => { setQueue(flashcardSessionQueue(cards, reviews, new Date(), 20)); setRevealed(false); }} sx={{ mr: 1 }}>Estudar mais 20 novos</Button>}
            <Button component={Link} to={ROUTES.student.flashcards} variant="outlined">Voltar aos decks</Button>
          </Card>
        )}

        <Typography variant="caption" component="p" sx={{ mt: 2, color: "text.secondary" }}>
          Flashcards auxiliam na memorização. O desempenho da aula é medido pelas questões respondidas.
        </Typography>
      </Box>
    </Box>
  );
}

function DeckGroup({
  subject,
  lessons,
  reviewsByLesson,
  initiallyOpen,
}: {
  subject: string;
  lessons: readonly TheoryLesson[];
  reviewsByLesson: ReadonlyMap<string, readonly FlashcardReview[]>;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const expanded = open;

  return (
    <Box sx={(theme) => ({
      mb: 1.5,
      border: `1px solid ${theme.vars.palette.surface.borderStrong}`,
      borderRadius: `${theme.brand.radius.lg}px`,
      backgroundColor: theme.vars.palette.surface.raised,
      boxShadow: theme.shadows[1],
      overflow: "hidden",
    })}>
      <Box
        component="button"
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen((current) => !current)}
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          width: "100%",
          p: { xs: 1.75, md: 2 },
          border: 0,
          color: theme.vars.palette.text.primary,
          backgroundColor: expanded ? theme.vars.palette.accent.primarySoft : theme.vars.palette.surface.raised,
          textAlign: "left",
          cursor: "pointer",
          "&:hover": { backgroundColor: theme.vars.palette.accent.primarySoftHover },
        })}
      >
        <Box sx={(theme) => ({
          display: "grid",
          placeItems: "center",
          width: 38,
          height: 38,
          flexShrink: 0,
          borderRadius: `${theme.brand.radius.md}px`,
          color: theme.vars.palette.accent.primary,
          backgroundColor: theme.vars.palette.surface.raised,
          border: `1px solid ${theme.vars.palette.surface.border}`,
        })}>
          <StyleIcon aria-hidden="true" fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800 }}>{subject}</Typography>
          <Typography variant="caption" color="text.secondary">{lessons.length} {lessons.length === 1 ? "deck" : "decks"}</Typography>
        </Box>
        <ExpandMoreIcon aria-hidden="true" sx={{ color: "text.secondary", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 180ms" }} />
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, pb: 1.5 }}>
          <Box sx={(theme) => ({
            display: { xs: "none", md: "grid" },
            gridTemplateColumns: "minmax(0, 2.5fr) repeat(3, minmax(70px, .6fr)) minmax(120px, 1fr) auto",
            gap: 1.25,
            px: 1.5,
            py: 1,
            color: theme.vars.palette.text.secondary,
            borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
            fontSize: "0.73rem",
            fontWeight: 800,
            textTransform: "uppercase",
          })}>
            <span>Deck da aula</span><span>Vistos</span><span>Para revisar</span><span>Total</span><span>Progresso</span><span>Abrir</span>
          </Box>
          {lessons.map((item) => {
            const progress = flashcardDeckProgress(item.flashcardCards ?? [], reviewsByLesson.get(item.id) ?? []);
            return (
              <Box key={item.id} data-testid="flashcard-deck" sx={(theme) => ({
                display: "grid",
                gridTemplateColumns: { xs: "minmax(0, 1fr) auto", md: "minmax(0, 2.5fr) repeat(3, minmax(70px, .6fr)) minmax(120px, 1fr) auto" },
                alignItems: "center",
                gap: 1.25,
                px: 1.5,
                py: 1.5,
                borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
                "&:last-child": { borderBottom: 0 },
              })}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component={Link} to={ROUTES.student.flashcardsForLesson(item.id)} variant="body2" sx={(theme) => ({ display: "block", color: theme.vars.palette.text.primary, fontWeight: 800, textDecoration: "none", "&:hover": { color: theme.vars.palette.accent.primary } })}>
                    {item.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{item.lessonCode} · {progress.total} cartões</Typography>
                  <Typography variant="caption" component="p" sx={{ display: { xs: "block", md: "none" }, color: "text.secondary", mt: 0.5 }}>
                    {progress.studied} vistos · {progress.due} para revisar · {progress.progressPercent}% concluído
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ display: { xs: "none", md: "block" }, fontWeight: 700 }}>{progress.studied}</Typography>
                <Typography variant="body2" sx={(theme) => ({ display: { xs: "none", md: "block" }, fontWeight: 700, color: progress.due ? theme.vars.palette.accent.primary : theme.vars.palette.text.secondary })}>{progress.due}</Typography>
                <Typography variant="body2" sx={{ display: { xs: "none", md: "block" } }}>{progress.total}</Typography>
                <Box sx={{ display: { xs: "none", md: "block" } }}>
                  <Typography variant="caption" sx={{ fontWeight: 800 }}>{progress.progressPercent}%</Typography>
                  <LinearProgress variant="determinate" value={progress.progressPercent} aria-label={`Progresso de ${item.title}`} sx={{ mt: 0.5, height: 5, borderRadius: 3 }} />
                </Box>
                <Button component={Link} to={ROUTES.student.flashcardsForLesson(item.id)} size="small" variant="outlined" sx={{ whiteSpace: "nowrap" }}>Estudar</Button>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}

function LibrarySubjectGroup({ subject, decks, reviews, initiallyOpen }: {
  subject: LibraryFlashcardSubject;
  decks: readonly LibraryFlashcardDeckSummary[];
  reviews: readonly FlashcardReview[];
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const total = decks.reduce((sum, deck) => sum + deck.cardIds.length, 0);
  return (
    <Box sx={(theme) => ({ mb: 3, overflow: "hidden", border: `1px solid ${theme.vars.palette.surface.borderStrong}`, borderRadius: `${theme.brand.radius.lg}px`, backgroundColor: theme.vars.palette.surface.raised, boxShadow: theme.shadows[1] })}>
      <Box component="button" type="button" aria-expanded={open} aria-controls={`decks-${subject.id}`} onClick={() => setOpen((current) => !current)}
        sx={(theme) => ({ display: "flex", alignItems: "center", gap: 1.5, width: "100%", p: { xs: 2, md: 2.5 }, border: 0, borderLeft: `4px solid ${theme.vars.palette.accent.primary}`, color: theme.vars.palette.text.primary, backgroundColor: open ? theme.vars.palette.accent.primarySoft : theme.vars.palette.surface.raised, textAlign: "left", cursor: "pointer", "&:hover": { backgroundColor: theme.vars.palette.accent.primarySoftHover } })}>
        <Box sx={(theme) => ({ display: "grid", placeItems: "center", width: 42, height: 42, flexShrink: 0, borderRadius: `${theme.brand.radius.md}px`, color: theme.vars.palette.accent.primary, backgroundColor: theme.vars.palette.surface.raised, border: `1px solid ${theme.vars.palette.surface.border}` })}>
          <StyleIcon aria-hidden="true" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>{subject.name}</Typography>
          <Typography variant="body2" color="text.secondary">{decks.length} decks por assunto · {total} cartões</Typography>
        </Box>
        <ExpandMoreIcon aria-hidden="true" sx={{ color: "text.secondary", transform: open ? "rotate(180deg)" : "none", transition: "transform 180ms" }} />
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box id={`decks-${subject.id}`} sx={{ px: { xs: 1.5, md: 2.5 }, pb: 1.5 }}>
          <Typography variant="body2" sx={{ py: 1.75, fontWeight: 700 }}>Decks por tópico <Typography component="span" variant="caption" color="text.secondary">· Status informado no arquivo: {subject.auditLabel}</Typography></Typography>
          <Box sx={(theme) => ({ display: { xs: "none", md: "grid" }, gridTemplateColumns: "minmax(190px, 2.4fr) repeat(3, minmax(82px, .7fr)) minmax(100px, 1fr) 60px 90px", gap: 1, px: 1.5, py: 1, borderBottom: `1px solid ${theme.vars.palette.surface.borderStrong}`, color: theme.vars.palette.text.secondary, fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase" })}>
            <span>Deck / tópico</span><span>Já sabia</span><span>Não sabia</span><span>Dúvida</span><span>Progresso</span><span>Total</span><span>Abrir</span>
          </Box>
          {decks.map((deck) => {
            const deckReviews = reviews.filter((review) => review.lessonId === deck.id);
            const cards = libraryDeckCards(deck);
            const progress = flashcardDeckProgress(cards, deckReviews);
            const memory = flashcardStudyStats(cards, deckReviews);
            const known = deckReviews.filter((review) => review.lastGrade === "good" || review.lastGrade === "easy").length;
            const unknown = deckReviews.filter((review) => review.lastGrade === "again").length;
            const doubt = deckReviews.filter((review) => review.lastGrade === "hard").length;
            const href = `${ROUTES.student.flashcards}?deck=${encodeURIComponent(deck.id)}`;
            return <Box key={deck.id} data-testid="library-flashcard-deck" sx={(theme) => ({ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr) auto", md: "minmax(190px, 2.4fr) repeat(3, minmax(82px, .7fr)) minmax(100px, 1fr) 60px 90px" }, alignItems: "center", gap: { xs: 1, md: 1 }, px: 1.5, py: 1.5, borderBottom: `1px solid ${theme.vars.palette.surface.border}`, "&:last-child": { borderBottom: 0 } })}>
              <Box sx={{ minWidth: 0 }}>
                <Typography component={Link} to={href} variant="body2" sx={(theme) => ({ display: "block", color: theme.vars.palette.text.primary, fontWeight: 800, textDecoration: "none", "&:hover": { color: theme.vars.palette.accent.primary } })}>{deck.title}</Typography>
                {deck.historical && <Typography variant="caption" color="warning.main" sx={{ fontWeight: 800 }}>Acervo histórico · conteúdo revogado no arquivo</Typography>}
                <Typography variant="caption" color="text.secondary">Tópico {deck.number} · {memory.fresh} novos · {memory.due} para revisar · {memory.consolidated} consolidados</Typography>
                <Typography variant="caption" component="p" sx={{ display: { xs: "block", md: "none" }, color: "text.secondary", mt: 0.5 }}>{known} já sabia · {unknown} não sabia · {doubt} dúvida · {progress.progressPercent}% visto</Typography>
              </Box>
              <Typography variant="body2" sx={{ display: { xs: "none", md: "block" }, fontWeight: 800, color: "success.main" }}>{known}</Typography>
              <Typography variant="body2" sx={{ display: { xs: "none", md: "block" }, fontWeight: 800, color: "error.main" }}>{unknown}</Typography>
              <Typography variant="body2" sx={{ display: { xs: "none", md: "block" }, fontWeight: 800, color: "warning.main" }}>{doubt}</Typography>
              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Typography variant="caption" sx={{ fontWeight: 800 }}>{progress.progressPercent}%</Typography>
                <LinearProgress variant="determinate" value={progress.progressPercent} aria-label={`Progresso de ${deck.title}`} sx={{ mt: 0.5, height: 5, borderRadius: 3 }} />
              </Box>
              <Typography variant="body2" sx={{ display: { xs: "none", md: "block" }, fontWeight: 700 }}>{progress.total}</Typography>
              <Button component={Link} to={href} size="small" variant="outlined" sx={{ whiteSpace: "nowrap" }}>Estudar</Button>
            </Box>;
          })}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", pt: 1.5 }}>Já sabia, não sabia e dúvida mostram a última classificação de cada cartão revisado.</Typography>
        </Box>
      </Collapse>
    </Box>
  );
}

function PersonalDeckGroup({ decks, reviews }: { decks: readonly PersonalFlashcardDeck[]; reviews: readonly FlashcardReview[] }) {
  if (decks.length === 0) return null;
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="overline" sx={{ fontWeight: 800, color: "primary.main" }}>Meus decks</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Criados por você e visíveis somente na sua conta</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.25 }}>
        {decks.map((deck) => {
          const deckReviews = reviews.filter((review) => review.lessonId === deck.id);
          const progress = flashcardDeckProgress(deck.cards, deckReviews);
          const memory = flashcardStudyStats(deck.cards, deckReviews);
          return <Box key={deck.id} sx={(theme) => ({ p: 2, border: `1px solid ${theme.vars.palette.surface.borderStrong}`, borderRadius: `${theme.brand.radius.lg}px`, backgroundColor: theme.vars.palette.surface.raised, boxShadow: theme.shadows[1] })}>
            <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
              <Box><Badge tone="info">Pessoal</Badge><Typography sx={{ fontWeight: 800, mt: 1 }}>{deck.title}</Typography><Typography variant="caption" color="text.secondary">{deck.subject}</Typography></Box>
              <Button component={Link} to={`${ROUTES.student.flashcards}?meuDeck=${encodeURIComponent(deck.id)}`} size="small" variant="outlined">Abrir</Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>{deck.cards.length} cartões · {memory.fresh} novos · {memory.due} para revisar</Typography>
            <LinearProgress variant="determinate" value={progress.progressPercent} sx={{ mt: 1, height: 6, borderRadius: 3 }} />
          </Box>;
        })}
      </Box>
    </Box>
  );
}

export function Flashcards() {
  const { marks, catalog, hasPlan, lessons, lesson, reviews, requestedLesson, selectedDeck, requestedDeck, libraryReviews, personalDecks, selectedPersonalDeck, requestedPersonalDeck, personalReviews } = useLoaderData() as LoaderData;
  const [search, setSearch] = useState("");
  const [deckDialog, setDeckDialog] = useState(false);
  const [cardDialog, setCardDialog] = useState(false);
  const [subject, setSubject] = useState("");
  const [deckTitle, setDeckTitle] = useState("");
  const [cardTopic, setCardTopic] = useState("");
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const selectedSubject = selectedDeck?.subject;
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const query = normalize(search.trim());
  const deckLessons = lessons.filter((item) => (item.flashcardCards ?? []).length > 0);
  const disciplineCount = new Set(deckLessons.map((item) => item.subject)).size;
  const visibleDecks = query ? deckLessons.filter((item) => normalize(`${item.subject} ${item.lessonCode} ${item.title}`).includes(query)) : deckLessons;
  const groups = new Map<string, TheoryLesson[]>();
  for (const item of visibleDecks) groups.set(item.subject, [...(groups.get(item.subject) ?? []), item]);
  const reviewsByLesson = new Map<string, FlashcardReview[]>();
  for (const review of reviews) reviewsByLesson.set(review.lessonId, [...(reviewsByLesson.get(review.lessonId) ?? []), review]);
  const libraryQuery = catalog.subjects.map((subject) => ({ subject, decks: subject.decks.filter((item) => !query || normalize(`${subject.name} ${item.title} ${item.number} ${item.topics.join(" ")}`).includes(query)) })).filter((group) => group.decks.length > 0);
  const visiblePersonalDecks = personalDecks.filter((item) => !query || normalize(`${item.subject} ${item.title} ${item.cards.map((card) => card.topic).join(" ")}`).includes(query));
  const subjectOptions = [...new Set([...catalog.subjects.map((item) => item.name), ...lessons.map((item) => item.subject), ...personalDecks.map((item) => item.subject)])].sort((a, b) => a.localeCompare(b, "pt-BR"));

  async function submitDeck(event: FormEvent<HTMLDivElement>) {
    event.preventDefault();
    setSubmitting(true);
    const id = newRequestId();
    const result = await api.createPersonalFlashcardDeck({ id, subject, title: deckTitle, requestId: newRequestId() });
    setSubmitting(false);
    if (!result.ok) { setFormError(result.error.message); return; }
    setDeckDialog(false); setSubject(""); setDeckTitle(""); setFormError(null);
    await navigate(`${ROUTES.student.flashcards}?meuDeck=${encodeURIComponent(id)}`);
  }

  async function submitCard(event: FormEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!selectedPersonalDeck) return;
    setSubmitting(true);
    const result = await api.createPersonalFlashcard({ id: newRequestId(), deckId: selectedPersonalDeck.id, topic: cardTopic, front: cardFront, back: cardBack, requestId: newRequestId() });
    setSubmitting(false);
    if (!result.ok) { setFormError(result.error.message); return; }
    setCardDialog(false); setCardTopic(""); setCardFront(""); setCardBack(""); setFormError(null);
    revalidator.revalidate();
  }

  return (
    <>
      <PageHeader
        title={lesson ? `Flashcards · ${lesson.lessonCode}` : selectedDeck ? `Flashcards · ${selectedDeck.title}` : selectedPersonalDeck ? `Flashcards · ${selectedPersonalDeck.title}` : "Flashcards"}
        description={lesson ? `${lesson.subject} · ${lesson.title}` : selectedDeck ? `${selectedSubject?.name} · ${selectedDeck.cards.length} cartões` : selectedPersonalDeck ? `${selectedPersonalDeck.subject} · deck pessoal` : "Disciplinas e decks por tópico para revisar os estudos"}
      />
      <ContentBody>
        {requestedLesson && !lesson && <Alert status="warning">Aula não encontrada ou ainda não publicada pelo professor.</Alert>}
        {requestedDeck && !selectedDeck && <Alert status="warning">Deck não encontrado.</Alert>}
        {requestedPersonalDeck && !selectedPersonalDeck && <Alert status="warning">Deck pessoal não encontrado.</Alert>}
        {!requestedLesson && !requestedDeck && !requestedPersonalDeck && !hasPlan && <Alert status="info">Ainda não há planejamento ativo. Os flashcards da área policial já estão disponíveis abaixo.</Alert>}

        {lesson && (
          <>
            {(lesson.flashcardCards ?? []).length > 0 ? (
              <FlashcardSession key={lesson.id} lesson={{ ...lesson, flashcardCards: lesson.flashcardCards ?? [] }} deck={{ kind: "lesson", deckId: lesson.id }} initialReviews={reviews} initialMarks={marks}
                onSaveMarks={(previous, next) => api.saveFlashcardMarks({ deck: { kind: "lesson", deckId: lesson.id }, previous, next, requestId: newRequestId() })} onGrade={(cardId, grade) => api.gradeFlashcard({ lessonId: lesson.id, cardId, grade, requestId: newRequestId() })} />
            ) : (
              <Card title={`Flashcards da aula · ${lesson.lessonCode}`} action={<Badge tone="neutral">Em preparação</Badge>}>
                <Typography variant="body2">O professor ainda não cadastrou cartões para esta aula.</Typography>
              </Card>
            )}
            {lesson.resources.flashcards && (
              <Button component="a" href={lesson.resources.flashcards} target="_blank" rel="noopener noreferrer" size="small" variant="outlined" endIcon={<ArrowOutwardIcon />} sx={{ mt: 1.5 }}>
                Abrir material externo complementar
              </Button>
            )}
          </>
        )}

        {selectedDeck && (
          <>
          {selectedSubject?.auditPartial && <Box sx={{ mb: 2 }}><Alert status="info">Status informado no material: {selectedSubject.auditLabel}. Os cartões sinalizados para conferência mantêm essa indicação durante o estudo.</Alert></Box>}
          <FlashcardSession key={selectedDeck.id} lesson={{ id: selectedDeck.id, subject: selectedSubject?.name ?? "Área Policial", lessonCode: selectedDeck.title, flashcardCards: selectedDeck.cards }} deck={{ kind: "library", deckId: selectedDeck.id }} initialReviews={libraryReviews} initialMarks={marks}
            onSaveMarks={(previous, next) => api.saveFlashcardMarks({ deck: { kind: "library", deckId: selectedDeck.id }, previous, next, requestId: newRequestId() })} onGrade={async (cardId, grade) => {
            const result = await api.gradeLibraryFlashcard({ deckId: selectedDeck.id, cardId, grade, requestId: newRequestId() });
            return result.ok ? { ok: true, data: lessonReviewFromLibrary(result.data) } : result;
          }} />
          </>
        )}

        {selectedPersonalDeck && (
          <>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
              <Button variant="contained" startIcon={<AddCircleIcon />} onClick={() => { setFormError(null); setCardDialog(true); }}>Adicionar cartão</Button>
            </Box>
            {selectedPersonalDeck.cards.length > 0 ? <FlashcardSession key={`${selectedPersonalDeck.id}:${selectedPersonalDeck.cards.length}`} lesson={{ id: selectedPersonalDeck.id, subject: selectedPersonalDeck.subject, lessonCode: selectedPersonalDeck.title, flashcardCards: selectedPersonalDeck.cards }} deck={{ kind: "personal", deckId: selectedPersonalDeck.id }} initialReviews={personalReviews} initialMarks={marks}
              onSaveMarks={(previous, next) => api.saveFlashcardMarks({ deck: { kind: "personal", deckId: selectedPersonalDeck.id }, previous, next, requestId: newRequestId() })} onGrade={async (cardId, grade) => {
              const result = await api.gradePersonalFlashcard({ deckId: selectedPersonalDeck.id, cardId, grade, requestId: newRequestId() });
              return result.ok ? { ok: true, data: { ...result.data, lessonId: result.data.deckId } } : result;
            }} /> : <Empty icon="🗂️">Este deck ainda está vazio. Adicione o primeiro cartão para começar a estudar.</Empty>}
          </>
        )}

        {!requestedLesson && !requestedDeck && !requestedPersonalDeck && (
          <>
            <Box sx={{ display: "flex", alignItems: { xs: "stretch", sm: "center" }, flexDirection: { xs: "column", sm: "row" }, gap: 1.5, mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Flashcards – Área Policial</Typography>
                <Typography variant="body2" color="text.secondary">{catalog.subjects.length} disciplinas · {catalog.subjects.reduce((sum, subject) => sum + subject.decks.length, 0)} decks por tópico · {libraryCardCount(catalog).toLocaleString("pt-BR")} cartões</Typography>
              </Box>
              <TextField size="small" label="Buscar disciplina ou tópico" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: { sm: 280 } }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
              <Button component={Link} to={ROUTES.student.flashcardStatistics} variant="outlined" startIcon={<BarChartIcon />} sx={{ whiteSpace: "nowrap" }}>Estatísticas</Button>
              <Button variant="contained" startIcon={<AddCircleIcon />} onClick={() => { setFormError(null); setDeckDialog(true); }} sx={{ whiteSpace: "nowrap" }}>Criar flashcards</Button>
            </Box>
            {libraryQuery.length === 0 && visibleDecks.length === 0 && visiblePersonalDecks.length === 0 && <Empty icon="🔎">Nenhum deck encontrado para essa busca.</Empty>}
            <PersonalDeckGroup decks={visiblePersonalDecks} reviews={personalReviews} />
            {libraryQuery.map(({ subject, decks }) => <LibrarySubjectGroup key={`${subject.id}:${Boolean(query)}`} subject={subject} decks={decks} reviews={libraryReviews} initiallyOpen={Boolean(query)} />)}
            {visibleDecks.length > 0 && <><Typography variant="overline" sx={{ fontWeight: 800, color: "primary.main" }}>Aulas publicadas pelo professor</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{deckLessons.length} {deckLessons.length === 1 ? "deck" : "decks"} em {disciplineCount} {disciplineCount === 1 ? "disciplina" : "disciplinas"}</Typography></>}
            {[...groups.entries()].map(([subject, items], index) => (
              <DeckGroup key={`${subject}:${Boolean(query)}`} subject={subject} lessons={items} reviewsByLesson={reviewsByLesson} initiallyOpen={index === 0 || Boolean(query)} />
            ))}
          </>
        )}

        <Dialog open={deckDialog} onClose={() => !submitting && setDeckDialog(false)} fullWidth maxWidth="xs" component="form" onSubmit={submitDeck}>
          <DialogTitle sx={{ fontWeight: 800 }}>Novo deck de assunto</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Crie um deck personalizado para estudar com seus próprios flashcards.</Typography>
            {formError && <Box sx={{ mb: 1.5 }}><Alert status="error">{formError}</Alert></Box>}
            <TextField autoFocus required fullWidth label="Disciplina" placeholder="Busque ou crie uma disciplina" value={subject} onChange={(event) => setSubject(event.target.value)} sx={{ mb: 2 }} inputProps={{ maxLength: 120, list: "personal-flashcard-subjects" }} />
            <datalist id="personal-flashcard-subjects">{subjectOptions.map((item) => <option key={item} value={item} />)}</datalist>
            <TextField required fullWidth label="Assunto do deck" placeholder="Ex.: Controle de Constitucionalidade" value={deckTitle} onChange={(event) => setDeckTitle(event.target.value)} inputProps={{ maxLength: 160 }} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}><Button onClick={() => setDeckDialog(false)} disabled={submitting}>Cancelar</Button><Button type="submit" variant="contained" disabled={submitting}>Criar deck</Button></DialogActions>
        </Dialog>

        <Dialog open={cardDialog} onClose={() => !submitting && setCardDialog(false)} fullWidth maxWidth="sm" component="form" onSubmit={submitCard}>
          <DialogTitle sx={{ fontWeight: 800 }}>Adicionar flashcard</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{selectedPersonalDeck?.title}</Typography>
            {formError && <Box sx={{ mb: 1.5 }}><Alert status="error">{formError}</Alert></Box>}
            <TextField fullWidth label="Tópico (opcional)" value={cardTopic} onChange={(event) => setCardTopic(event.target.value)} sx={{ mb: 2 }} inputProps={{ maxLength: 160 }} />
            <TextField autoFocus required fullWidth multiline minRows={3} label="Pergunta ou afirmação" value={cardFront} onChange={(event) => setCardFront(event.target.value)} sx={{ mb: 2 }} inputProps={{ maxLength: 2000 }} />
            <TextField required fullWidth multiline minRows={4} label="Resposta" value={cardBack} onChange={(event) => setCardBack(event.target.value)} inputProps={{ maxLength: 4000 }} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}><Button onClick={() => setCardDialog(false)} disabled={submitting}>Cancelar</Button><Button type="submit" variant="contained" disabled={submitting}>Adicionar cartão</Button></DialogActions>
        </Dialog>
      </ContentBody>
    </>
  );
}
