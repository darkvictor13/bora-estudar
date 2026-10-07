import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Field, Metric, PageHeader } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";

import { ContentBody } from "@/components/AppShell";
import {
  api,
  MAX_ENTRY_QUESTIONS,
  newRequestId,
  type ApiError,
  type Reinforcement,
  type ReviewGridRow,
} from "@/lib/api";
import { requireStudentAccess } from "@/lib/auth/session";
import { parseCount } from "@/lib/domain/week";

/**
 * Controle de revisões — o `p-controleRevisoes` da v2.
 *
 * REVISÃO E REFORÇO SÃO COISAS DIFERENTES, e a tela mantém a separação que a v2
 * já tinha: a grade de revisão é CALENDÁRIO — relê o que foi estudado, no
 * espaçamento configurado, independentemente de ter ido bem —, e o reforço é
 * REAÇÃO a desempenho baixo. Numa lista só, o aluno não sabe por que cada linha
 * está ali.
 *
 * O ESPAÇAMENTO É SÓ LEITURA AQUI. Quem o configura é o professor: a policy de
 * `theory_review_rules` exige `teacher_id = auth.uid()`, e um campo editável
 * nesta tela seria promessa que o banco recusa.
 */
export async function studentReviewsLoader() {
  await requireStudentAccess();

  const plan = await api.loadActivePlanOrNull();
  if (!plan) {
    return {
      grid: [] as readonly ReviewGridRow[],
      reinforcements: [] as readonly Reinforcement[],
      hasPlan: false,
    };
  }

  const [grid, reinforcements] = await Promise.all([
    api.loadReviewGrid(plan.id),
    api.listReinforcements(plan.id),
  ]);

  return { grid, reinforcements, hasPlan: true };
}

type LoaderData = Awaited<ReturnType<typeof studentReviewsLoader>>;

export function StudentReviews() {
  const { grid, reinforcements, hasPlan } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  // A chave de retentativa NASCE NO CLIQUE EM "Registrar" e fica até o sucesso:
  // gerada no envio, a resposta que se perde seguida de um novo clique somaria
  // duas vezes (QA-04). Uma por revisão, porque duas revisões abertas em
  // sequência não podem repartir a mesma.
  const [requestIds, setRequestIds] = useState<Readonly<Record<string, string>>>({});

  const due = grid.flatMap((row) => row.reviews.filter((review) => review.due));
  const pending = grid.flatMap((row) =>
    row.reviews.filter((review) => review.status !== "completed"),
  );

  function toggle(reviewId: string) {
    if (open !== reviewId) {
      const fresh = newRequestId();
      setRequestIds((known) => (known[reviewId] ? known : { ...known, [reviewId]: fresh }));
    }
    setOpen(open === reviewId ? null : reviewId);
  }

  async function record(reviewId: string, questions: number, correctAnswers: number) {
    const requestId = requestIds[reviewId];
    if (!requestId) return;

    setSaving(true);
    const result = await api.recordReviewQuestions({ reviewId, requestId, questions, correctAnswers });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setOpen(null);
    // A chave desta revisão foi gasta: o próximo "Registrar" cria outra.
    setRequestIds(({ [reviewId]: _spent, ...rest }) => rest);
    await revalidate();
  }

  return (
    <>
      <PageHeader
        title="Controle de revisões"
        description="O calendário de releitura, no espaçamento que seu professor definiu"
      />

      <ContentBody>
        {!hasPlan && (
          <Alert status="info">
            Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.
          </Alert>
        )}
        {error && <Alert status="error">{error.message}</Alert>}

        {hasPlan && (
          <Box
            sx={(theme) => ({
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1.25,
              mb: 1.75,
              [theme.breakpoints.down("lg")]: { gridTemplateColumns: "1fr" },
            })}
          >
            <Metric label="Disciplinas no ciclo" value={grid.filter((row) => row.selected).length} />
            <Metric
              label="Revisões vencidas"
              value={due.length}
              note={due.length === 0 ? "Nada em atraso" : "Não bloqueiam a próxima aula"}
            />
            <Metric label="Agendadas" value={pending.length - due.length} />
          </Box>
        )}

        {hasPlan && grid.length === 0 && (
          <Empty icon="🔁">
            Nenhuma regra de revisão configurada. Seu professor define de quantas em quantas aulas
            cada matéria volta.
          </Empty>
        )}

        {grid.map((row) => (
          <Box key={row.subjectKey} sx={{ mb: 1.5 }}>
            <Card
              title={row.subject}
              sub={
                row.lessonSpacing > 0
                  ? `Revisão a cada ${row.lessonSpacing} ${
                      row.lessonSpacing === 1 ? "aula" : "aulas"
                    } · mínimo de ${row.minimumQuestions} questões`
                  : "Sem regra de revisão configurada"
              }
              action={
                <Badge tone={row.reviews.some((review) => review.due) ? "warning" : "neutral"}>
                  {row.reviews.filter((review) => review.status === "completed").length}/
                  {row.reviews.length}
                </Badge>
              }
            >
              {row.reviews.length === 0 ? (
                <Typography variant="caption" component="p">
                  Nenhuma revisão criada ainda. Elas nascem quando a aula fecha.
                </Typography>
              ) : (
                row.reviews.map((review) => (
                  <Box
                    key={review.id}
                    data-testid="review-row"
                    data-review-id={review.id}
                    data-due={review.due}
                    data-status={review.status}
                    sx={(theme) => ({
                      py: 1.125,
                      borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
                      "&:last-of-type": { borderBottom: "none" },
                    })}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>
                        {review.lessonTitle}
                      </Typography>
                      <Badge tone="neutral">{review.reviewNumber}ª</Badge>
                      <Badge
                        tone={
                          review.due
                            ? "warning"
                            : review.status === "completed"
                              ? "success"
                              : "neutral"
                        }
                      >
                        {review.due
                          ? "Vencida"
                          : review.status === "completed"
                            ? "Feita"
                            : "Agendada"}
                      </Badge>
                      <Badge tone="neutral">
                        {review.questionsAnswered}/{review.minimumQuestions}
                      </Badge>
                      {review.status !== "completed" && (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => toggle(review.id)}
                        >
                          Registrar
                        </Button>
                      )}
                    </Box>

                    {open === review.id && (
                      <Box
                        component="form"
                        noValidate
                        sx={{ mt: 1, display: "flex", gap: 1, alignItems: "flex-end", flexWrap: "wrap" }}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          void record(
                            review.id,
                            parseCount(String(data.get("questions") ?? "")),
                            parseCount(String(data.get("correctAnswers") ?? "")),
                          );
                        }}
                      >
                        <Field
                          label="Questões"
                          name="questions"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={MAX_ENTRY_QUESTIONS}
                          step={1}
                          defaultValue={Math.min(
                            Math.max(review.minimumQuestions - review.questionsAnswered, 1),
                            MAX_ENTRY_QUESTIONS,
                          )}
                        />
                        <Field label="Acertos" name="correctAnswers" type="number" inputMode="numeric" min={0} max={MAX_ENTRY_QUESTIONS} step={1} defaultValue={0} />
                        <Button type="submit" size="small" variant="contained" disabled={saving} sx={{ mb: 1.75 }}>
                          Salvar
                        </Button>
                      </Box>
                    )}
                  </Box>
                ))
              )}
            </Card>
          </Box>
        ))}

        {hasPlan && (
          <Card
            title="Reforços"
            sub="Nascem de desempenho baixo numa bateria — não do calendário"
          >
            {reinforcements.length === 0 ? (
              // O VAZIO AQUI É A RESPOSTA CERTA, e não um defeito: o motor de
              // baterias saiu com a extensão, e sem bateria não há desempenho
              // baixo que dispare reforço.
              <Typography variant="body2">
                Nenhum reforço. Eles aparecem quando uma bateria fica abaixo da meta da
                disciplina — e a execução de baterias está sendo reescrita.
              </Typography>
            ) : (
              reinforcements.map((reinforcement) => (
                <Box
                  key={reinforcement.id}
                  data-testid="reinforcement-row"
                  sx={(theme) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    py: 1.125,
                    borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
                    "&:last-of-type": { borderBottom: "none" },
                  })}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                      {reinforcement.blockName}
                    </Typography>
                    <Typography variant="caption" component="p">
                      {reinforcement.subject} · {reinforcement.sourceErrors} erros em{" "}
                      {reinforcement.uniqueQuestions} questões
                    </Typography>
                  </Box>
                  <Badge tone="warning">{reinforcement.sourceScore}%</Badge>
                </Box>
              ))
            )}
          </Card>
        )}
      </ContentBody>
    </>
  );
}
