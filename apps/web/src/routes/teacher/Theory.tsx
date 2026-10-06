import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Field, Metric, PageHeader } from "@bora/ui";
import { useRef, useState } from "react";
import { Link as RouterLink, useLoaderData, useRevalidator, useSearchParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import {
  api,
  newRequestId,
  type ApiError,
  type FlashcardCard,
  type ImportMasterResult,
  type LessonMaterialBlock,
  type TheoryLesson,
  type TheorySubjectRule,
} from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { PMPR_SOLDADO_2025 } from "@/lib/domain/pmpr-soldado";
import { ROUTES } from "@/lib/routes";

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
  await requireRole("teacher", request);

  const catalogs = await api.listCatalogs();
  const catalogId = new URL(request.url).searchParams.get("catalogo") ?? catalogs[0]?.id ?? null;

  if (!catalogId) {
    return { catalogs, catalogId: null, lessons: [], rules: [], plans: [], classes: [] };
  }

  const [lessons, rules, plans, classes] = await Promise.all([
    api.loadCatalogLessons(catalogId),
    api.loadSubjectRules(catalogId),
    api.listPlans(),
    api.listClasses(),
  ]);

  return { catalogs, catalogId, lessons, rules, plans, classes };
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
            label="Meta de questões por aula"
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
  onSave: (lesson: TheoryLesson) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<LessonMaterialBlock[]>(() => lesson.materialBlocks.length > 0
    ? [...lesson.materialBlocks]
    : (lesson.resources.pdf || lesson.resources.tecQuestions || lesson.resources.qcQuestions)
      ? [{ title: lesson.title, pdf: lesson.resources.pdf, tecQuestions: lesson.resources.tecQuestions, qcQuestions: lesson.resources.qcQuestions }]
      : []);
  const [cards, setCards] = useState<FlashcardCard[]>(() => [...(lesson.flashcardCards ?? [])]);
  const updateBlock = (index: number, field: keyof LessonMaterialBlock, value: string) => {
    setBlocks((current) => current.map((block, i) => i === index ? { ...block, [field]: field === "title" ? value : value || null } : block));
  };
  const updateCard = (index: number, field: "topic" | "front" | "back", value: string) => {
    setCards((current) => current.map((card, i) => i === index ? { ...card, [field]: value } : card));
  };

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
        <Badge tone={lesson.published ? "success" : "neutral"}>
          {lesson.published ? "Disponível para alunos" : "Rascunho"}
        </Badge>
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }} noWrap>
          {lesson.title}
        </Typography>
        {lesson.hasTheory && lesson.theoryEndPage !== null ? (
          <Badge tone="neutral">
            {lesson.theoryStartPage}–{lesson.theoryEndPage}
          </Badge>
        ) : (
          // SEM PÁGINA AUDITADA É AVISO, não silêncio: é o que o aluno vai ver
          // sem o controle de leitura por página, mantendo os materiais.
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
            const link = (name: string) => String(data.get(name) ?? "").trim() || null;
            void onSave({
              ...lesson,
              title: String(data.get("title") ?? lesson.title),
              position: Number(data.get("position") ?? lesson.position),
              theoryStartPage: number("theoryStartPage"),
              theoryEndPage: number("theoryEndPage"),
              pdfTotalPages: number("pdfTotalPages"),
              hasTheory: number("theoryEndPage") !== null,
              published: data.get("published") === "on",
              resources: {
                pdf: null,
                flashcards: link("flashcardsUrl"),
                flashSummary: link("flashSummaryUrl"),
                tecQuestions: null,
                qcQuestions: null,
              },
              materialBlocks: blocks.map((block) => ({ ...block, title: block.title.trim() })),
              flashcardCards: cards.map((card) => ({ ...card, topic: card.topic.trim(), front: card.front.trim(), back: card.back.trim() })),
            }).then((saved) => {
              if (saved) setOpen(false);
            });
          }}
        >
          <Field label="Título" name="title" defaultValue={lesson.title} />
          <FormControlLabel
            control={<Switch name="published" defaultChecked={lesson.published} />}
            label="Disponibilizar esta aula aos alunos"
          />
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
          <Box sx={{ flexBasis: "100%" }}>
            <Typography variant="body2" component="p" sx={{ fontWeight: 600, mb: 1 }}>
              Blocos de materiais desta aula
            </Typography>
            <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>
              Cada bloco liga um tópico ao PDF e aos cadernos corretos. Use links permanentes, sem tokens de acesso.
            </Typography>
            <Box sx={{ display: "grid", gap: 1.25, mb: 1.25 }}>
              {blocks.map((block, index) => (
                <Box key={index} data-testid="teacher-material-block" sx={(theme) => ({ p: 1.5, border: `1px solid ${theme.vars.palette.surface.borderStrong}`, borderRadius: `${theme.brand.radius.md}px` })}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Bloco {String(index + 1).padStart(2, "0")}</Typography>
                    <Button type="button" size="small" variant="text" onClick={() => setBlocks((current) => current.filter((_, i) => i !== index))}>Remover</Button>
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1 }}>
                    <Field label="Tópico" name={`blockTitle-${index}`} value={block.title} onChange={(event) => updateBlock(index, "title", event.target.value)} />
                    <Field label="PDF do tópico" name={`blockPdf-${index}`} value={block.pdf ?? ""} onChange={(event) => updateBlock(index, "pdf", event.target.value)} />
                    <Field label="Caderno TEC" name={`blockTec-${index}`} value={block.tecQuestions ?? ""} onChange={(event) => updateBlock(index, "tecQuestions", event.target.value)} />
                    <Field label="Caderno QConcursos" name={`blockQc-${index}`} value={block.qcQuestions ?? ""} onChange={(event) => updateBlock(index, "qcQuestions", event.target.value)} />
                  </Box>
                </Box>
              ))}
            </Box>
            <Button type="button" size="small" variant="outlined" disabled={blocks.length >= 30} onClick={() => setBlocks((current) => [...current, { title: "", pdf: null, tecQuestions: null, qcQuestions: null }])}>
              Adicionar bloco
            </Button>
          </Box>
          <Box sx={{ flexBasis: "100%" }}>
            <Typography variant="body2" component="p" sx={{ fontWeight: 700, mb: 0.5 }}>
              Flashcards desta aula
            </Typography>
            <Typography variant="caption" component="p" sx={{ mb: 1.25 }}>
              Cadastre a afirmação ou pergunta na frente e a explicação na resposta. Os cartões serão revisados dentro da plataforma.
            </Typography>
            <Box sx={{ display: "grid", gap: 1, mb: 1 }}>
              {cards.map((card, index) => (
                <Box key={card.id} data-testid="teacher-flashcard" sx={(theme) => ({ p: 1.5, border: `1px solid ${theme.vars.palette.surface.borderStrong}`, borderRadius: `${theme.brand.radius.md}px`, backgroundColor: theme.vars.palette.surface.sunken })}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Cartão {index + 1}</Typography>
                    <Button size="small" onClick={() => setCards((current) => current.filter((item) => item.id !== card.id))}>Remover</Button>
                  </Box>
                  <Box sx={{ display: "grid", gap: 1 }}>
                    <TextField size="small" label="Tópico" value={card.topic} onChange={(event) => updateCard(index, "topic", event.target.value)} inputProps={{ maxLength: 160 }} />
                    <TextField size="small" label="Frente · pergunta ou afirmação" multiline minRows={2} value={card.front} onChange={(event) => updateCard(index, "front", event.target.value)} inputProps={{ maxLength: 2000 }} />
                    <TextField size="small" label="Resposta e explicação" multiline minRows={3} value={card.back} onChange={(event) => updateCard(index, "back", event.target.value)} inputProps={{ maxLength: 4000 }} />
                  </Box>
                </Box>
              ))}
            </Box>
            <Button type="button" size="small" variant="outlined" disabled={cards.length >= 200} onClick={() => setCards((current) => [...current, { id: crypto.randomUUID(), topic: "", front: "", back: "" }])}>
              Adicionar flashcard
            </Button>
          </Box>
          <Box sx={{ flexBasis: "100%" }}>
            <Typography variant="body2" component="p" sx={{ fontWeight: 600, mb: 1 }}>
              Outros materiais de apoio
            </Typography>
            <Box sx={(theme) => ({
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 1.25,
              [theme.breakpoints.down("md")]: { gridTemplateColumns: "1fr" },
            })}>
              <Field label="Link externo de flashcards (opcional)" name="flashcardsUrl" type="url" defaultValue={lesson.resources.flashcards ?? ""} />
              <Field label="Resumo flash" name="flashSummaryUrl" type="url" defaultValue={lesson.resources.flashSummary ?? ""} />
            </Box>
          </Box>
          <Button type="submit" size="small" variant="contained" sx={{ mb: 2.5 }}>
            Salvar aula
          </Button>
        </Box>
      )}
    </Box>
  );
}

export function TeacherTheory() {
  const { catalogs, catalogId, lessons, rules, plans, classes } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();
  const [params, setParams] = useSearchParams();

  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [imported, setImported] = useState<ImportMasterResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pmprCatalog = catalogs.find((catalog) => catalog.key === PMPR_SOLDADO_2025.key);
  const isPmprCatalog = pmprCatalog?.id === catalogId;
  const eligiblePlans = isPmprCatalog
    ? plans.filter((plan) => plan.targetExam?.toLocaleUpperCase("pt-BR").includes("PMPR"))
    : plans;

  async function createPmprCatalog() {
    setBusy(true);
    try {
      const result = await api.ensurePmprPilotCatalog(newRequestId());
      if (!result.ok) {
        setError(result.error);
      } else {
        setError(null);
        setNotice("Catálogo Soldado PMPR criado com as nove matérias do edital.");
        setParams((current) => {
          const next = new URLSearchParams(current);
          next.set("catalogo", result.data);
          return next;
        });
        await revalidate();
      }
    } catch {
      setError({ code: "unknown", message: "Não foi possível criar o catálogo agora." });
    }
    setBusy(false);
  }

  async function run(action: () => Promise<{ ok: boolean; error?: ApiError }>, message?: string): Promise<boolean> {
    const result = await action();
    if (!result.ok && result.error) {
      setError(result.error);
      return false;
    }
    setError(null);
    if (message) setNotice(message);
    await revalidate();
    return true;
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            {!pmprCatalog && (
              <Button variant="contained" size="small" disabled={busy} onClick={() => void createPmprCatalog()}>
                Criar catálogo Soldado PMPR
              </Button>
            )}
            {catalogs.length > 0 && (
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
                  {catalog.name} · {catalog.lessonCount} {catalog.lessonCount === 1 ? "aula" : "aulas"}
                </MenuItem>
              ))}
            </TextField>
            )}
          </Box>
        }
      />

      <ContentBody>
        {error && <Alert status="error">{error.message}</Alert>}
        {notice && <Alert status="success">{notice}</Alert>}

        {catalogs.length === 0 ? (
          <Empty icon="📚">
            Nenhum catálogo ainda. Comece pelo catálogo Soldado PMPR para preparar as aulas
            presenciais e os materiais de apoio.
          </Empty>
        ) : (
          <>
            {isPmprCatalog && (
              <Box sx={{ mb: 1.75 }}>
                <Card
                  title="Nova aula presencial"
                  sub="Crie o rascunho agora; anexe os materiais e publique quando o professor liberar a aula"
                >
                  <Box
                    component="form"
                    data-testid="pmpr-draft-lesson-form"
                    sx={{ display: "flex", alignItems: "flex-end", gap: 1.25, flexWrap: "wrap" }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const data = new FormData(form);
                      const subject = String(data.get("subject") ?? "");
                      const title = String(data.get("title") ?? "");
                      if (catalogId) {
                        void run(
                          () => api.createDraftLesson(catalogId, subject, title, newRequestId()),
                          "Aula criada em rascunho.",
                        ).then((saved) => { if (saved) form.reset(); });
                      }
                    }}
                  >
                    <TextField select name="subject" label="Matéria" size="small" defaultValue={PMPR_SOLDADO_2025.subjects[0].name} sx={{ minWidth: 230 }}>
                      {PMPR_SOLDADO_2025.subjects.map((subject) => (
                        <MenuItem key={subject.name} value={subject.name}>{subject.name}</MenuItem>
                      ))}
                    </TextField>
                    <TextField name="title" label="Tópico da aula" size="small" required inputProps={{ maxLength: 180 }} sx={{ flex: 1, minWidth: 260 }} />
                    <Button type="submit" variant="contained" size="small">Criar rascunho</Button>
                  </Box>
                </Card>
              </Box>
            )}

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
              <Metric label="Disciplinas" value={rules.length} />
              <Metric
                label="Sem páginas auditadas"
                value={lessons.filter((lesson) => !lesson.hasTheory).length}
                note="materiais e questões continuam disponíveis"
              />
            </Box>

            {!isPmprCatalog && <Card title="Importar MASTER" sub="O arquivo é lido aqui, e não vai para o bundle">
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
                      Sem páginas auditadas: {imported.subjectsWithoutPages.join(", ")}. Os materiais
                      e questões continuam disponíveis ao aluno quando a aula for publicada.
                    </Alert>
                  )}
                </Box>
              )}
            </Card>}

            {isPmprCatalog && (
              <Box sx={{ mt: 1.75 }}>
                <Card title="Disponibilizar para uma turma" sub="Aulas publicadas aparecem para alunos matriculados com planejamento ativo">
                  {classes.length === 0 ? (
                    <Alert status="info">
                      Crie uma turma em <RouterLink to={ROUTES.teacher.classes}>Turmas</RouterLink> para disponibilizar o catálogo aos alunos.
                    </Alert>
                  ) : (
                    <Box
                      component="form"
                      sx={{ display: "flex", gap: 1.5, alignItems: "flex-end", flexWrap: "wrap" }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const classId = String(new FormData(event.currentTarget).get("classId") ?? "");
                        if (classId) {
                          void run(
                            () => api.setClassTheoryCatalog(classId, catalogId),
                            "Catálogo vinculado à turma. As aulas publicadas estarão disponíveis para os alunos matriculados.",
                          );
                        }
                      }}
                    >
                      <TextField select name="classId" label="Turma" size="small" defaultValue="" sx={{ minWidth: 290 }}>
                        <MenuItem value="">Selecione uma turma</MenuItem>
                        {classes.map((turma) => (
                          <MenuItem key={turma.id} value={turma.id}>
                            {turma.name} · {turma.studentCount} alunos
                            {turma.theoryCatalogId === catalogId ? " · vinculada" : ""}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Button type="submit" variant="contained" size="small">Vincular à turma</Button>
                    </Box>
                  )}
                  {classes.some((turma) => turma.theoryCatalogId === catalogId) && (
                    <Typography variant="body2" sx={{ mt: 1.5 }}>
                      Turmas vinculadas: {classes.filter((turma) => turma.theoryCatalogId === catalogId).map((turma) => turma.name).join(", ")}.
                    </Typography>
                  )}
                </Card>
              </Box>
            )}

            <Box sx={{ mt: 1.75 }}>
              <Card title="Vincular a um planejamento" sub={isPmprCatalog ? "Para alunos que estudam fora da turma" : "Um catálogo por planejamento"}>
                {isPmprCatalog && eligiblePlans.length === 0 && (
                  <Alert status="info">
                    Alunos precisam de um planejamento ativo para acompanhar aulas e desempenho. Crie-o em{" "}
                    <RouterLink to={ROUTES.teacher.plans}>Planejamentos</RouterLink>.
                  </Alert>
                )}
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
                    defaultValue={eligiblePlans[0]?.id ?? ""}
                    slotProps={{ select: { inputProps: { "data-testid": "link-plan" } } }}
                    sx={{ minWidth: 260 }}
                  >
                    {eligiblePlans.map((plan) => (
                      <MenuItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button type="submit" variant="contained" size="small" disabled={eligiblePlans.length === 0}>
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
                key={`${catalogId}:${rule.subjectKey}`}
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
                        run(
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
