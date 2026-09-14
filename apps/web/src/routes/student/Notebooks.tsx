import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, PageHeader } from "@bora/ui";
import { useLoaderData } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type Notebook } from "@/lib/api";
import { loadActivePlanOrNull } from "@/lib/api/supabase/plan.ts";
import { requireStudentAccess } from "@/lib/auth/session";

/**
 * Cadernos TEC — o `p-cadernos` da v2, do lado do aluno.
 *
 * SÓ LEITURA E UM LINK. A execução da bateria saiu com a extensão e ainda não
 * voltou; o que sobra é o que sempre funcionou sem ela — abrir o caderno no TEC
 * como página comum. Um botão "iniciar bateria" aqui abriria sessão sem ter
 * onde respondê-la, e sessão travada é pior do que botão ausente.
 *
 * Caderno DESATIVADO continua na lista, apagado: some da lista faria o aluno
 * procurar o que o professor tirou do ar de propósito.
 */
export async function studentNotebooksLoader() {
  await requireStudentAccess();

  const plan = await loadActivePlanOrNull();
  if (!plan) return { notebooks: [] as readonly Notebook[], hasPlan: false };

  const notebooks = await api.listNotebooks(plan.id);
  return { notebooks: notebooks.filter((notebook) => !notebook.deleted), hasPlan: true };
}

type LoaderData = Awaited<ReturnType<typeof studentNotebooksLoader>>;

export function StudentNotebooks() {
  const { notebooks, hasPlan } = useLoaderData() as LoaderData;

  const bySubject = new Map<string, Notebook[]>();
  for (const notebook of notebooks) {
    const list = bySubject.get(notebook.subjectName) ?? [];
    list.push(notebook);
    bySubject.set(notebook.subjectName, list);
  }

  return (
    <>
      <PageHeader title="Cadernos TEC" description="Os cadernos que seu professor montou" />

      <ContentBody>
        {!hasPlan && (
          <Alert status="info">
            Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.
          </Alert>
        )}

        {hasPlan && notebooks.length === 0 && (
          <Empty icon="📕">Seu professor ainda não montou cadernos neste planejamento.</Empty>
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
                  sx={(theme) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    py: 1.125,
                    opacity: notebook.active ? 1 : 0.55,
                    borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
                    "&:last-of-type": { borderBottom: "none" },
                  })}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 3,
                      alignSelf: "stretch",
                      minHeight: 30,
                      borderRadius: 2,
                      backgroundColor: notebook.subjectColor,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                      {notebook.notebookName}
                    </Typography>
                    <Typography variant="caption" component="p">
                      {notebook.totalQuestions} questões
                      {notebook.active ? "" : " · desativado pelo professor"}
                    </Typography>
                  </Box>
                  {notebook.active && notebook.notebookLink && (
                    <Button
                      size="small"
                      variant="outlined"
                      href={notebook.notebookLink}
                      target="_blank"
                      // `noreferrer` junto do `noopener`: o caderno mora no
                      // TEC, e o site de terceiro não precisa saber de onde a
                      // pessoa veio.
                      rel="noopener noreferrer"
                    >
                      Abrir no TEC
                    </Button>
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
