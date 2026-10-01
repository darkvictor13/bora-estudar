import ArrowOutwardIcon from "@mui/icons-material/ArrowOutwardOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import MenuBookIcon from "@mui/icons-material/MenuBookOutlined";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdfOutlined";
import QuizIcon from "@mui/icons-material/QuizOutlined";
import StyleIcon from "@mui/icons-material/StyleOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { Alert, Badge, Empty, Field } from "@bora/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router";

import type {
  ApiError,
  LessonMaterialBlock,
  TheoryDiagnosis,
  TheoryGoal,
  TheoryLesson,
  TheoryProgress,
  TheoryReview,
} from "@/lib/api";
import { newRequestId } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { lessonProgressPercent, nextPage } from "@/lib/domain/theory";
import type { dailyQuestionPerformance } from "@/lib/domain/schedule";

type DayPerformance = ReturnType<typeof dailyQuestionPerformance>;

function materialBlocksOf(lesson: TheoryLesson): readonly LessonMaterialBlock[] {
  if (lesson.materialBlocks.length > 0) return lesson.materialBlocks;
  return [{
    title: lesson.title,
    pdf: lesson.resources.pdf,
    tecQuestions: lesson.resources.tecQuestions,
    qcQuestions: lesson.resources.qcQuestions,
  }];
}

function ResourceCard({
  label,
  detail,
  icon,
  href,
  to,
  testId,
}: {
  label: string;
  detail: string;
  icon: ReactNode;
  href?: string | null;
  to?: string;
  testId?: string;
}) {
  const cardSx = (theme: import("@mui/material/styles").Theme) => ({
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 1.25,
    minHeight: 78,
    p: 1.25,
    borderRadius: `${theme.brand.radius.md}px`,
    border: `1px solid ${theme.vars.palette.surface.borderStrong}`,
    backgroundColor: theme.vars.palette.surface.sunken,
    color: theme.vars.palette.text.primary,
    textAlign: "left" as const,
    textTransform: "none" as const,
    "&:hover": {
      backgroundColor: theme.vars.palette.accent.primarySoft,
      borderColor: theme.vars.palette.accent.primaryBorder,
    },
    "&.Mui-disabled": { opacity: 0.62, color: theme.vars.palette.text.secondary },
  });
  const content = (
    <>
      <Box sx={(theme) => ({ color: theme.vars.palette.accent.primary, display: "flex" })}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="span" sx={{ display: "block", fontSize: "0.875rem", fontWeight: 700, lineHeight: 1.3 }}>
          {label}
        </Typography>
        <Typography component="span" variant="caption" sx={{ display: "block", mt: 0.25, color: "text.secondary" }}>
          {detail}
        </Typography>
      </Box>
      {(href || to) && <ArrowOutwardIcon aria-hidden="true" sx={{ fontSize: 17 }} />}
    </>
  );

  if (to) return <Button component={Link} to={to} data-testid={testId} sx={cardSx}>{content}</Button>;
  if (href) return <Button component="a" href={href} target="_blank" rel="noopener noreferrer" data-testid={testId} sx={cardSx}>{content}</Button>;
  return <Button disabled data-testid={testId} sx={cardSx}>{content}</Button>;
}

/**
 * Só bloqueia a aula quando não há conteúdo publicado para a disciplina.
 */
function diagnosisMessage(diagnosis: TheoryDiagnosis): string {
  switch (diagnosis.kind) {
    case "no_catalog_linked":
      return "Seu planejamento ainda não tem um catálogo de teoria vinculado. Fale com seu professor.";
    case "subject_not_audited":
      return `O professor ainda não disponibilizou uma aula de ${diagnosis.subject}.`;
    case "lesson_without_pages":
      return `A aula "${diagnosis.lesson}" ainda não está disponível.`;
    case "ok":
      return "";
  }
}

function TheoryTab({
  lesson,
  progress,
  onSave,
  pending,
}: {
  lesson: TheoryLesson;
  progress: TheoryProgress;
  onSave: (page: number, endSession: boolean) => void;
  pending: boolean;
}) {
  const engine = {
    id: lesson.id,
    subjectKey: lesson.subjectKey,
    position: lesson.position,
    lessonCode: lesson.lessonCode,
    hasTheory: lesson.hasTheory && lesson.theoryEndPage !== null,
    theoryStartPage: lesson.theoryStartPage,
    theoryEndPage: lesson.theoryEndPage,
  };
  const engineProgress = {
    lessonId: lesson.id,
    currentPage: progress.currentPage,
    theoryDone: progress.theoryDone,
    initialQuestionsDone: progress.initialQuestionsDone,
    lessonDone: progress.lessonDone,
  };

  const percent = lessonProgressPercent(engine, engineProgress);
  const suggested = nextPage(engine, engineProgress) ?? lesson.theoryStartPage ?? 1;
  const [page, setPage] = useState(String(suggested));

  return (
    <Box>
      <Box sx={(theme) => ({
        p: 1.5,
        mb: 2.25,
        borderRadius: `${theme.brand.radius.md}px`,
        borderLeft: `3px solid ${theme.vars.palette.accent.primary}`,
        backgroundColor: theme.vars.palette.accent.primarySoft,
      })}>
        <Typography variant="body2" component="p" sx={{ fontWeight: 700 }}>
          Sua missão nesta aula
        </Typography>
        <Typography variant="body2" component="p" sx={{ mt: 0.5 }}>
          Use o material e os flashcards para estudar. Resolva as questões e registre acertos e erros para acompanhar o aprendizado.
        </Typography>
      </Box>

      {lesson.note && (
        <Typography variant="body2" component="p" sx={{ mb: 1.5 }}>
          {lesson.note}
        </Typography>
      )}

      <Box sx={{ mb: 2.25 }}>
        <Typography variant="body2" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
          Cadernos de questões e PDFs por bloco
        </Typography>
        <Box sx={{ display: "grid", gap: 1.25 }}>
          {materialBlocksOf(lesson).map((block, index) => (
            <Box key={`${block.title}-${index}`} data-testid="lesson-material-block" sx={(theme) => ({
              p: 1.5,
              borderRadius: `${theme.brand.radius.md}px`,
              border: `1px solid ${theme.vars.palette.surface.borderStrong}`,
              backgroundColor: theme.vars.palette.surface.raised,
            })}>
              <Typography variant="body2" component="h4" sx={{ fontWeight: 800, mb: 1.25 }}>
                Bloco {String(index + 1).padStart(2, "0")} · {block.title}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 0.75 }}>
                <ResourceCard label="PDF" detail={block.pdf ? "Abrir arquivo" : "Em preparação"} icon={<PictureAsPdfIcon />} href={block.pdf} testId="lesson-pdf-link" />
                <ResourceCard label="TEC" detail={block.tecQuestions ? "Caderno de questões" : "Em preparação"} icon={<QuizIcon />} href={block.tecQuestions} testId="lesson-tec-link" />
                <ResourceCard label="QConcursos" detail={block.qcQuestions ? "Caderno de questões" : "Em preparação"} icon={<QuizIcon />} href={block.qcQuestions} testId="lesson-qc-link" />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ mb: 2.25 }}>
        <Typography variant="body2" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
          Outros materiais de apoio
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1 }}>
          <ResourceCard label="Flashcards da aula" detail={(lesson.flashcardCards ?? []).length > 0 ? `${(lesson.flashcardCards ?? []).length} cartões para revisar` : "Área da aula · em preparação"} icon={<StyleIcon />} to={ROUTES.student.flashcardsForLesson(lesson.id)} testId="lesson-flashcards-link" />
          <ResourceCard label="Resumo flash" detail={lesson.resources.flashSummary ? "Leitura rápida de revisão" : "Área da aula · em preparação"} icon={<DescriptionIcon />} to={ROUTES.student.flashSummaryForLesson(lesson.id)} testId="lesson-summary-link" />
        </Box>
      </Box>

      {lesson.theoryStartPage !== null && lesson.theoryEndPage !== null ? (
        <Box sx={(theme) => ({
          mt: 2.25,
          pt: 1.75,
          borderTop: `1px solid ${theme.vars.palette.surface.border}`,
        })}>
          <Typography variant="body2" component="h3" sx={{ fontWeight: 700, mb: 0.75 }}>
            Acompanhar leitura
          </Typography>
          <Typography variant="caption" component="p" sx={{ mb: 1 }}>
            {lesson.pdfFile} · páginas {lesson.theoryStartPage} a {lesson.theoryEndPage}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={percent}
            aria-label={`${percent}% da teoria lida`}
            sx={{ height: 7, borderRadius: 999, mb: 0.75 }}
          />
          <Typography variant="numeric" component="p" data-testid="theory-percent" sx={{ mb: 1.5 }}>
            {percent}% lido
            {progress.theoryDone ? " · leitura concluída" : ""}
          </Typography>
          <Field
            label="Parei na página"
            name="currentPage"
            type="number"
            inputMode="numeric"
            value={page}
            onChange={(event) => setPage(event.target.value)}
            min={lesson.theoryStartPage}
            max={lesson.theoryEndPage}
            hint={`A próxima página sugerida é a ${suggested}.`}
          />
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="contained" disabled={pending} data-testid="theory-save-continue" onClick={() => onSave(Number(page), false)}>
              Salvar leitura
            </Button>
            <Button variant="outlined" disabled={pending} data-testid="theory-save-end" onClick={() => onSave(Number(page), true)}>
              Salvar e fechar
            </Button>
          </Box>
        </Box>
      ) : (
        <Typography variant="body2" component="p">
          Esta aula não tem páginas mapeadas. Use os materiais de apoio e registre suas questões na aba Questões.
        </Typography>
      )}
    </Box>
  );
}

function QuestionsTab({
  lesson,
  progress,
  questionStats,
  onSubmit,
  pending,
}: {
  lesson: TheoryLesson;
  progress: TheoryProgress;
  questionStats: { answered: number; correct: number } | null;
  onSubmit: (questions: number, correct: number) => void;
  pending: boolean;
}) {
  const remaining = Math.max(0, progress.initialQuestionsRequired - progress.initialQuestionsDone);

  return (
    <Box>
      <Typography variant="body2" component="p" sx={{ mb: 1.5 }}>
        Acertos e erros mostram seu aproveitamento nesta aula. PDF, flashcards e resumo flash são apoio ao estudo.
      </Typography>
      <Box sx={{ display: "grid", gap: 1, mb: 2 }}>
        {materialBlocksOf(lesson).map((block, index) => (
          <Box key={`${block.title}-${index}`} sx={(theme) => ({ p: 1.25, borderRadius: `${theme.brand.radius.md}px`, backgroundColor: theme.vars.palette.surface.sunken })}>
            <Typography variant="body2" component="p" sx={{ fontWeight: 700, mb: 0.75 }}>{block.title}</Typography>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
              {block.tecQuestions && <Button component="a" href={block.tecQuestions} target="_blank" rel="noopener noreferrer" size="small" variant="outlined">Resolver no TEC</Button>}
              {block.qcQuestions && <Button component="a" href={block.qcQuestions} target="_blank" rel="noopener noreferrer" size="small" variant="outlined">Resolver no QConcursos</Button>}
              {!block.tecQuestions && !block.qcQuestions && <Typography variant="caption">Cadernos em preparação.</Typography>}
            </Box>
          </Box>
        ))}
      </Box>
      {questionStats && questionStats.answered > 0 && (
        <Typography variant="body2" component="p" sx={{ mb: 1.5 }}>
          Nesta meta: {questionStats.correct} acertos · {questionStats.answered - questionStats.correct} erros
        </Typography>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
        <Typography variant="numeric" component="span" data-testid="initial-questions-count">
          {progress.initialQuestionsDone}/{progress.initialQuestionsRequired}
        </Typography>
        <Badge tone={progress.initialQuestionsComplete ? "success" : "neutral"}>
          {progress.initialQuestionsComplete ? "Mínimo atingido" : `Faltam ${remaining}`}
        </Badge>
      </Box>

      <Typography variant="body2" sx={{ mb: 2 }}>
        Esta meta de questões acompanha sua prática. O professor disponibiliza as próximas aulas conforme as aulas presenciais acontecem.
      </Typography>

      <Box
        component="form"
        noValidate
        data-testid="initial-questions-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSubmit(Number(data.get("questions") ?? 0), Number(data.get("correctAnswers") ?? 0));
        }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Field
            label="Questões feitas"
            name="questions"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={remaining || 10}
          />
          <Field
            label="Acertos"
            name="correctAnswers"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={0}
          />
        </Box>
        <Typography variant="caption" component="p" sx={{ mb: 1 }}>
          Depois de responder, informe o total e os acertos. Os erros serão calculados automaticamente.
        </Typography>
        <Button type="submit" variant="contained" disabled={pending}>
          Registrar questões
        </Button>
      </Box>
    </Box>
  );
}

function PerformanceTab({
  questionStats,
  dayPerformance,
  progress,
  onOpenQuestions,
}: {
  questionStats: { answered: number; correct: number } | null;
  dayPerformance: DayPerformance;
  progress: TheoryProgress;
  onOpenQuestions: () => void;
}) {
  const answered = questionStats?.answered ?? 0;
  const correct = questionStats?.correct ?? 0;
  const wrong = Math.max(0, answered - correct);
  const score = answered > 0 ? Math.round((correct / answered) * 1000) / 10 : null;

  return (
    <Box>
      <Typography variant="body2" component="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
        Desempenho nas questões
      </Typography>
      <Typography variant="body2" component="p" sx={{ color: "text.secondary", mb: 2 }}>
        Acertos e erros mostram o que você já domina e o que precisa revisar. Ler o material não muda esta medida.
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1.25 }}>
        {[
          { title: "Nesta meta", questions: answered, correct, wrong, score },
          { title: "Neste dia", questions: dayPerformance.questions, correct: dayPerformance.correct, wrong: dayPerformance.wrong, score: dayPerformance.score },
        ].map((item) => (
          <Box key={item.title} sx={(theme) => ({
            p: 1.75,
            borderRadius: `${theme.brand.radius.lg}px`,
            backgroundColor: theme.vars.palette.surface.sunken,
            border: `1px solid ${theme.vars.palette.surface.border}`,
          })}>
            <Typography variant="overline" component="p" sx={{ color: "text.secondary" }}>{item.title}</Typography>
            <Typography component="p" sx={(theme) => ({ fontSize: "2rem", fontWeight: 800, lineHeight: 1.2, color: theme.vars.palette.accent.primary })}>
              {item.score === null ? "—" : `${item.score}%`}
            </Typography>
            <Typography variant="body2" component="p" sx={{ mt: 0.5 }}>
              {item.questions} questões respondidas
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5, mt: 1 }}>
              <Typography variant="body2" component="span" sx={(theme) => ({ color: theme.vars.palette.accent.primary, fontWeight: 700 })}>
                {item.correct} acertos
              </Typography>
              <Typography variant="body2" component="span" sx={{ color: "error.main", fontWeight: 700 }}>
                {item.wrong} erros
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={(theme) => ({ mt: 1.5, p: 1.5, borderRadius: `${theme.brand.radius.md}px`, backgroundColor: theme.vars.palette.accent.primarySoft })}>
        <Typography variant="body2" component="p">
          Meta de prática da aula: <strong>{progress.initialQuestionsDone} de {progress.initialQuestionsRequired} questões</strong>.
          O professor libera as próximas aulas conforme o andamento da turma.
        </Typography>
      </Box>
      <Button variant="contained" sx={{ mt: 2 }} onClick={onOpenQuestions}>
        Registrar questões
      </Button>
    </Box>
  );
}

function ReviewsTab({
  reviews,
  onSubmit,
  pending,
}: {
  reviews: readonly TheoryReview[];
  onSubmit: (reviewId: string, questions: number, correct: number) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (reviews.length === 0) {
    return <Empty icon="🔁">Nenhuma revisão criada ainda. Elas nascem quando a aula fecha.</Empty>;
  }

  return (
    <Box>
      {/* A fila NÃO BLOQUEIA o avanço, e o texto diz isso: bloquear
          transformaria um lembrete em muro para quem já está atrasado. */}
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        Revisões vencidas entram na fila e não impedem você de seguir para a próxima aula.
      </Typography>

      {reviews.map((review) => (
        <Box
          key={review.id}
          data-testid="theory-review"
          data-review-id={review.id}
          data-due={review.due}
          data-status={review.status}
          sx={(theme) => ({
            py: 1.25,
            borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
            "&:last-of-type": { borderBottom: "none" },
          })}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", fontWeight: 500 }}>
              {review.lessonTitle}
            </Typography>
            <Badge tone={review.due ? "warning" : review.status === "completed" ? "success" : "neutral"}>
              {review.due ? "Vencida" : review.status === "completed" ? "Feita" : "Agendada"}
            </Badge>
            <Badge tone="neutral">
              {review.questionsAnswered}/{review.minimumQuestions}
            </Badge>
            {review.status !== "completed" && (
              <Button
                size="small"
                variant="text"
                onClick={() => setOpen(open === review.id ? null : review.id)}
              >
                Registrar
              </Button>
            )}
          </Box>
          <Typography variant="caption" component="p">
            {review.subject} · revisão {review.reviewNumber}
          </Typography>

          {open === review.id && (
            <Box
              component="form"
              noValidate
              sx={{ mt: 1, display: "flex", gap: 1, alignItems: "flex-end", flexWrap: "wrap" }}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                onSubmit(
                  review.id,
                  Number(data.get("questions") ?? 0),
                  Number(data.get("correctAnswers") ?? 0),
                );
                setOpen(null);
              }}
            >
              <Field label="Questões" name="questions" type="number" min={0} defaultValue={review.minimumQuestions} />
              <Field label="Acertos" name="correctAnswers" type="number" min={0} defaultValue={0} />
              <Button type="submit" size="small" variant="contained" disabled={pending} sx={{ mb: 1.75 }}>
                Salvar
              </Button>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

/**
 * O modal de meta de teoria — aula, questões, desempenho e revisões.
 *
 * Materiais de aula, questões para medir aprendizado e revisões.
 */
export function TheoryDialog({
  theory,
  questionStats,
  dayPerformance,
  notice,
  error,
  pending,
  onClose,
  onSaveProgress,
  onRecordQuestions,
  onRecordReview,
}: {
  theory: TheoryGoal | null;
  questionStats: { answered: number; correct: number } | null;
  dayPerformance: DayPerformance;
  /** O que acabou de acontecer. Some no próximo gesto. */
  notice: string | null;
  error: ApiError | null;
  pending: boolean;
  onClose: () => void;
  onSaveProgress: (input: {
    lessonId: string;
    requestId: string;
    currentPage: number;
    endSession: boolean;
  }) => void;
  onRecordQuestions: (input: {
    lessonId: string;
    requestId: string;
    questions: number;
    correctAnswers: number;
  }) => void;
  onRecordReview: (input: {
    reviewId: string;
    requestId: string;
    questions: number;
    correctAnswers: number;
  }) => void;
}) {
  const [tab, setTab] = useState(0);
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));

  if (!theory) return null;

  const blocked = theory.diagnosis.kind !== "ok";

  return (
    <Dialog
      open
      fullWidth
      maxWidth="md"
      onClose={onClose}
      data-testid="theory-dialog"
      sx={(muiTheme) => ({
        "& .MuiDialog-paper": {
          borderRadius: `${muiTheme.brand.radius.xl}px`,
          border: `1px solid ${muiTheme.vars.palette.accent.primaryBorder}`,
          backgroundColor: muiTheme.vars.palette.surface.raised,
          backgroundImage: "none",
        },
      })}
    >
      <DialogTitle sx={(muiTheme) => ({
        px: { xs: 2, md: 2.75 },
        pt: 2.25,
        pb: 2,
        borderBottom: `1px solid ${muiTheme.vars.palette.surface.borderStrong}`,
      })}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" component="p" sx={(muiTheme) => ({ color: muiTheme.vars.palette.accent.primary, letterSpacing: "0.13em", fontWeight: 800 })}>
              META DA SEMANA {theory.lesson ? `· ${theory.lesson.lessonCode}` : ""}
            </Typography>
            <Typography component="h2" sx={{ fontSize: { xs: "1.2rem", md: "1.5rem" }, lineHeight: 1.2, fontWeight: 800, mt: 0.5 }}>
              {theory.lesson?.title ?? "Aula ainda não disponível"}
            </Typography>
            {theory.lesson && (
              <Typography variant="body2" component="p" sx={{ color: "text.secondary", mt: 0.5 }}>
                {theory.lesson.subject} · conteúdo da aula presencial
              </Typography>
            )}
          </Box>
          <IconButton aria-label="Fechar" onClick={onClose} sx={(muiTheme) => ({ border: `1px solid ${muiTheme.vars.palette.surface.borderStrong}`, borderRadius: `${muiTheme.brand.radius.sm}px` })}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {(error || notice) && (
          <Box sx={{ px: { xs: 2, md: 2.75 }, pt: 1.5 }}>
            {error && <Alert status="error">{error.message}</Alert>}
            {notice && <Alert status="success">{notice}</Alert>}
          </Box>
        )}

        {blocked ? (
          <Box sx={{ p: 2.5 }}><Alert status="warning">{diagnosisMessage(theory.diagnosis)}</Alert></Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "175px minmax(0, 1fr)" }, minHeight: 400 }}>
            <Box sx={(muiTheme) => ({
              p: { xs: 1, md: 1.5 },
              borderRight: { md: `1px solid ${muiTheme.vars.palette.surface.border}` },
              borderBottom: { xs: `1px solid ${muiTheme.vars.palette.surface.border}`, md: "none" },
              backgroundColor: muiTheme.vars.palette.surface.sunken,
            })}>
              <Tabs
                orientation={compact ? "horizontal" : "vertical"}
                variant="scrollable"
                value={tab}
                onChange={(_event, value: number) => setTab(value)}
                data-testid="theory-tabs"
                sx={(muiTheme) => ({
                  minHeight: 0,
                  "& .MuiTabs-indicator": { backgroundColor: muiTheme.vars.palette.accent.primary },
                  "& .MuiTab-root": { minHeight: 44, justifyContent: "flex-start", alignItems: "center", textAlign: "left", fontWeight: 700, textTransform: "none", borderRadius: `${muiTheme.brand.radius.sm}px`, px: 1.25 },
                  "& .MuiTab-root.Mui-selected": { color: muiTheme.vars.palette.accent.primary, backgroundColor: muiTheme.vars.palette.accent.primarySoft },
                })}
              >
                <Tab icon={<MenuBookIcon fontSize="small" />} iconPosition="start" label="Aula" />
                <Tab icon={<QuizIcon fontSize="small" />} iconPosition="start" label="Questões" />
                <Tab icon={<ArrowOutwardIcon fontSize="small" />} iconPosition="start" label="Desempenho" />
                <Tab icon={<StyleIcon fontSize="small" />} iconPosition="start" label={`Revisões${theory.reviews.length ? ` (${theory.reviews.length})` : ""}`} />
              </Tabs>
            </Box>
            <Box sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0 }}>
              {tab === 0 && theory.lesson && theory.progress && (
                <TheoryTab
                  key={theory.lesson.id}
                  lesson={theory.lesson}
                  progress={theory.progress}
                  pending={pending}
                  onSave={(page, endSession) => {
                    onSaveProgress({ lessonId: theory.lesson!.id, requestId: newRequestId(), currentPage: page, endSession });
                    if (endSession) onClose();
                  }}
                />
              )}
              {tab === 1 && theory.lesson && theory.progress && (
                <QuestionsTab
                  lesson={theory.lesson}
                  progress={theory.progress}
                  questionStats={questionStats}
                  pending={pending}
                  onSubmit={(questions, correctAnswers) =>
                    onRecordQuestions({ lessonId: theory.lesson!.id, requestId: newRequestId(), questions, correctAnswers })
                  }
                />
              )}
              {tab === 2 && theory.progress && (
                <PerformanceTab questionStats={questionStats} dayPerformance={dayPerformance} progress={theory.progress} onOpenQuestions={() => setTab(1)} />
              )}
              {tab === 3 && (
                <ReviewsTab
                  reviews={theory.reviews}
                  pending={pending}
                  onSubmit={(reviewId, questions, correctAnswers) =>
                    onRecordReview({ reviewId, requestId: newRequestId(), questions, correctAnswers })
                  }
                />
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
