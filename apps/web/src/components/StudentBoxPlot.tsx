import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Card, Empty } from "@bora/ui";
import type { BoxPlotSummary } from "@/lib/domain/boxplot";

export interface ComparisonBox {
  readonly label: string;
  readonly summary: BoxPlotSummary | null;
  readonly studentScore: number | null;
  readonly sampleSize: number;
  readonly minimumQuestions: number;
  readonly studentQuestions: number;
}

const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Uma caixa vertical por semana, todas com a mesma escala percentual. */
export function StudentBoxPlot({ boxes, emptyMessage }: {
  boxes: readonly ComparisonBox[];
  emptyMessage: string;
}) {
  return (
    <Card title="Boxplot por semana" sub="Aproveitamento em questões por semana do planejamento ativo">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Cada caixa mostra a distribuição da turma naquela semana. O losango marca seu resultado.
        Só aparecem quartis quando pelo menos cinco alunos responderam cinco questões na semana.
      </Typography>
      {boxes.length === 0 ? <Empty>{emptyMessage}</Empty> : <>
        <Box sx={{ display: "flex", gap: 2.5, mb: 2, flexWrap: "wrap" }}>
          <Typography variant="caption" sx={{ fontWeight: 750 }}><Box component="span" sx={{ color: "warning.main" }}>◆</Box> Você</Typography>
          <Typography variant="caption" sx={{ fontWeight: 750 }}><Box component="span" sx={{ color: "success.main" }}>▣</Box> Turma · 50% centrais</Typography>
          <Typography variant="caption">Traço central: mediana</Typography>
        </Box>
        <Box data-testid="student-boxplot" sx={{ display: "flex", gap: 1, py: 1 }}>
          <Box aria-hidden="true" sx={{ position: "relative", width: 42, flexShrink: 0, height: 270 }}>
            {[0, 20, 40, 60, 80, 100].map((value) => (
              <Typography key={value} variant="caption" sx={{ position: "absolute", top: `${100 - value}%`, transform: "translateY(-50%)", right: 0 }}>{value}%</Typography>
            ))}
          </Box>
          <Box sx={{ overflowX: "auto", flex: 1, pb: 1 }} tabIndex={0} role="region" aria-label="Boxplot semanal da turma e resultado do aluno">
            <Box sx={{ minWidth: Math.max(360, boxes.length * 90) }}>
              <Box sx={(theme) => ({ position: "relative", height: 270, borderBottom: "1px solid", borderColor: "divider", bgcolor: theme.vars.palette.surface.sunken, borderRadius: "8px 8px 0 0" })}>
                {[0, 20, 40, 60, 80, 100].map((value) => (
                  <Box key={value} sx={{ position: "absolute", top: `${100 - value}%`, width: "100%", borderTop: "1px solid", borderColor: "divider", opacity: .65 }} />
                ))}
                <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${boxes.length}, 1fr)`, height: "100%" }}>
                  {boxes.map(({ label, summary: plot, studentScore, sampleSize }) => (
                    <Box key={label} role="img"
                      aria-label={plot
                        ? `${label}: ${plot.count} alunos, primeiro quartil ${percent(plot.q1)}, mediana ${percent(plot.median)}, terceiro quartil ${percent(plot.q3)}${studentScore !== null ? `, você ${percent(studentScore)}` : ""}`
                        : `${label}: ${sampleSize} alunos elegíveis; amostra insuficiente${studentScore !== null ? `, você ${percent(studentScore)}` : ""}`}
                      sx={{ position: "relative", mx: "auto", width: 44 }}>
                      {plot && <>
                        <Box sx={{ position: "absolute", left: "50%", bottom: `${plot.lowerWhisker}%`, height: `${plot.upperWhisker - plot.lowerWhisker}%`, borderLeft: "2px solid", borderColor: "success.main" }} />
                        {[plot.lowerWhisker, plot.upperWhisker].map((value, index) => (
                          <Box key={index} sx={{ position: "absolute", width: 24, left: 10, bottom: `${value}%`, borderTop: "2px solid", borderColor: "success.main" }} />
                        ))}
                        <Box sx={{ position: "absolute", bottom: `${plot.q1}%`, height: `${plot.q3 - plot.q1}%`, minHeight: 2, width: "100%", border: "2px solid", borderColor: "success.main", bgcolor: "success.soft" }} />
                        <Box sx={{ position: "absolute", bottom: `${plot.median}%`, width: "100%", borderTop: "2px solid", borderColor: "success.main" }} />
                        {plot.outliers.map((value, index) => (
                          <Box key={index} sx={{ position: "absolute", bottom: `${value}%`, left: "50%", width: 5, height: 5, borderRadius: "50%", bgcolor: "text.secondary", transform: "translate(-50%, 50%)" }} />
                        ))}
                      </>}
                      {studentScore !== null && <Box title={`Você: ${percent(studentScore)}`} sx={{ position: "absolute", bottom: `${studentScore}%`, left: "50%", width: 11, height: 11, bgcolor: "warning.main", border: "2px solid", borderColor: "background.paper", transform: "translate(-50%, 50%) rotate(45deg)", zIndex: 1 }} />}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${boxes.length}, 1fr)`, mt: 1.5 }}>
                {boxes.map((box) => <Typography key={box.label} variant="caption" sx={{ textAlign: "center", fontWeight: 700 }}>{box.label}</Typography>)}
              </Box>
            </Box>
          </Box>
        </Box>
        {boxes.some((box) => !box.summary) && <Typography variant="caption" color="text.secondary">Sem caixa em algumas semanas: menos de cinco alunos elegíveis.</Typography>}
        <Typography variant="caption" component="p" sx={{ mt: 1 }}>
          A caixa vai do primeiro ao terceiro quartil; o traço central é a mediana. Os bigodes ficam dentro de 1,5 vez o intervalo entre quartis.
        </Typography>
        <Box component="details" sx={{ mt: 2 }}>
          <Typography component="summary" sx={{ cursor: "pointer", fontWeight: 700 }}>Ver os números</Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { p: 1.25, textAlign: "left", borderBottom: "1px solid", borderColor: "divider" } }}>
              <thead><tr><th>Semana</th><th>Alunos</th><th>Q1</th><th>Mediana</th><th>Q3</th><th>Você</th></tr></thead>
              <tbody>{boxes.map((box) => <tr key={box.label}>
                <th scope="row">{box.label}</th><td>{box.sampleSize}</td>
                <td>{box.summary ? percent(box.summary.q1) : "—"}</td>
                <td>{box.summary ? percent(box.summary.median) : "—"}</td>
                <td>{box.summary ? percent(box.summary.q3) : "—"}</td>
                <td>{box.studentScore === null ? `Menos de ${box.minimumQuestions} questões` : percent(box.studentScore)}</td>
              </tr>)}</tbody>
            </Box>
          </Box>
        </Box>
      </>}
    </Card>
  );
}
