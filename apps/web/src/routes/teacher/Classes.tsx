import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Field, PageHeader } from "@bora/ui";
import { useState } from "react";
import { Link as RouterLink, useLoaderData, useRevalidator } from "react-router";

import { ContentBody } from "@/components/AppShell";
import {
  api,
  newRequestId,
  type ApiError,
  type StudentCard,
  type TeacherClass,
} from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

/**
 * TURMAS — criar, renomear, apagar e esvaziar.
 *
 * `classes` e `class_students` existiam no banco desde a migration inicial, com
 * policy, grant e a FK composta que impede matricular aluno de outro professor,
 * e nunca tinham ganhado tela. `StudentCard.className` era lido e exibido, e
 * `StudentListFilter.classId` era declarado no contrato e ignorado em silêncio.
 *
 * MATRICULAR NÃO É AQUI, e sim na ficha do aluno: a pergunta "em que turma este
 * aluno está" é sobre o ALUNO, e resolvê-la aqui obrigaria a abrir a turma
 * certa antes de saber qual é.
 *
 * APAGAR TURMA COM ALUNO DENTRO É RECUSADO PELO BANCO, e não escondido pela
 * tela: o botão aparece sempre, e quem recusa é o gatilho
 * `protect_class_with_students`. Esconder o botão faria a regra existir só aqui
 * — e uma regra que só existe na tela é o que este repositório trata como bug.
 */
export async function teacherClassesLoader() {
  await requireRole("teacher");

  const [classes, students] = await Promise.all([api.listClasses(), api.listStudents({})]);
  return { classes, students };
}

type LoaderData = Awaited<ReturnType<typeof teacherClassesLoader>>;

function ClassDialog({
  turma,
  open,
  onClose,
  onSubmit,
  error,
}: {
  turma: TeacherClass | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => void;
  error: ApiError | null;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="class-dialog">
      <DialogTitle>{turma ? "Editar turma" : "Nova turma"}</DialogTitle>
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

          <Field
            label="Nome"
            name="name"
            defaultValue={turma?.name ?? ""}
            required
            invalid={error?.field === "name"}
            hint="“Fiscal 2027” cabe no nome — turma não tem período próprio."
          />
          <Field
            label="Descrição"
            name="description"
            defaultValue={turma?.description ?? ""}
            hint="Horário, sala, o que ajudar a reconhecer."
          />
        </DialogContent>
        <DialogActions>
          <Button variant="text" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="contained" type="submit">
            {turma ? "Salvar" : "Criar"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function TeacherClasses() {
  const { classes, students } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();

  const [dialog, setDialog] = useState<{ open: boolean; turma: TeacherClass | null }>({
    open: false,
    turma: null,
  });
  const [error, setError] = useState<ApiError | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: ApiError }>) {
    const result = await action();
    if (!result.ok && result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setDialog({ open: false, turma: null });
    await revalidate();
  }

  function submit(data: FormData) {
    const input = {
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
    };

    void run(() =>
      dialog.turma
        ? api.renameClass(dialog.turma.id, input, newRequestId())
        : api.createClass(input, newRequestId()),
    );
  }

  const membersOf = (classId: string): readonly StudentCard[] =>
    students.filter((student) => student.classId === classId);

  return (
    <>
      <PageHeader
        title="Turmas"
        description="Um aluno está em uma turma — matricular é na ficha dele"
        actions={
          <Button
            variant="contained"
            size="small"
            onClick={() => setDialog({ open: true, turma: null })}
          >
            Nova turma
          </Button>
        }
      />

      <ContentBody>
        {error && <Alert status="error">{error.message}</Alert>}

        {classes.length === 0 ? (
          <Empty icon="🏫">Nenhuma turma. Crie a primeira.</Empty>
        ) : (
          classes.map((turma) => {
            const members = membersOf(turma.id);

            return (
              <Box key={turma.id} sx={{ mb: 1.5 }}>
                <Card
                  title={turma.name}
                  sub={turma.description ?? "Sem descrição"}
                  action={
                    <Badge tone={members.length > 0 ? "accent" : "neutral"}>
                      {members.length === 1 ? "1 aluno" : `${members.length} alunos`}
                    </Badge>
                  }
                >
                  <Box
                    data-testid="class-row"
                    data-class-id={turma.id}
                    data-students={members.length}
                    sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {members.length === 0 ? (
                        <Typography variant="caption">
                          Vazia. Matricule pela ficha do aluno.
                        </Typography>
                      ) : (
                        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                          {members.map((student) => (
                            <Box
                              key={student.studentId}
                              data-testid="class-member"
                              data-student-id={student.studentId}
                              sx={(theme) => ({
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                px: 1,
                                py: 0.25,
                                borderRadius: `${theme.brand.radius.pill}px`,
                                border: `1px solid ${theme.vars.palette.surface.border}`,
                              })}
                            >
                              <Typography
                                component={RouterLink}
                                to={ROUTES.teacher.student(student.studentId)}
                                variant="caption"
                                sx={{ color: "inherit" }}
                              >
                                {student.name ?? "Sem nome"}
                              </Typography>
                              <Button
                                size="small"
                                variant="text"
                                data-testid="member-remove"
                                aria-label={`Tirar ${student.name ?? "aluno"} da turma`}
                                onClick={() =>
                                  void run(() => api.unenrollStudent(student.studentId))
                                }
                                sx={{ minWidth: 0, px: 0.5 }}
                              >
                                ×
                              </Button>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>

                    <Button
                      size="small"
                      variant="text"
                      data-testid="class-rename"
                      onClick={() => setDialog({ open: true, turma })}
                    >
                      Editar
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      color="error"
                      data-testid="class-delete"
                      onClick={() => void run(() => api.deleteClass(turma.id, newRequestId()))}
                    >
                      Apagar
                    </Button>
                  </Box>
                </Card>
              </Box>
            );
          })
        )}
      </ContentBody>

      <ClassDialog
        turma={dialog.turma}
        open={dialog.open}
        error={error}
        onClose={() => setDialog({ open: false, turma: null })}
        onSubmit={submit}
      />
    </>
  );
}
