import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Field, Metric, PageHeader } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type ApiError, type Reinforcement, type ReviewGridRow } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";

/**
 * Revisões, do lado do professor — controle manual e reforços.
 *
 * É AQUI QUE O ESPAÇAMENTO SE CONFIGURA. Na tela do aluno a grade é leitura:
 * `theory_review_rules` tem policy `teacher_id = auth.uid()`, e quem decide de
 * quantas em quantas aulas a matéria volta é quem montou o plano.
 *
 * REVISÃO E REFORÇO CONTINUAM SEPARADOS, como na v2: calendário de um lado,
 * reação a desempenho baixo do outro.
 */
export async function teacherReviewsLoader({ request }: { request: Request }) {
  await requireRole("teacher");

  const plans = (await api.listPlans()).filter((plan) => plan.status === "active");
  const planId = new URL(request.url).searchParams.get("plano") ?? plans[0]?.id ?? null;

  if (!planId) {
    return {
      plans,
      planId: null,
      grid: [] as readonly ReviewGridRow[],
      reinforcements: [] as readonly Reinforcement[],
    };
  }

  const [grid, reinforcements] = await Promise.all([
    api.loadReviewGrid(planId),
    api.listReinforcements(planId),
  ]);

  return { plans, planId, grid, reinforcements };
}

type LoaderData = Awaited<ReturnType<typeof teacherReviewsLoader>>;

export function TeacherReviews() {
  const { plans, planId, grid, reinforcements } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(row: ReviewGridRow, spacing: number, minimum: number) {
    if (!planId) return;
    const result = await api.saveReviewSpacing({
      studyPlanId: planId,
      subjectKey: row.subjectKey,
      reviewNumber: 1,
      lessonSpacing: spacing,
      minimumQuestions: minimum,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaved(`Espaçamento de ${row.subject} salvo.`);
    await revalidate();
  }

  const due = grid.flatMap((row) => row.reviews.filter((review) => review.due)).length;

  return (
    <>
      <PageHeader
        title="Revisões"
        description="O ritmo de releitura, por disciplina"
        actions={
          <TextField
            select
            size="small"
            label="Planejamento"
            value={planId ?? ""}
            slotProps={{ select: { inputProps: { "data-testid": "reviews-plan" } } }}
            onChange={(event) => {
              params.set("plano", event.target.value);
              setParams(params);
            }}
            sx={{ minWidth: 260 }}
          >
            {plans.map((plan) => (
              <MenuItem key={plan.id} value={plan.id}>
                {plan.name}
              </MenuItem>
            ))}
          </TextField>
        }
      />

      <ContentBody>
        {error && <Alert status="error">{error.message}</Alert>}
        {saved && <Alert status="success">{saved}</Alert>}

        {!planId && (
          <Empty icon="🔁">
            Nenhum planejamento ativo. A grade de revisão pertence a um planejamento.
          </Empty>
        )}

        {planId && (
          <Box
            sx={(theme) => ({
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1.25,
              mb: 1.75,
              [theme.breakpoints.down("lg")]: { gridTemplateColumns: "1fr" },
            })}
          >
            <Metric label="Disciplinas" value={grid.length} />
            <Metric label="Revisões vencidas" value={due} />
            <Metric label="Reforços" value={reinforcements.length} />
          </Box>
        )}

        {planId && grid.length === 0 && (
          <Empty icon="📚">
            Este planejamento ainda não tem catálogo de teoria vinculado. Vincule um no catálogo
            antes de configurar as revisões.
          </Empty>
        )}

        {grid.map((row) => (
          <Box key={row.subjectKey} sx={{ mb: 1.5 }}>
            <Card
              title={row.subject}
              sub={`${row.reviews.filter((review) => review.status === "completed").length} de ${row.reviews.length} feitas`}
              action={
                <Badge tone={row.reviews.some((review) => review.due) ? "warning" : "neutral"}>
                  {row.reviews.filter((review) => review.due).length} vencidas
                </Badge>
              }
            >
              <Box
                component="form"
                noValidate
                data-testid="spacing-form"
                data-subject={row.subjectKey}
                sx={{ display: "flex", gap: 1.5, alignItems: "flex-end", flexWrap: "wrap" }}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void save(
                    row,
                    Number(data.get("lessonSpacing") ?? 2),
                    Number(data.get("minimumQuestions") ?? 15),
                  );
                }}
              >
                <Field
                  label="A cada N aulas"
                  name="lessonSpacing"
                  type="number"
                  min={1}
                  max={200}
                  defaultValue={row.lessonSpacing || 2}
                  invalid={error?.field === "lessonSpacing"}
                />
                <Field
                  label="Mínimo de questões"
                  name="minimumQuestions"
                  type="number"
                  min={1}
                  max={200}
                  defaultValue={row.minimumQuestions || 15}
                  invalid={error?.field === "minimumQuestions"}
                />
                <Button type="submit" size="small" variant="contained" sx={{ mb: 2.5 }}>
                  Salvar ritmo
                </Button>
              </Box>

              {row.reviews.length === 0 ? (
                <Typography variant="caption" component="p">
                  Nenhuma revisão criada. Elas nascem quando o aluno fecha a aula.
                </Typography>
              ) : (
                <Typography variant="caption" component="p">
                  {row.reviews.filter((review) => review.due).length} vencidas de{" "}
                  {row.reviews.length} criadas.
                </Typography>
              )}
            </Card>
          </Box>
        ))}

        {planId && (
          <Card title="Reforços sugeridos" sub="Nascem de desempenho baixo numa bateria">
            {reinforcements.length === 0 ? (
              <Typography variant="body2">
                Nenhum reforço. Eles dependem do motor de baterias, que saiu com a extensão e está
                sendo reescrito.
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
                  <Typography sx={{ flex: 1, fontSize: "0.8125rem" }}>
                    {reinforcement.blockName}
                  </Typography>
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
