import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, Metric, PageHeader, RankedBars, type BadgeTone } from "@bora/ui";
import { useLoaderData, useParams } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type QuizSessionSummary, type StudentCard } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { formatMinutes } from "@/lib/domain/week";

/**
 * A ficha do aluno — era o `aluno-modal` da v2, agora é rota.
 *
 * Virar rota resolve de graça o que o modal não tinha: endereço para mandar a
 * alguém, botão voltar, e título de aba dizendo de quem é a ficha.
 *
 * DUAS AÇÕES DA v2 NÃO ESTÃO AQUI, e a ausência é do banco, não da tela:
 * liberar/bloquear acesso e anular bateria precisam nascer como RPC —
 * `access_status` fica fora do GRANT UPDATE de `profiles`, e `quiz_sessions` é
 * SELECT e nada mais. Um botão que sempre falha é pior do que botão nenhum; a
 * tela diz o que falta.
 */
export async function teacherStudentLoader({ params }: { params: { studentId?: string } }) {
  await requireRole("teacher");
  return { file: await api.loadStudentFile(params.studentId!) };
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
  const { file } = useLoaderData() as LoaderData;
  const { studentId } = useParams();
  const { card, plan, statistics, sessions } = file;

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
          {/*
            O BOTÃO DE LIBERAR NÃO ESTÁ AQUI, e é deliberado: `profiles`
            concede `UPDATE (name)` e mais nada — `access_status` e
            `access_expires_at` ficam fora do grant para que ninguém se promova
            nem estenda o próprio acesso. Liberar precisa nascer como RPC.
          */}
          <Alert status="info">
            Liberar e bloquear acesso está sendo movido para o servidor, onde a regra pode ser
            garantida. Enquanto isso, fale com quem administra o banco.
          </Alert>
        </Card>

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
