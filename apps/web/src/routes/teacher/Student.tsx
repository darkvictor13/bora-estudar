import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Metric, PageHeader, RankedBars, type BadgeTone } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useParams, useRevalidator } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { AccessForm } from "@/components/teacher/AccessForm";
import { api, type ApiError, type QuizSessionSummary, type StudentCard } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { formatMinutes } from "@/lib/domain/week";

/**
 * A ficha do aluno — era o `aluno-modal` da v2, agora é rota.
 *
 * Virar rota resolve de graça o que o modal não tinha: endereço para mandar a
 * alguém, botão voltar, e título de aba dizendo de quem é a ficha.
 *
 * LIBERAR, BLOQUEAR E ESCOLHER A TURMA moram aqui desde 18/09/2026. As duas
 * primeiras passam por `set_student_access`, porque `access_status` e
 * `access_expires_at` continuam fora do GRANT UPDATE de `profiles`; a terceira
 * é escrita direta em `class_students`, com RLS — e a diferença está explicada
 * em `lib/api/supabase/teacher-classes.ts`.
 *
 * UMA AÇÃO DA v2 CONTINUA DE FORA, e a ausência é do banco, não da tela: anular
 * bateria precisa nascer como RPC, porque `quiz_sessions` é SELECT e nada mais.
 * Um botão que sempre falha é pior do que botão nenhum; a tela diz o que falta.
 */
export async function teacherStudentLoader({ params }: { params: { studentId?: string } }) {
  await requireRole("teacher");

  const [file, classes] = await Promise.all([
    api.loadStudentFile(params.studentId!),
    api.listClasses(),
  ]);
  return { file, classes };
}

type LoaderData = Awaited<ReturnType<typeof teacherStudentLoader>>;

const ACCESS: Record<StudentCard["access"], { label: string; tone: BadgeTone }> = {
  active: { label: "Liberado", tone: "success" },
  pending: { label: "Aguardando", tone: "warning" },
  suspended: { label: "Suspenso", tone: "error" },
  expired: { label: "Vencido", tone: "error" },
};

const SESSION_STATUS: Record<QuizSessionSummary["status"], { label: string; tone: BadgeTone }> = {
  in_progress: { label: "Em andamento", tone: "accent" },
  awaiting_time: { label: "Aguardando tempo", tone: "warning" },
  completed: { label: "Concluída", tone: "success" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  voided: { label: "Anulada", tone: "neutral" },
};

function formatDateTime(value: string): string {
  return `${value.slice(8, 10)}/${value.slice(5, 7)} ${value.slice(11, 16)}`;
}

export function TeacherStudent() {
  const { file, classes } = useLoaderData() as LoaderData;
  const { studentId } = useParams();
  const { revalidate } = useRevalidator();
  const { card, plan, statistics, sessions } = file;

  const [classError, setClassError] = useState<ApiError | null>(null);
  const [classMessage, setClassMessage] = useState<string | null>(null);
  const [chosenClass, setChosenClass] = useState(card.classId ?? "");

  /**
   * Matricular e MOVER são operações diferentes, e a tela escolhe qual chamar
   * pelo que o aluno já tem.
   *
   * Mover é um `UPDATE` de `class_id`: em dois comandos — apagar e inserir — o
   * aluno fica fora de turma nenhuma no meio do caminho, e uma falha entre eles
   * o deixa lá.
   */
  async function saveClass() {
    const result = !chosenClass
      ? await api.unenrollStudent(card.studentId)
      : card.classId
        ? await api.moveStudent(chosenClass, card.studentId)
        : await api.enrollStudent(chosenClass, card.studentId);

    if (!result.ok) {
      setClassError(result.error);
      setClassMessage(null);
      return;
    }
    setClassError(null);
    setClassMessage(chosenClass ? "Turma salva." : "Aluno tirado da turma.");
    await revalidate();
  }

  return (
    <>
      <PageHeader
        title={card.name ?? "Aluno"}
        description={plan?.name ?? "Sem planejamento ativo"}
      />

      <ContentBody>
        <Box
          sx={(theme) => ({
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1.25,
            mb: 1.75,
            [theme.breakpoints.down("lg")]: { gridTemplateColumns: "repeat(2, 1fr)" },
          })}
        >
          <Metric label="Progresso" value={`${card.progress}%`} note="metas devidas até hoje" />
          <Metric
            label="Desempenho"
            value={statistics.score === null ? "—" : `${statistics.score}%`}
            note={`${statistics.correctAnswers}/${statistics.questionsAnswered} acertos`}
          />
          <Metric label="Tempo" value={formatMinutes(statistics.studiedMinutes)} />
          <Metric
            label="Última atividade"
            value={card.lastActivityAt ? formatDateTime(card.lastActivityAt) : "—"}
          />
        </Box>

        <Card
          title="Acesso"
          action={<Badge tone={ACCESS[card.access].tone}>{ACCESS[card.access].label}</Badge>}
          sub={card.accessExpiresAt ? `Válido até ${card.accessExpiresAt}` : "Sem prazo"}
        >
          <AccessForm card={card} />
        </Card>

        <Box sx={{ mt: 1.75 }} data-testid="class-form">
          <Card
            title="Turma"
            sub="Um aluno está em uma turma — quem impõe é o índice único do banco"
          >
            {classError && <Alert status="error">{classError.message}</Alert>}
            {classMessage && <Alert status="success">{classMessage}</Alert>}

            {classes.length === 0 ? (
              <Empty icon="🏫">Nenhuma turma criada ainda. Crie a primeira em “Turmas”.</Empty>
            ) : (
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <TextField
                  select
                  size="small"
                  label="Turma"
                  value={chosenClass}
                  slotProps={{ select: { inputProps: { "data-testid": "student-class" } } }}
                  // O aviso da gravação anterior SAI ao mudar a escolha: um
                  // "Turma salva." ao lado de um seletor que já aponta para
                  // outra turma diz o contrário do que aconteceu.
                  onChange={(event) => {
                    setChosenClass(event.target.value);
                    setClassMessage(null);
                    setClassError(null);
                  }}
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="">Sem turma</MenuItem>
                  {classes.map((turma) => (
                    <MenuItem key={turma.id} value={turma.id}>
                      {turma.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  size="small"
                  data-testid="save-class"
                  onClick={() => void saveClass()}
                >
                  Salvar turma
                </Button>
              </Box>
            )}
          </Card>
        </Box>

        {statistics.bySubject.length > 0 && (
          <Box sx={{ mt: 1.75 }}>
            <Card>
              <RankedBars
                testId="student-by-subject"
                title="Desempenho por disciplina"
                description="O traço é a meta da disciplina. Pior desempenho primeiro."
                rows={statistics.bySubject.map((subject) => ({
                  label: subject.subject,
                  value: subject.score,
                  target: subject.targetScore,
                  note: `${subject.correctAnswers}/${subject.questions}`,
                }))}
              />
            </Card>
          </Box>
        )}

        <Box sx={{ mt: 1.75 }}>
          <Card title="Histórico de baterias" sub="O que o motor registrou">
            {sessions.length === 0 ? (
              <Empty icon="📝">
                Nenhuma bateria. A execução de baterias saiu com a extensão e está sendo
                reescrita — sem ela não há sessão para registrar.
              </Empty>
            ) : (
              sessions.map((session) => (
                <Box
                  key={session.id}
                  data-testid="quiz-session-row"
                  data-status={session.status}
                  sx={(theme) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    flexWrap: "wrap",
                    py: 1.125,
                    borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
                    "&:last-of-type": { borderBottom: "none" },
                  })}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500 }} noWrap>
                      {session.blockName}
                    </Typography>
                    <Typography variant="caption" component="p">
                      {session.subject} · {formatDateTime(session.startedAt)}
                      {session.durationMinutes === null
                        ? ""
                        : ` · ${formatMinutes(session.durationMinutes)}`}
                    </Typography>
                  </Box>
                  <Badge tone="neutral">
                    {session.mainCorrect}/{session.mainTotal}
                  </Badge>
                  {session.score !== null && <Badge tone="neutral">{session.score}%</Badge>}
                  <Badge tone={SESSION_STATUS[session.status].tone}>
                    {SESSION_STATUS[session.status].label}
                  </Badge>
                </Box>
              ))
            )}
          </Card>
        </Box>

        <Box sx={{ mt: 1.75 }}>
          <Card title="Dificuldades por tópico">
            {/*
              O tópico de cada questão morava em `catalog_questions`, que não
              foi portada. Sem ela, cruzar o ledger com o tópico é impossível —
              e inventar um agrupamento por disciplina aqui daria ao professor
              um número que ele leria como "tópico".
            */}
            <Typography variant="body2" data-testid="topic-difficulties-empty">
              As dificuldades por tópico saem do ledger cruzado com o tópico de cada questão, e o
              catálogo de tópicos ainda não voltou ao schema. Elas reaparecem junto com o motor de
              baterias.
            </Typography>
          </Card>
        </Box>

        <Typography variant="caption" component="p" sx={{ mt: 2 }} data-student-id={studentId}>
          Ficha de {card.name ?? "aluno"}.
        </Typography>
      </ContentBody>
    </>
  );
}
