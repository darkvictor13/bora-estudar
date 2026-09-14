import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Field, PageHeader } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, newRequestId, type ApiError, type Notebook } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";

/**
 * Cadernos TEC — o `p-cadernos` do professor.
 *
 * REMOVER É MARCAR, NÃO APAGAR. A meta de bateria aponta para o caderno por FK
 * com `ON DELETE RESTRICT`: apagar levaria junto o histórico, ou — pior — seria
 * recusado pelo banco no meio de um gesto que a tela prometeu. "Removido"
 * some da lista do aluno e continua aqui, com o botão de restaurar.
 *
 * `block_id` É A IDENTIDADE e não se edita: o gatilho
 * `protect_notebook_identity` a congela, porque é por ela que as metas
 * encontram o caderno.
 */
export async function teacherNotebooksLoader({ request }: { request: Request }) {
  await requireRole("teacher");

  const plans = await api.listPlans();
  const planId = new URL(request.url).searchParams.get("plano") ?? plans[0]?.id ?? null;

  return {
    plans,
    planId,
    notebooks: planId ? await api.listNotebooks(planId) : ([] as readonly Notebook[]),
  };
}

type LoaderData = Awaited<ReturnType<typeof teacherNotebooksLoader>>;

export function TeacherNotebooks() {
  const { plans, planId, notebooks } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();
  const [params, setParams] = useSearchParams();

  const [error, setError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; error?: ApiError }>) {
    const result = await action();
    if (!result.ok && result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setEditing(null);
    await revalidate();
  }

  const visible = notebooks.filter((notebook) => showRemoved || !notebook.deleted);
  const bySubject = new Map<string, Notebook[]>();
  for (const notebook of visible) {
    const list = bySubject.get(notebook.subjectName) ?? [];
    list.push(notebook);
    bySubject.set(notebook.subjectName, list);
  }

  return (
    <>
      <PageHeader
        title="Cadernos TEC"
        description="Ativar, desativar, editar e restaurar"
        actions={
          <>
            <TextField
              select
              size="small"
              label="Planejamento"
              value={planId ?? ""}
              slotProps={{ select: { inputProps: { "data-testid": "notebooks-plan" } } }}
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
            <Button
              size="small"
              variant="text"
              data-testid="toggle-removed"
              onClick={() => setShowRemoved(!showRemoved)}
            >
              {showRemoved ? "Ocultar removidos" : "Mostrar removidos"}
            </Button>
          </>
        }
      />

      <ContentBody>
        {error && <Alert status="error">{error.message}</Alert>}

        {plans.length === 0 && (
          <Empty icon="🗂">Nenhum planejamento. Os cadernos pertencem a um planejamento.</Empty>
        )}

        {planId && visible.length === 0 && (
          <Empty icon="📕">Nenhum caderno neste planejamento.</Empty>
        )}

        {[...bySubject.entries()].map(([subject, list]) => (
          <Box key={subject} sx={{ mb: 1.5 }}>
            <Card
              title={subject}
              sub={`Meta de ${list[0]!.subjectTarget}% de acerto`}
              action={<Badge tone="neutral">{list.length}</Badge>}
            >
              {list.map((notebook) => (
                <Box
                  key={notebook.blockId}
                  data-testid="notebook-row"
                  data-block-id={notebook.blockId}
                  data-active={notebook.active}
                  data-deleted={notebook.deleted}
                  sx={(theme) => ({
                    py: 1.125,
                    opacity: notebook.deleted ? 0.5 : 1,
                    borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
                    "&:last-of-type": { borderBottom: "none" },
                  })}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500 }} noWrap>
                        {notebook.notebookName}
                      </Typography>
                      <Typography variant="caption" component="p">
                        {notebook.totalQuestions} questões · {notebook.notebookKey}
                      </Typography>
                    </Box>

                    <Badge tone={notebook.deleted ? "neutral" : notebook.active ? "success" : "warning"}>
                      {notebook.deleted ? "Removido" : notebook.active ? "Ativo" : "Desativado"}
                    </Badge>

                    {notebook.deleted ? (
                      <Button
                        size="small"
                        variant="outlined"
                        data-testid="notebook-restore"
                        onClick={() => void run(() => api.restoreNotebook(notebook.blockId, newRequestId()))}
                      >
                        Restaurar
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="small"
                          variant="text"
                          data-testid="notebook-toggle"
                          onClick={() =>
                            void run(() =>
                              api.setNotebookActive(notebook.blockId, !notebook.active, newRequestId()),
                            )
                          }
                        >
                          {notebook.active ? "Desativar" : "Ativar"}
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setEditing(editing === notebook.blockId ? null : notebook.blockId)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          color="error"
                          data-testid="notebook-remove"
                          onClick={() => void run(() => api.deleteNotebook(notebook.blockId, newRequestId()))}
                        >
                          Remover
                        </Button>
                      </>
                    )}
                  </Box>

                  {editing === notebook.blockId && (
                    <Box
                      component="form"
                      noValidate
                      data-testid="notebook-form"
                      sx={{ mt: 1, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-end" }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void run(() =>
                          api.saveNotebook(
                            planId!,
                            {
                              ...notebook,
                              notebookName: String(data.get("notebookName") ?? ""),
                              notebookLink: String(data.get("notebookLink") ?? ""),
                              totalQuestions: Number(data.get("totalQuestions") ?? 0),
                              subjectTarget: Number(data.get("subjectTarget") ?? 80),
                            },
                            newRequestId(),
                          ),
                        );
                      }}
                    >
                      <Field label="Nome" name="notebookName" defaultValue={notebook.notebookName} />
                      <Field label="Link" name="notebookLink" defaultValue={notebook.notebookLink} />
                      <Field
                        label="Questões"
                        name="totalQuestions"
                        type="number"
                        min={0}
                        defaultValue={notebook.totalQuestions}
                      />
                      <Field
                        label="Meta (%)"
                        name="subjectTarget"
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={notebook.subjectTarget}
                      />
                      <Button type="submit" size="small" variant="contained" sx={{ mb: 2.5 }}>
                        Salvar
                      </Button>
                    </Box>
                  )}
                </Box>
              ))}
            </Card>
          </Box>
        ))}
      </ContentBody>
    </>
  );
}
