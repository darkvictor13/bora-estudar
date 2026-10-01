import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Card, Empty } from "@bora/ui";

import { questionAccuracy } from "@/lib/domain/question-performance";

const numberFormat = new Intl.NumberFormat("pt-BR");
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function QuestionAccuracyCard({ questions, correctAnswers }: { questions: number; correctAnswers: number }) {
  const result = questionAccuracy(questions, correctAnswers);

  return (
    <Card title="Resultado das questões" sub="Aproveitamento calculado pelas respostas registradas; leitura de materiais não altera este indicador">
      {result.questions === 0 ? (
        <Empty>As porcentagens aparecem depois que o aluno registrar questões.</Empty>
      ) : (
        <Box data-testid="question-accuracy" sx={{ display: "grid", gap: 1.5 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1.25 }}>
            <Box data-testid="question-accuracy-correct" sx={(theme) => ({
              p: 2, borderRadius: `${theme.brand.radius.md}px`,
              backgroundColor: theme.vars.palette.success.soft,
              border: `1px solid ${theme.vars.palette.success.border}`,
            })}>
              <Typography sx={{ color: "success.main", fontWeight: 800, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.045em" }}>Acertos</Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.2, flexWrap: "wrap", mt: 0.35 }}>
                <Typography component="strong" sx={{ color: "success.main", fontWeight: 850, fontSize: "2rem", lineHeight: 1.15 }}>{percentFormat.format(result.correctPercent ?? 0)}%</Typography>
                <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 650 }}>{numberFormat.format(result.correctAnswers)} de {numberFormat.format(result.questions)}</Typography>
              </Box>
            </Box>
            <Box data-testid="question-accuracy-wrong" sx={(theme) => ({
              p: 2, borderRadius: `${theme.brand.radius.md}px`,
              backgroundColor: theme.vars.palette.error.soft,
              border: `1px solid ${theme.vars.palette.error.border}`,
            })}>
              <Typography sx={{ color: "error.main", fontWeight: 800, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.045em" }}>Erros</Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.2, flexWrap: "wrap", mt: 0.35 }}>
                <Typography component="strong" sx={{ color: "error.main", fontWeight: 850, fontSize: "2rem", lineHeight: 1.15 }}>{percentFormat.format(result.wrongPercent ?? 0)}%</Typography>
                <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 650 }}>{numberFormat.format(result.wrongAnswers)} de {numberFormat.format(result.questions)}</Typography>
              </Box>
            </Box>
          </Box>
          <Box
            role="img"
            aria-label={`${percentFormat.format(result.correctPercent ?? 0)}% de acertos e ${percentFormat.format(result.wrongPercent ?? 0)}% de erros`}
            sx={(theme) => ({ display: "flex", height: 12, overflow: "hidden", borderRadius: 99, backgroundColor: theme.vars.palette.surface.sunken })}
          >
            <Box sx={{ width: `${result.correctPercent ?? 0}%`, backgroundColor: "success.main" }} />
            <Box sx={{ flex: 1, backgroundColor: "error.main" }} />
          </Box>
          <Typography variant="caption" color="text.secondary">{numberFormat.format(result.questions)} questões respondidas no período</Typography>
        </Box>
      )}
    </Card>
  );
}
