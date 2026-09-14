import ExpandMoreIcon from "@mui/icons-material/ExpandMoreOutlined";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Empty, PageHeader } from "@bora/ui";
import { useLoaderData } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type Subject, type SubjectBlock } from "@/lib/api";
import { loadActivePlanOrNull } from "@/lib/api/supabase/plan.ts";
import { requireStudentAccess } from "@/lib/auth/session";

/**
 * Disciplinas e blocos — o `p-disciplinas` da v2, SÓ LEITURA do lado do aluno.
 *
 * A v2 abria cada disciplina num `<details>`. Aqui é `Accordion`, que é a mesma
 * coisa com o estado anunciado: `aria-expanded` no cabeçalho e a região
 * associada por id, coisas que o `<details>` da v2 dava de graça e que a
 * marcação com `onclick` dela tinha perdido.
 */
export async function subjectsLoader() {
  await requireStudentAccess();

  const plan = await loadActivePlanOrNull();
  if (!plan) return { subjects: [] as readonly Subject[], hasPlan: false };

  return { subjects: await api.loadSubjects(plan.id), hasPlan: true };
}

type LoaderData = Awaited<ReturnType<typeof subjectsLoader>>;

function ItemList({ items, empty }: { items: readonly SubjectBlock[]; empty: string }) {
  if (items.length === 0) {
    return (
      <Typography variant="caption" component="p">
        {empty}
      </Typography>
    );
  }

  return (
    <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
      {items.map((item, index) => (
        <Box
          component="li"
          key={item.id}
          data-testid="subject-item"
          sx={(theme) => ({
            display: "flex",
            alignItems: "center",
            gap: 1,
            py: 1,
            borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
            "&:last-of-type": { borderBottom: "none" },
          })}
        >
          <Box
            aria-hidden="true"
            sx={(theme) => ({
              flexShrink: 0,
              width: 22,
              height: 22,
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              border: `1px solid ${theme.vars.palette.surface.border}`,
              backgroundColor: theme.vars.palette.surface.sunken,
              ...theme.typography.numeric,
              fontSize: "0.625rem",
            })}
          >
            {index + 1}
          </Box>
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>{item.name}</Typography>
          {item.link && (
            // `rel="noreferrer"` junto do `noopener`: o caderno mora no TEC, e
            // o site de terceiro não precisa saber de onde a pessoa veio.
            <Link href={item.link} target="_blank" rel="noopener noreferrer" fontSize="0.75rem">
              Abrir
            </Link>
          )}
        </Box>
      ))}
    </Box>
  );
}

export function Subjects() {
  const { subjects, hasPlan } = useLoaderData() as LoaderData;

  return (
    <>
      <PageHeader
        title="Disciplinas"
        description="O que seu professor cadastrou, e em que ordem estudar"
      />

      <ContentBody>
        {!hasPlan && (
          <Alert status="info">
            Nenhum planejamento ativo. Aguarde seu professor montar e ativar um.
          </Alert>
        )}

        {hasPlan && subjects.length === 0 && (
          <Empty icon="📚">Seu professor ainda não cadastrou disciplinas.</Empty>
        )}

        {subjects.map((subject) => (
          <Accordion
            key={subject.id}
            data-testid="subject-card"
            data-subject={subject.name}
            disableGutters
            sx={(theme) => ({
              mb: 1.5,
              border: `1px solid ${theme.vars.palette.surface.border}`,
              borderRadius: `${theme.brand.radius.lg}px`,
              backgroundColor: theme.vars.palette.surface.raised,
              "&::before": { display: "none" },
            })}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2, py: 0.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.75, minWidth: 0, flex: 1 }}>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 3,
                    alignSelf: "stretch",
                    minHeight: 36,
                    borderRadius: 2,
                    backgroundColor: subject.color,
                  }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="h2" sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {subject.name}
                  </Typography>
                  <Typography variant="caption" component="p">
                    {subject.blocks.length} {subject.blocks.length === 1 ? "bloco" : "blocos"} ·{" "}
                    {subject.lessons.length} {subject.lessons.length === 1 ? "aula" : "aulas"}
                  </Typography>
                </Box>
                <Box sx={{ ml: "auto", mr: 1.5 }}>
                  <Badge tone="neutral">{subject.targetScore}%</Badge>
                </Box>
              </Box>
            </AccordionSummary>

            <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
              <Typography variant="overline" component="h3" sx={{ display: "block", mb: 0.5 }}>
                Blocos de questões
              </Typography>
              <ItemList items={subject.blocks} empty="Nenhum bloco cadastrado." />

              <Typography variant="overline" component="h3" sx={{ display: "block", mt: 2, mb: 0.5 }}>
                Aulas
              </Typography>
              <ItemList items={subject.lessons} empty="Nenhuma aula cadastrada." />
            </AccordionDetails>
          </Accordion>
        ))}
      </ContentBody>
    </>
  );
}
