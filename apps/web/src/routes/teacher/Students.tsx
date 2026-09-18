import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Badge, Card, Empty, Metric, PageHeader, type BadgeTone } from "@bora/ui";
import { Link as RouterLink, useLoaderData, useSearchParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { FindStudentForm } from "@/components/teacher/FindStudentForm";
import { api, type StudentCard, type StudentPace } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import { formatMinutes } from "@/lib/domain/week";

/**
 * Meus alunos — o `p-meusAlunos` da v2.
 *
 * A LISTA ABRE PELOS ATRASADOS, e não em ordem alfabética. Ela existe para o
 * professor achar quem precisa dele; o alfabeto esconde isso atrás de uma
 * ordem que não diz nada.
 *
 * Os filtros moram na URL pelo mesmo motivo do seletor de semana: o endereço
 * fica compartilhável, o botão voltar funciona, e recarregar não perde o
 * recorte que o professor acabou de montar.
 *
 * É TAMBÉM ONDE UM ALUNO VIRA ALUNO. O perfil nasce sem professor, e sem a
 * caixa de "Assumir" esta lista ficaria vazia para sempre — era o estado do
 * produto até 18/09/2026.
 */
export async function teacherStudentsLoader({ request }: { request: Request }) {
  await requireRole("teacher");

  const params = new URL(request.url).searchParams;
  const search = params.get("busca") ?? "";
  const pace = params.get("ritmo") as StudentPace | null;
  const asked = params.get("turma") ?? "";

  // AS TURMAS VÊM PRIMEIRO, e as duas leituras não correm em paralelo de
  // propósito: `?turma=` de um valor que não é turma deste professor é
  // IGNORADO, e a lista volta inteira (R-TURMA-10). Sem saber quais turmas
  // existem, um id inventado recortaria a lista até o vazio e a tela diria
  // "nenhum aluno com esse recorte" — a query string viraria uma porta.
  const classes = await api.listClasses();
  const classId = classes.some((turma) => turma.id === asked) ? asked : "";

  const students = await api.listStudents({
    ...(search ? { search } : {}),
    ...(pace ? { pace } : {}),
    ...(classId ? { classId } : {}),
  });

  return { students, classes, search, pace: pace ?? "", classId };
}

type LoaderData = Awaited<ReturnType<typeof teacherStudentsLoader>>;

const PACE: Record<StudentPace, { label: string; tone: BadgeTone }> = {
  on_track: { label: "Em ritmo", tone: "success" },
  attention: { label: "Atenção", tone: "warning" },
  behind: { label: "Atrasado", tone: "error" },
};

const ACCESS: Record<StudentCard["access"], { label: string; tone: BadgeTone }> = {
  active: { label: "Liberado", tone: "success" },
  pending: { label: "Aguardando", tone: "warning" },
  suspended: { label: "Suspenso", tone: "error" },
  expired: { label: "Vencido", tone: "error" },
};

function StudentTile({ student }: { student: StudentCard }) {
  return (
    <Box
      component={RouterLink}
      to={ROUTES.teacher.student(student.studentId)}
      data-testid="student-card"
      data-student-id={student.studentId}
      data-pace={student.pace}
      sx={(theme) => ({
        display: "block",
        p: 2,
        textDecoration: "none",
        color: "inherit",
        borderRadius: `${theme.brand.radius.lg}px`,
        border: `1px solid ${theme.vars.palette.surface.border}`,
        backgroundColor: theme.vars.palette.surface.raised,
        transition: theme.transitions.create(["border-color", "transform"]),
        "&:hover": {
          borderColor: theme.vars.palette.surface.controlBorder,
          transform: "translateY(-1px)",
        },
        ...theme.applyStyles("light", { boxShadow: theme.vars.palette.elevation.sm }),
      })}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }} noWrap>
            {student.name ?? "Sem nome"}
          </Typography>
          <Typography variant="caption" component="p" noWrap>
            {student.planName ?? "Sem planejamento ativo"}
            {student.className ? ` · ${student.className}` : ""}
          </Typography>
        </Box>
        <Badge tone={PACE[student.pace].tone}>{PACE[student.pace].label}</Badge>
      </Box>

      <LinearProgress
        variant="determinate"
        value={student.progress}
        aria-label={`${student.progress}% das metas devidas concluídas`}
        sx={{ height: 6, borderRadius: 999, mb: 1.25 }}
      />

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        {(
          [
            ["Progresso", `${student.progress}%`],
            ["Desempenho", student.score === null ? "—" : `${student.score}%`],
            ["Questões", String(student.questionsAnswered)],
            ["Tempo", formatMinutes(student.studiedMinutes)],
          ] as const
        ).map(([label, value]) => (
          <Box key={label}>
            <Typography variant="metricLabel" component="p">
              {label}
            </Typography>
            <Typography variant="numeric" component="p">
              {value}
            </Typography>
          </Box>
        ))}
        <Box sx={{ ml: "auto" }}>
          <Badge tone={ACCESS[student.access].tone}>{ACCESS[student.access].label}</Badge>
        </Box>
      </Box>
    </Box>
  );
}

export function TeacherStudents() {
  const { students, classes, search, pace, classId } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();

  function setParam(key: string, value: string) {
    if (value) params.set(key, value);
    else params.delete(key);
    setParams(params);
  }

  const behind = students.filter((student) => student.pace === "behind").length;

  return (
    <>
      <PageHeader
        title="Meus alunos"
        description="Quem precisa de você aparece primeiro"
        actions={
          <>
            <TextField
              size="small"
              label="Buscar por nome"
              defaultValue={search}
              slotProps={{ htmlInput: { "data-testid": "student-search" } }}
              onChange={(event) => setParam("busca", event.target.value)}
              sx={{ minWidth: 220 }}
            />
            <TextField
              select
              size="small"
              label="Turma"
              value={classId}
              slotProps={{ select: { inputProps: { "data-testid": "class-filter" } } }}
              onChange={(event) => setParam("turma", event.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">Todas</MenuItem>
              {classes.map((turma) => (
                <MenuItem key={turma.id} value={turma.id}>
                  {turma.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Ritmo"
              value={pace}
              slotProps={{ select: { inputProps: { "data-testid": "pace-filter" } } }}
              onChange={(event) => setParam("ritmo", event.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="behind">Atrasado</MenuItem>
              <MenuItem value="attention">Atenção</MenuItem>
              <MenuItem value="on_track">Em ritmo</MenuItem>
            </TextField>
          </>
        }
      />

      <ContentBody>
        <Box
          sx={(theme) => ({
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1.25,
            mb: 1.75,
            [theme.breakpoints.down("lg")]: { gridTemplateColumns: "1fr" },
          })}
        >
          <Metric label="Alunos" value={students.length} />
          <Metric label="Atrasados" value={behind} />
          <Metric
            label="Sem planejamento"
            value={students.filter((student) => student.planName === null).length}
          />
        </Box>

        <Box sx={{ mb: 1.75 }}>
          <Card
            title="Assumir um aluno"
            sub="Pelo e-mail inteiro — não existe lista de candidatos"
          >
            <FindStudentForm />
          </Card>
        </Box>

        {students.length === 0 ? (
          <Empty icon="🧑‍🎓">
            {search || pace || classId
              ? "Nenhum aluno com esse recorte."
              : "Nenhum aluno vinculado a você ainda. Assuma o primeiro pelo e-mail."}
          </Empty>
        ) : (
          <Box
            sx={(theme) => ({
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 1.5,
              [theme.breakpoints.down("md")]: { gridTemplateColumns: "1fr" },
            })}
          >
            {students.map((student) => (
              <StudentTile key={student.studentId} student={student} />
            ))}
          </Box>
        )}
      </ContentBody>
    </>
  );
}
