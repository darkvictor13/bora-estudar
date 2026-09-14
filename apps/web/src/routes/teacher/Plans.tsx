import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Field, PageHeader, type BadgeTone } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";

import { ContentBody } from "@/components/AppShell";
import {
  api,
  newRequestId,
  type ApiError,
  type StudentCard,
  type StudyPlanSummary,
} from "@/lib/api";
import { requireRole } from "@/lib/auth/session";

/**
 * Planejamentos — criar, editar, ativar e arquivar.
 *
 * UM ATIVO POR ALUNO, e o banco garante com índice único parcial. A tela torna
 * a consequência visível: ativar um planejamento ARQUIVA o anterior, e o botão
 * diz isso antes de ser clicado. Um "ativar" que silenciosamente desativa outro
 * é a forma mais rápida de um professor perder o planejamento que montou.
 */
export async function teacherPlansLoader() {
  await requireRole("teacher");

  const [plans, students] = await Promise.all([api.listPlans(), api.listStudents({})]);
  return { plans, students };
}

type LoaderData = Awaited<ReturnType<typeof teacherPlansLoader>>;

const STATUS: Record<StudyPlanSummary["status"], { label: string; tone: BadgeTone }> = {
  active: { label: "Ativo", tone: "success" },
  paused: { label: "Pausado", tone: "neutral" },
  completed: { label: "Concluído", tone: "neutral" },
  archived: { label: "Arquivado", tone: "neutral" },
};

function PlanDialog({
  students,
  plan,
  open,
  onClose,
  onSubmit,
  error,
}: {
  students: readonly StudentCard[];
  plan: StudyPlanSummary | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => void;
  error: ApiError | null;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="plan-dialog">
      <DialogTitle>{plan ? "Editar planejamento" : "Novo planejamento"}</DialogTitle>
      <Box
        component="form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        <DialogContent>
          {error && <Alert status="error">{error.message}</Alert>}

          {/* O aluno é escolhido UMA VEZ. Mover um planejamento de aluno levaria
              junto metas, registros e progresso — e o banco recusa, porque
              `student_id` fica fora do GRANT UPDATE. */}
          {plan ? (
            <Typography variant="body2" sx={{ mb: 2 }}>
              Editando <strong>{plan.name}</strong>.
            </Typography>
          ) : (
            <TextField
              select
              name="studentId"
              label="Aluno"
              fullWidth
              size="small"
              defaultValue={students[0]?.studentId ?? ""}
              sx={{ mb: 1.75 }}
              slotProps={{ select: { inputProps: { "data-testid": "plan-student" } } }}
            >
              {students.map((student) => (
                <MenuItem key={student.studentId} value={student.studentId}>
                  {student.name ?? "Sem nome"}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Field
            label="Nome"
            name="name"
            defaultValue={plan?.name ?? ""}
            required
            invalid={error?.field === "name"}
          />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <Field label="Área" name="area" defaultValue={plan?.area ?? "Fiscal"} required />
            <Field label="Concurso" name="targetExam" defaultValue={plan?.targetExam ?? ""} />
            <Field label="Fase" name="stage" defaultValue={plan?.stage ?? "Pré-edital"} />
            <Field
              label="Modelo de estudo"
              name="studyModel"
              defaultValue={plan?.studyModel ?? "Avanço progressivo"}
            />
            <Field
              label="Metas por semana"
              name="weeklyGoals"
              type="number"
              min={1}
              max={60}
              defaultValue={plan?.weeklyGoals ?? 12}
              invalid={error?.field === "weeklyGoals"}
            />
            <Field
              label="Início"
              name="startsOn"
              type="date"
              defaultValue={plan?.startsOn ?? new Date().toISOString().slice(0, 10)}
            />
            <Field
              label="Data da prova"
              name="examDate"
              type="date"
              defaultValue={plan?.examDate ?? ""}
              invalid={error?.field === "examDate"}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="text" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="contained" type="submit">
            {plan ? "Salvar" : "Criar"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function TeacherPlans() {
  const { plans, students } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();

  const [dialog, setDialog] = useState<{ open: boolean; plan: StudyPlanSummary | null }>({
    open: false,
    plan: null,
  });
  const [error, setError] = useState<ApiError | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: ApiError }>) {
    const result = await action();
    if (!result.ok && result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setDialog({ open: false, plan: null });
    await revalidate();
  }

  function submit(data: FormData) {
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const input = {
      name: text("name"),
      area: text("area"),
      targetExam: text("targetExam"),
      stage: text("stage"),
      studyModel: text("studyModel"),
      weeklyGoals: Number(data.get("weeklyGoals") ?? 12),
      startsOn: text("startsOn"),
      examDate: text("examDate"),
    };

    void run(() =>
      dialog.plan
        ? api.updatePlan(dialog.plan.id, input, newRequestId())
        : api.createPlan({ ...input, studentId: text("studentId") }, newRequestId()),
    );
  }

  const byStudent = new Map<string, StudentCard>(
    students.map((student) => [student.studentId, student]),
  );

  return (
    <>
      <PageHeader
        title="Planejamentos"
        description="Um ativo por aluno — ativar um arquiva o anterior"
        actions={
          <Button
            variant="contained"
            size="small"
            disabled={students.length === 0}
            onClick={() => setDialog({ open: true, plan: null })}
          >
            Novo planejamento
          </Button>
        }
      />

      <ContentBody>
        {error && <Alert status="error">{error.message}</Alert>}

        {plans.length === 0 ? (
          <Empty icon="🗂">
            {students.length === 0
              ? "Nenhum aluno vinculado ainda. O planejamento nasce para um aluno."
              : "Nenhum planejamento. Crie o primeiro."}
          </Empty>
        ) : (
          plans.map((plan) => (
            <Box key={plan.id} sx={{ mb: 1.5 }}>
              <Card
                title={plan.name}
                sub={`${plan.area}${plan.targetExam ? ` · ${plan.targetExam}` : ""} · ${plan.weeklyGoals} metas por semana`}
                action={<Badge tone={STATUS[plan.status].tone}>{STATUS[plan.status].label}</Badge>}
              >
                <Box
                  data-testid="plan-row"
                  data-plan-id={plan.id}
                  data-status={plan.status}
                  sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}
                >
                  <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }}>
                    Início em {plan.startsOn}
                    {plan.examDate ? ` · prova em ${plan.examDate}` : ""}
                  </Typography>

                  <Button size="small" variant="text" onClick={() => setDialog({ open: true, plan })}>
                    Editar
                  </Button>

                  {plan.status !== "active" && (
                    <Button
                      size="small"
                      variant="outlined"
                      data-testid="plan-activate"
                      onClick={() => void run(() => api.activatePlan(plan.id, newRequestId()))}
                    >
                      Ativar — arquiva o atual
                    </Button>
                  )}

                  {plan.status !== "archived" && (
                    <Button
                      size="small"
                      variant="text"
                      data-testid="plan-archive"
                      onClick={() => void run(() => api.archivePlan(plan.id, newRequestId()))}
                    >
                      Arquivar
                    </Button>
                  )}
                </Box>
              </Card>
            </Box>
          ))
        )}
      </ContentBody>

      <PlanDialog
        students={students}
        plan={dialog.plan}
        open={dialog.open}
        error={error}
        onClose={() => setDialog({ open: false, plan: null })}
        onSubmit={submit}
      />

      {/* O mapa existe para o teste conferir de quem é cada planejamento sem
          uma segunda consulta; a tela usa o nome do planejamento. */}
      <Box sx={{ display: "none" }} data-testid="plan-students">
        {[...byStudent.keys()].join(",")}
      </Box>
    </>
  );
}
