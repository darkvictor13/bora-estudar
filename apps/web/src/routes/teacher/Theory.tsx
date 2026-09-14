import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Field, Metric, PageHeader } from "@bora/ui";
import { useRef, useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import {
  api,
  newRequestId,
  type ApiError,
  type ImportMasterResult,
  type TheoryLesson,
  type TheorySubjectRule,
} from "@/lib/api";
import { requireRole } from "@/lib/auth/session";

/**
 * Catálogo de teoria — o `p-disciplinas` do professor.
 *
 * Três coisas numa tela: importar o MASTER, conferir ordem e páginas de cada
 * aula, e configurar as regras por disciplina — questões iniciais e de zero a
 * cinco revisões.
 *
 * O MASTER NÃO ENTRA NO BUNDLE. São 1,9 MB de JSON; ele chega pelo
 * `<input type="file">` e é lido no navegador. Importá-lo do site faria todo
 * aluno baixar o catálogo inteiro para abrir a tela de metas.
 */
export async function teacherTheoryLoader({ request }: { request: Request }) {
  await requireRole("teacher");

  const catalogs = await api.listCatalogs();
  const catalogId = new URL(request.url).searchParams.get("catalogo") ?? catalogs[0]?.id ?? null;

  if (!catalogId) {
    return { catalogs, catalogId: null, lessons: [], rules: [], plans: [] };
  }

  const [lessons, rules, plans] = await Promise.all([
    api.loadCatalogLessons(catalogId),
    api.loadSubjectRules(catalogId),
    api.listPlans(),
  ]);

  return { catalogs, catalogId, lessons, rules, plans };
}

type LoaderData = Awaited<ReturnType<typeof teacherTheoryLoader>>;

function SubjectRuleCard({
  rule,
  onSave,
}: {
  rule: TheorySubjectRule;
  onSave: (rule: TheorySubjectRule) => void;
}) {
  const [reviews, setReviews] = useState(rule.reviews);

  return (
    <Box sx={{ mb: 1.5 }}>
      <Card
        title={rule.subject}
        sub={`${reviews.length} de 5 revisões configuradas`}
        action={<Badge tone="neutral">{rule.subjectKey}</Badge>}
      >
        <Box
          component="form"
          noValidate
          data-testid="subject-rule-form"
          data-subject={rule.subjectKey}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            onSave({
              ...rule,
              initialQuestions: Number(data.get("initialQuestions") ?? 15),
              reviews: reviews.map((review, index) => ({
                reviewNumber: index + 1,
                lessonSpacing: Number(data.get(`spacing-${index}`) ?? review.lessonSpacing),
                minimumQuestions: Number(data.get(`minimum-${index}`) ?? review.minimumQuestions),
                active: true,
              })),
            });
          }}
        >
          <Field
            label="Questões iniciais para liberar a próxima aula"
            name="initialQuestions"
            type="number"
            min={1}
            max={200}
            defaultValue={rule.initialQuestions}
          />

          {reviews.map((review, index) => (
            <Box
              key={review.reviewNumber}
              data-testid="review-rule"
              sx={{ display: "flex", gap: 1.5, alignItems: "flex-end", flexWrap: "wrap" }}
            >
              <Typography variant="numeric" sx={{ mb: 2.5, minWidth: 28 }}>
                {index + 1}ª
              </Typography>
              <Field
                label="A cada N aulas"
                name={`spacing-${index}`}
                type="number"
                min={1}
                max={200}
                defaultValue={review.lessonSpacing}
              />
              <Field
                label="Mínimo de questões"
                name={`minimum-${index}`}
                type="number"
                min={1}
                max={200}
                defaultValue={review.minimumQuestions}
              />
              <Button
                type="button"
                size="small"
                variant="text"
                sx={{ mb: 2.5 }}
                onClick={() => setReviews(reviews.filter((_, i) => i !== index))}
              >
                Remover
              </Button>
            </Box>
          ))}

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              type="button"
              size="small"
              variant="outlined"
              // ZERO A CINCO. O teto é da v108; acima dele a fila de revisão
              // cresce mais rápido do que o aluno consegue vencer.
              disabled={reviews.length >= 5}
              onClick={() =>
                setReviews([
                  ...reviews,
                  {
                    reviewNumber: reviews.length + 1,
                    lessonSpacing: (reviews.length + 1) * 2,
                    minimumQuestions: 15,
                    active: true,
                  },
                ])
              }
            >
              Acrescentar revisão
            </Button>
            <Button type="submit" size="small" variant="contained">
              Salvar regras
            </Button>
          </Box>
        </Box>
      </Card>
    </Box>
  );
}

function LessonRow({
  lesson,
  onSave,
}: {
  lesson: TheoryLesson;
  onSave: (lesson: TheoryLesson) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Box
      data-testid="lesson-row"
      data-lesson-id={lesson.id}
      data-has-theory={lesson.hasTheory}
      sx={(theme) => ({
        py: 1.125,
        borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
        "&:last-of-type": { borderBottom: "none" },
      })}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Badge tone="neutral">{lesson.lessonCode}</Badge>
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }} noWrap>
          {lesson.title}
        </Typography>
        {lesson.hasTheory && lesson.theoryEndPage !== null ? (
          <Badge tone="neutral">
            {lesson.theoryStartPage}–{lesson.theoryEndPage}
          </Badge>
        ) : (
          // SEM PÁGINA AUDITADA É AVISO, não silêncio: é o que o aluno vai ver
          // como diagnóstico no lugar do controle por página.
          <Badge tone="warning">sem páginas</Badge>
        )}
        <Button size="small" variant="text" onClick={() => setOpen(!open)}>
          {open ? "Fechar" : "Editar"}
        </Button>
      </Box>

      {open && (
        <Box
          component="form"
          noValidate
          sx={{ mt: 1, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-end" }}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const number = (name: string) => {
              const raw = String(data.get(name) ?? "").trim();
              return raw === "" ? null : Number(raw);
            };
            onSave({
              ...lesson,
              title: String(data.get("title") ?? lesson.title),
              position: Number(data.get("position") ?? lesson.position),
              theoryStartPage: number("theoryStartPage"),
              theoryEndPage: number("theoryEndPage"),
              pdfTotalPages: number("pdfTotalPages"),
              hasTheory: number("theoryEndPage") !== null,
            });
            setOpen(false);
          }}
        >
          <Field label="Título" name="title" defaultValue={lesson.title} />
          <Field label="Ordem" name="position" type="number" min={1} defaultValue={lesson.position} />
          <Field
            label="Início da teoria"
            name="theoryStartPage"
            type="number"
            min={1}
            defaultValue={lesson.theoryStartPage ?? ""}
          />
          <Field
            label="Fim da teoria"
            name="theoryEndPage"
            type="number"
            min={1}
            defaultValue={lesson.theoryEndPage ?? ""}
          />
          <Field
            label="Total de páginas"
            name="pdfTotalPages"
            type="number"
            min={1}
            defaultValue={lesson.pdfTotalPages ?? ""}
          />
          <Button type="submit" size="small" variant="contained" sx={{ mb: 2.5 }}>
            Salvar aula
          </Button>
        </Box>
      )}
    </Box>
  );
}

export function TeacherTheory() {
  const { catalogs, catalogId, lessons, rules, plans } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();
  const [params, setParams] = useSearchParams();

  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [imported, setImported] = useState<ImportMasterResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: ApiError }>, message?: string) {
    const result = await action();
    if (!result.ok && result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    if (message) setNotice(message);
    await revalidate();
  }

  async function importFile(file: File) {
    if (!catalogId) return;
    setImported(null);
    try {
      const master: unknown = JSON.parse(await file.text());
      const result = await api.importMaster({ catalogId, requestId: newRequestId(), master });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setImported(result.data);
      await revalidate();
    } catch {
      setError({ code: "validation", message: "O arquivo não é um JSON válido." });
    }
  }

  const bySubject = new Map<string, TheoryLesson[]>();
  for (const lesson of lessons) {
    const list = bySubject.get(lesson.subject) ?? [];
    list.push(lesson);
    bySubject.set(lesson.subject, list);
  }

  return (
    <>
      <PageHeader
        title="Catálogo de teoria"
        description="Aulas, páginas auditadas e as regras de cada disciplina"
        actions={
          catalogs.length > 0 ? (
            <TextField
              select
              size="small"
              label="Catálogo"
              value={catalogId ?? ""}
              slotProps={{ select: { inputProps: { "data-testid": "catalog-select" } } }}
              onChange={(event) => {
                params.set("catalogo", event.target.value);
                setParams(params);
              }}
              sx={{ minWidth: 260 }}
            >
              {catalogs.map((catalog) => (
                <MenuItem key={catalog.id} value={catalog.id}>
                  {catalog.name} · {catalog.lessonCount} aulas
                </MenuItem>
              ))}
            </TextField>
          ) : undefined
        }
      />

      <ContentBody>
        {error && <Alert status="error">{error.message}</Alert>}
        {notice && <Alert status="success">{notice}</Alert>}

        {catalogs.length === 0 ? (
          <Empty icon="📚">
            Nenhum catálogo de teoria. Ele é criado junto com a carga do MASTER, por script de
            seed ou por quem administra o banco.
          </Empty>
        ) : (
          <>
            <Box
              sx={(theme) => ({
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 1.25,
                mb: 1.75,
                [theme.breakpoints.down("lg")]: { gridTemplateColumns: "1fr" },
              })}
            >
              <Metric label="Aulas" value={lessons.length} />
              <Metric label="Disciplinas" value={bySubject.size} />
              <Metric
                label="Sem páginas auditadas"
                value={lessons.filter((lesson) => !lesson.hasTheory).length}
                note="mostram diagnóstico ao aluno"
              />
            </Box>

            <Card title="Importar MASTER" sub="O arquivo é lido aqui, e não vai para o bundle">
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                data-testid="master-input"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
              <Button variant="outlined" size="small" onClick={() => fileInput.current?.click()}>
                Escolher arquivo JSON
              </Button>

              {imported && (
                <Box sx={{ mt: 1.5 }} data-testid="import-result">
                  <Alert status="success">
                    {imported.lessonsCreated} aulas criadas, {imported.lessonsUpdated} atualizadas.
                  </Alert>
                  {imported.subjectsWithoutPages.length > 0 && (
                    // RELATADO, não escondido: é o que faz o professor saber
                    // quais disciplinas ficaram fora da auditoria antes de o
                    // aluno descobrir sozinho.
                    <Alert status="warning">
                      Sem páginas auditadas: {imported.subjectsWithoutPages.join(", ")}. O aluno vê
                      o diagnóstico no lugar do controle por página.
                    </Alert>
                  )}
                </Box>
              )}
            </Card>

            <Box sx={{ mt: 1.75 }}>
              <Card title="Vincular a um planejamento" sub="Um catálogo por planejamento">
                <Box
                  component="form"
                  noValidate
                  sx={{ display: "flex", gap: 1.5, alignItems: "flex-end", flexWrap: "wrap" }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const planId = String(new FormData(event.currentTarget).get("planId") ?? "");
                    if (planId && catalogId) {
                      void run(
                        () => api.linkCatalogToPlan(planId, catalogId, newRequestId()),
                        "Catálogo vinculado ao planejamento.",
                      );
                    }
                  }}
                >
                  <TextField
                    select
                    name="planId"
                    size="small"
                    label="Planejamento"
                    defaultValue={plans[0]?.id ?? ""}
                    slotProps={{ select: { inputProps: { "data-testid": "link-plan" } } }}
                    sx={{ minWidth: 260 }}
                  >
                    {plans.map((plan) => (
                      <MenuItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button type="submit" variant="contained" size="small" disabled={plans.length === 0}>
                    Vincular
                  </Button>
                </Box>
              </Card>
            </Box>

            <Typography variant="overline" component="h2" sx={{ display: "block", mt: 2.5, mb: 1 }}>
              Regras por disciplina
            </Typography>
            {rules.map((rule) => (
              <SubjectRuleCard
                key={rule.subjectKey}
                rule={rule}
                onSave={(updated) =>
                  void run(
                    () => api.saveSubjectRule(catalogId!, updated, newRequestId()),
                    `Regras de ${updated.subject} salvas.`,
                  )
                }
              />
            ))}

            <Typography variant="overline" component="h2" sx={{ display: "block", mt: 2.5, mb: 1 }}>
              Aulas
            </Typography>
            {[...bySubject.entries()].map(([subject, list]) => (
              <Box key={subject} sx={{ mb: 1.5 }}>
                <Card title={subject} action={<Badge tone="neutral">{list.length}</Badge>}>
                  {list.map((lesson) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      onSave={(updated) =>
                        void run(
                          () => api.saveLesson(updated, newRequestId()),
                          `Aula ${updated.lessonCode} salva.`,
                        )
                      }
                    />
                  ))}
                </Card>
              </Box>
            ))}
          </>
        )}
      </ContentBody>
    </>
  );
}
