import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Empty, Field } from "@bora/ui";
import { useState } from "react";

import type {
  ApiError,
  TheoryDiagnosis,
  TheoryGoal,
  TheoryLesson,
  TheoryProgress,
  TheoryReview,
} from "@/lib/api";
import { newRequestId } from "@/lib/api";
import { lessonProgressPercent, nextPage } from "@/lib/domain/theory";

/**
 * O QUE DIZER QUANDO O CATÁLOGO NÃO COBRE A DISCIPLINA.
 *
 * A v2 recusa inventar número de página, e mostra isto no lugar do controle.
 * Inventar faz o aluno ler o PDF errado e achar que a culpa é dele — e é o tipo
 * de erro que ele leva semanas para desconfiar.
 */
function diagnosisMessage(diagnosis: TheoryDiagnosis): string {
  switch (diagnosis.kind) {
    case "no_catalog_linked":
      return "Seu planejamento ainda não tem um catálogo de teoria vinculado. Fale com seu professor.";
    case "subject_not_audited":
      return `${diagnosis.subject} ainda não está no catálogo auditado, então não há como marcar o progresso por página. Estude pelo PDF e registre o tempo na meta.`;
    case "lesson_without_pages":
      return `A aula "${diagnosis.lesson}" está no catálogo sem o intervalo de páginas auditado. Seu professor precisa completá-lo antes de o progresso por página funcionar.`;
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
      <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{lesson.title}</Typography>
      <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
        {lesson.lessonCode} · {lesson.pdfFile}
        {lesson.theoryStartPage !== null && lesson.theoryEndPage !== null
          ? ` · teoria nas páginas ${lesson.theoryStartPage} a ${lesson.theoryEndPage}`
          : ""}
      </Typography>

      <LinearProgress
        variant="determinate"
        value={percent}
        aria-label={`${percent}% da teoria lida`}
        sx={{ height: 8, borderRadius: 999, mb: 0.75 }}
      />
      <Typography variant="numeric" component="p" data-testid="theory-percent" sx={{ mb: 2 }}>
        {percent}% lido
        {progress.theoryDone ? " · teoria concluída" : ""}
      </Typography>

      {lesson.note && (
        <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
          {lesson.note}
        </Typography>
      )}

      <Field
        label="Parei na página"
        name="currentPage"
        type="number"
        inputMode="numeric"
        value={page}
        onChange={(event) => setPage(event.target.value)}
        min={lesson.theoryStartPage ?? 1}
        max={lesson.theoryEndPage ?? undefined}
        hint={`A próxima página sugerida é a ${suggested}.`}
      />

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          disabled={pending}
          data-testid="theory-save-continue"
          onClick={() => onSave(Number(page), false)}
        >
          Salvar progresso e continuar
        </Button>
        {/*
          ENCERRAR A SESSÃO NÃO CONCLUI A AULA. Os dois botões gravam a mesma
          coisa; o segundo só fecha o modal. É a distinção que a v108.2
          introduziu e a que mais se perde ao reescrever.
        */}
        <Button
          variant="outlined"
          disabled={pending}
          data-testid="theory-save-end"
          onClick={() => onSave(Number(page), true)}
        >
          Salvar e encerrar sessão
        </Button>
      </Box>
    </Box>
  );
}

function QuestionsTab({
  progress,
  unlocked,
  onSubmit,
  pending,
}: {
  progress: TheoryProgress;
  unlocked: boolean;
  onSubmit: (questions: number, correct: number) => void;
  pending: boolean;
}) {
  const remaining = Math.max(0, progress.initialQuestionsRequired - progress.initialQuestionsDone);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
        <Typography variant="numeric" component="span" data-testid="initial-questions-count">
          {progress.initialQuestionsDone}/{progress.initialQuestionsRequired}
        </Typography>
        <Badge tone={progress.initialQuestionsComplete ? "success" : "neutral"}>
          {progress.initialQuestionsComplete ? "Mínimo atingido" : `Faltam ${remaining}`}
        </Badge>
      </Box>

      {unlocked ? (
        <Alert status="success">
          Aula concluída. A próxima aula da disciplina já está liberada.
        </Alert>
      ) : (
        <Typography variant="body2" sx={{ mb: 2 }}>
          A próxima aula libera quando a teoria estiver lida e você tiver feito pelo menos{" "}
          {progress.initialQuestionsRequired} questões iniciais.
          {!progress.theoryDone && " A teoria ainda não terminou."}
        </Typography>
      )}

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
        <Button type="submit" variant="contained" disabled={pending}>
          Registrar questões
        </Button>
      </Box>
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
 * O modal de meta de teoria — as três abas da v108.2.
 *
 * Teoria → Questões iniciais → Revisões, nessa ordem, porque é a ordem do
 * fluxo: a aula fecha com teoria lida E mínimo de questões, e só então a
 * próxima libera.
 */
export function TheoryDialog({
  theory,
  notice,
  error,
  pending,
  onClose,
  onSaveProgress,
  onRecordQuestions,
  onRecordReview,
}: {
  theory: TheoryGoal | null;
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

  if (!theory) return null;

  const blocked = theory.diagnosis.kind !== "ok";

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose} data-testid="theory-dialog">
      <DialogTitle>Estudo da teoria</DialogTitle>
      <DialogContent>
        {error && <Alert status="error">{error.message}</Alert>}
        {/*
          O AVISO É A ÚNICA COISA QUE LIGA O GESTO AO RESULTADO quando a aula
          fecha: o modal troca de conteúdo sozinho, e sem ele a Aula 02 aparece
          do nada.
        */}
        {notice && <Alert status="success">{notice}</Alert>}

        {blocked ? (
          <Alert status="warning">{diagnosisMessage(theory.diagnosis)}</Alert>
        ) : (
          <>
            <Tabs
              value={tab}
              onChange={(_event, value: number) => setTab(value)}
              sx={{ mb: 2 }}
              data-testid="theory-tabs"
            >
              <Tab label="Teoria" />
              <Tab label="Questões iniciais" />
              <Tab label={`Revisões${theory.reviews.length ? ` (${theory.reviews.length})` : ""}`} />
            </Tabs>

            {tab === 0 && theory.lesson && theory.progress && (
              <TheoryTab
                lesson={theory.lesson}
                progress={theory.progress}
                pending={pending}
                onSave={(page, endSession) => {
                  onSaveProgress({
                    lessonId: theory.lesson!.id,
                    requestId: newRequestId(),
                    currentPage: page,
                    endSession,
                  });
                  if (endSession) onClose();
                }}
              />
            )}

            {tab === 1 && theory.lesson && theory.progress && (
              <QuestionsTab
                progress={theory.progress}
                unlocked={theory.nextLessonUnlocked}
                pending={pending}
                onSubmit={(questions, correctAnswers) =>
                  onRecordQuestions({
                    lessonId: theory.lesson!.id,
                    requestId: newRequestId(),
                    questions,
                    correctAnswers,
                  })
                }
              />
            )}

            {tab === 2 && (
              <ReviewsTab
                reviews={theory.reviews}
                pending={pending}
                onSubmit={(reviewId, questions, correctAnswers) =>
                  onRecordReview({ reviewId, requestId: newRequestId(), questions, correctAnswers })
                }
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose}>
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
