import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Metric, PageHeader, WEEKDAY_NAMES } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import {
  api,
  MAX_WEEK_NUMBER,
  newRequestId,
  type ApiError,
  type GenerateWeekInput,
  type GenerateWeekPreview,
  type StudyPlanSummary,
} from "@/lib/api";
import { requireRole } from "@/lib/auth/session";

/**
 * Gerar metas — o `p-montarMetas` da v2.
 *
 * A PRÉVIA VEM ANTES DA ESCRITA, sempre. Gerar semana é a operação mais cara de
 * desfazer do produto: ela apaga metas. O professor vê o que vai acontecer —
 * quantas criar, quantas substituir, quantas ficam de pé — e só então grava.
 *
 * GERAR TEM UMA REGRA SÓ: substitui o que não foi feito. Meta concluída e meta
 * com estudo registrado não se apagam, e por isso não há seletor de modo nem
 * confirmação extra — o modo que substituía a semana inteira saiu em 06/10/2026
 * (spec 04, R-GEN-12).
 *
 * O `request_id` nasce com a PRÉVIA e é o mesmo em toda tentativa de gravá-la.
 * Gerá-lo a cada clique faria cada tentativa chegar ao banco como operação nova,
 * e `goal_batches` viraria decoração.
 */
export async function teacherGoalsLoader({ request }: { request: Request }) {
  await requireRole("teacher");

  const plans = (await api.listPlans()).filter((plan) => plan.status === "active");
  const params = new URL(request.url).searchParams;
  const planId = params.get("plano") ?? plans[0]?.id ?? null;
  // Sem `|| 1`: a recusa de 0, -3 ou 1.5 vem do contrato, com a frase, e não de
  // uma troca silenciosa (QA-17). `weekParam` é o que o campo mostra.
  const weekParam = params.get("semana") ?? "1";

  return { plans, planId, week: Number(weekParam), weekParam };
}

type LoaderData = Awaited<ReturnType<typeof teacherGoalsLoader>>;

function PreviewPanel({ preview }: { preview: GenerateWeekPreview }) {
  return (
    <Box data-testid="week-preview">
      <Box
        sx={(theme) => ({
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1.25,
          mb: 1.75,
          [theme.breakpoints.down("lg")]: { gridTemplateColumns: "1fr" },
        })}
      >
        <Metric label="Metas a criar" value={preview.goalsToCreate} />
        <Metric label="A substituir" value={preview.goalsToReplace} />
        <Metric
          label="Preservadas"
          value={preview.goalsPreserved}
          note="concluídas ou com estudo registrado"
        />
      </Box>

      {preview.days.map((day) => (
        <Box key={day.date} sx={{ mb: 1.25 }}>
          <Card title={`${WEEKDAY_NAMES[day.weekday - 1]} · ${day.date.slice(8, 10)}/${day.date.slice(5, 7)}`}>
            {day.goals.map((goal) => (
              <Box
                key={goal.id}
                data-testid="preview-goal"
                data-subject={goal.subject}
                sx={(theme) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  py: 0.875,
                  borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
                  "&:last-of-type": { borderBottom: "none" },
                })}
              >
                <Typography sx={{ flex: 1, fontSize: "0.8125rem" }}>{goal.title}</Typography>
                <Badge tone="neutral">{goal.plannedMinutes}min</Badge>
              </Box>
            ))}
          </Card>
        </Box>
      ))}
    </Box>
  );
}

export function TeacherGoals() {
  const { plans, planId, week, weekParam } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();

  // A prévia e a entrada que a produziu, juntas: o `requestId` da entrada é o
  // mesmo em toda tentativa de gravá-la. Mudar plano, semana ou cópia descarta
  // as duas.
  const [pending, setPending] = useState<{
    input: GenerateWeekInput;
    preview: GenerateWeekPreview;
  } | null>(null);
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const plan = plans.find((candidate) => candidate.id === planId) ?? null;

  async function buildPreview() {
    if (!plan) return;
    setSaved(null);
    const input: GenerateWeekInput = {
      studyPlanId: plan.id,
      requestId: newRequestId(),
      weekNumber: week,
      ...(copyFrom ? { copyFromWeek: Number(copyFrom) } : {}),
    };
    try {
      setPending({ input, preview: await api.previewWeek(input) });
      setError(null);
    } catch (failure) {
      setPending(null);
      setError({
        code: "unknown",
        message: failure instanceof Error ? failure.message : "Não foi possível montar a prévia.",
      });
    }
  }

  async function generate() {
    if (!pending) return;
    // Em caso de falha `pending` FICA: um novo clique repete o mesmo id.
    const result = await api.generateWeek(pending.input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setPending(null);
    setSaved(`Semana ${week} gerada com ${result.data.summary.goalsTotal} metas.`);
  }

  function setParam(key: string, value: string) {
    if (value) params.set(key, value);
    else params.delete(key);
    setParams(params);
    setPending(null);
    setSaved(null);
  }

  return (
    <>
      <PageHeader
        title="Gerar metas"
        description="A prévia vem antes da escrita"
        actions={
          <>
            <TextField
              select
              size="small"
              label="Planejamento"
              value={planId ?? ""}
              slotProps={{ select: { inputProps: { "data-testid": "goals-plan" } } }}
              onChange={(event) => setParam("plano", event.target.value)}
              sx={{ minWidth: 240 }}
            >
              {plans.map((option: StudyPlanSummary) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="number"
              label="Semana"
              value={weekParam}
              slotProps={{
                htmlInput: { min: 1, max: MAX_WEEK_NUMBER, step: 1, "data-testid": "goals-week" },
              }}
              onChange={(event) => setParam("semana", event.target.value)}
              sx={{ width: 120 }}
            />
          </>
        }
      />

      <ContentBody>
        {error && <Alert status="error">{error.message}</Alert>}
        {saved && <Alert status="success">{saved}</Alert>}

        {!plan ? (
          <Empty icon="🗂">
            Nenhum planejamento ativo. Ative um planejamento antes de gerar metas.
          </Empty>
        ) : (
          <>
            <Card title="Como gerar" sub={plan.name}>
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-end" }}>
                <TextField
                  size="small"
                  type="number"
                  label="Copiar da semana"
                  placeholder="opcional"
                  value={copyFrom}
                  slotProps={{
                    htmlInput: { min: 1, max: MAX_WEEK_NUMBER, step: 1, "data-testid": "goals-copy-from" },
                  }}
                  onChange={(event) => {
                    setCopyFrom(event.target.value);
                    setPending(null);
                  }}
                  sx={{ width: 180 }}
                />

                <Button variant="outlined" data-testid="goals-preview" onClick={() => void buildPreview()}>
                  Ver prévia
                </Button>
              </Box>

            </Card>

            {pending && (
              <Box sx={{ mt: 1.75 }}>
                <PreviewPanel preview={pending.preview} />

                <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                  <Button variant="contained" data-testid="goals-generate" onClick={() => void generate()}>
                    {`Gerar ${pending.preview.goalsToCreate} metas`}
                  </Button>
                  <Button variant="text" onClick={() => setPending(null)}>
                    Descartar prévia
                  </Button>
                </Box>
              </Box>
            )}
          </>
        )}
      </ContentBody>
    </>
  );
}
