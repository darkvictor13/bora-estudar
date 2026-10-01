import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Card, Empty } from "@bora/ui";
import type { SubjectPerformance } from "@/lib/api";

const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const toneOf = (score: number) => score >= 80 ? "success" : score >= 60 ? "warning" : "error";

/** Altura = questões respondidas; cor e selo = aproveitamento. */
export function SubjectPerformanceCard({ subjects }: { subjects: readonly SubjectPerformance[] }) {
  const maxQuestions = Math.max(1, ...subjects.map((subject) => subject.questions));
  return (
    <Card title="Disciplinas × desempenho" sub="Altura das colunas: quantidade de questões. Cor e percentual: aproveitamento nas respostas.">
      {!subjects.length ? <Empty>Registre resultados para comparar as disciplinas.</Empty> : <>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
          {([ ["error", "Abaixo de 60%"], ["warning", "60% a 79,9%"], ["success", "80% a 100%"] ] as const).map(([tone, label]) => (
            <Typography key={tone} variant="caption" sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 700 }}>
              <Box component="span" sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: `${tone}.main` }} />{label}
            </Typography>
          ))}
        </Box>
        <Box data-testid="chart-by-subject" tabIndex={0} role="region" aria-label="Gráfico por disciplina; role horizontalmente para ver todas" sx={{ overflowX: "auto", pb: 1 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${subjects.length}, minmax(150px, 1fr))`, gap: 2, minWidth: subjects.length * 170 }}>
            {subjects.map((subject) => {
              const tone = toneOf(subject.score);
              const wrong = subject.questions - subject.correctAnswers;
              return <Box key={subject.subject} data-testid="ranked-row" data-label={subject.subject} sx={{ textAlign: "center", minWidth: 0 }}>
                <Box role="img" aria-label={`${subject.subject}: ${subject.questions} questões, ${percent(subject.score)} de acertos`} sx={(theme) => ({ height: 260, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid", borderColor: "divider", backgroundImage: `repeating-linear-gradient(to top, transparent 0, transparent 64px, ${theme.vars.palette.surface.border} 65px)` })}>
                  <Box sx={{ width: "64%", height: `${(subject.questions / maxQuestions) * 78}%`, position: "relative", minHeight: subject.questions > 0 ? 2 : 0 }}>
                    <Typography variant="numeric" sx={{ position: "absolute", bottom: "100%", width: "100%", pb: 0.7, fontWeight: 800 }}>{subject.questions.toLocaleString("pt-BR")}</Typography>
                    <Box sx={(theme) => ({ height: "100%", borderRadius: "8px 8px 0 0", bgcolor: theme.vars.palette[tone].main, backgroundImage: "linear-gradient(110deg, rgba(255,255,255,.2), transparent 65%)", boxShadow: "inset 1px 1px 0 rgba(255,255,255,.2)" })} />
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 800, mt: 1.25, minHeight: 44 }}>{subject.subject}</Typography>
                <Box component="span" sx={(theme) => ({ display: "inline-block", px: 1.5, py: 0.5, borderRadius: 99, color: theme.vars.palette[tone].main, bgcolor: theme.vars.palette[tone].soft, border: `1px solid ${theme.vars.palette[tone].border}`, fontWeight: 900 })}>{percent(subject.score)}</Box>
                <Typography variant="caption" component="div" sx={{ mt: 1, color: "success.main", fontWeight: 700 }}>{subject.correctAnswers} acertos</Typography>
                <Typography variant="caption" component="div" sx={{ color: "error.main", fontWeight: 700 }}>{wrong} erros</Typography>
                <Typography variant="caption" component="div" color="text.secondary">Meta: {percent(subject.targetScore)}</Typography>
              </Box>;
            })}
          </Box>
        </Box>
      </>}
    </Card>
  );
}
