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
  newRequestId,
  type ApiError,
  type GenerateWeekPreview,
  type ReplaceMode,
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
 * A SUBSTITUIÇÃO SEGURA É O PADRÃO (LEIA-ME v108.3). "Replanejar semana
 * inteira" é caminho separado, com confirmação, porque é o único que apaga meta
 * concluída — e com ela os registros do aluno.
 */
export async function teacherGoalsLoader({ request }: { request: Request }) {
  await requireRole("teacher");

  const plans = (await api.listPlans()).filter((plan) => plan.status === "active");
  const params = new URL(request.url).searchParams;
  const planId = params.get("plano") ?? plans[0]?.id ?? null;
  const week = Number(params.get("semana") ?? 1) || 1;

  return { plans, planId, week };
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
          note="concluídas, com os registros"
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
  const { plans, planId, week } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();

  const [preview, setPreview] = useState<GenerateWeekPreview | null>(null);
  const [mode, setMode] = useState<ReplaceMode>("safe");
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const plan = plans.find((candidate) => candidate.id === planId) ?? null;

  function input() {
    return {
      studyPlanId: plan!.id,
      requestId: newRequestId(),
      weekNumber: week,
      mode,
      ...(copyFrom ? { copyFromWeek: Number(copyFrom) } : {}),
    };
  }

  async function buildPreview() {
    if (!plan) return;
    setSaved(null);
    try {
      setPreview(await api.previewWeek(input()));
      setError(null);
    } catch (failure) {
      setError({
        code: "unknown",
        message: failure instanceof Error ? failure.message : "Não foi possível montar a prévia.",
      });
    }
  }

  async function generate() {
    if (!plan) return;
    const result = await api.generateWeek(input());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setConfirming(false);
    setPreview(null);
    setSaved(`Semana ${week} gerada com ${result.data.summary.goalsTotal} metas.`);
  }

  function setParam(key: string, value: string) {
    if (value) params.set(key, value);
    else params.delete(key);
    setParams(params);
    setPreview(null);
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
              value={String(week)}
              slotProps={{ htmlInput: { min: 1, "data-testid": "goals-week" } }}
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
                  select
                  size="small"
                  label="Substituição"
                  value={mode}
                  slotProps={{ select: { inputProps: { "data-testid": "goals-mode" } } }}
                  onChange={(event) => {
                    setMode(event.target.value as ReplaceMode);
                    setPreview(null);
                  }}
                  sx={{ minWidth: 260 }}
                >
                  <MenuItem value="safe">Segura — preserva o que foi concluído</MenuItem>
                  <MenuItem value="full">Replanejar semana inteira — apaga tudo</MenuItem>
                </TextField>

                <TextField
                  size="small"
                  type="number"
                  label="Copiar da semana"
                  placeholder="opcional"
                  value={copyFrom}
                  slotProps={{ htmlInput: { min: 1, "data-testid": "goals-copy-from" } }}
                  onChange={(event) => {
                    setCopyFrom(event.target.value);
                    setPreview(null);
                  }}
                  sx={{ width: 180 }}
                />

                <Button variant="outlined" data-testid="goals-preview" onClick={() => void buildPreview()}>
                  Ver prévia
                </Button>
              </Box>

              {mode === "full" && (
                <Box sx={{ mt: 1.5 }}>
                  <Alert status="warning">
                    Replanejar a semana inteira apaga também as metas concluídas — e os registros
                    de estudo que dependem delas. Só use quando a semana precisa ser refeita do
                    zero.
                  </Alert>
                </Box>
              )}
            </Card>

            {preview && (
              <Box sx={{ mt: 1.75 }}>
                <PreviewPanel preview={preview} />

                <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                  {/*
                    O modo `full` EXIGE CONFIRMAÇÃO antes de gravar. É o caminho
                    que apaga meta concluída, e um clique único nele é a forma
                    mais rápida de o aluno perder uma semana de estudo.
                  */}
                  {mode === "full" && !confirming ? (
                    <Button
                      variant="contained"
                      color="error"
                      data-testid="goals-confirm"
                      onClick={() => setConfirming(true)}
                    >
                      Replanejar semana inteira…
                    </Button>
                  ) : (
                    <Button variant="contained" data-testid="goals-generate" onClick={() => void generate()}>
                      {mode === "full"
                        ? `Confirmo: apagar ${preview.goalsToReplace} metas e gerar ${preview.goalsToCreate}`
                        : `Gerar ${preview.goalsToCreate} metas`}
                    </Button>
                  )}
                  <Button variant="text" onClick={() => { setPreview(null); setConfirming(false); }}>
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
