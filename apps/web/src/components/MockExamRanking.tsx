import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { Badge, Card, Empty } from "@bora/ui";
import type { MockExamResult } from "@/lib/api";
import { rankMockExam } from "@/lib/domain/mock-exams";

export const formatScore = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function MockExamRanking({ results, maxScore, profileId, draft = false }: {
  results: readonly MockExamResult[]; maxScore: number; profileId?: string; draft?: boolean;
}) {
  const ranking = rankMockExam(results);
  const mine = ranking.find((row) => row.studentId === profileId);
  return (
    <Card title={draft ? "Prévia do ranking geral" : "Ranking geral do simulado"}
      sub={`${ranking.length} ${ranking.length === 1 ? "nota lançada" : "notas lançadas"} · Pontuação máxima: ${formatScore(maxScore)}`}>
      {mine && <Typography sx={{ mb: 2 }}>Sua posição: <strong>{mine.rank}º</strong> · Nota: <strong>{formatScore(mine.score)}</strong></Typography>}
      {ranking.length === 0 ? <Empty>O ranking aparecerá quando houver notas lançadas.</Empty> : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label={draft ? "Prévia do ranking" : "Ranking do simulado"}>
            <TableHead><TableRow><TableCell>Posição</TableCell><TableCell>Aluno</TableCell><TableCell align="right">Nota</TableCell><TableCell align="right">Aproveitamento</TableCell></TableRow></TableHead>
            <TableBody>{ranking.map((row) => (
              <TableRow key={row.studentId} selected={row.studentId === profileId} data-testid="ranking-row">
                <TableCell>{row.rank}º</TableCell>
                <TableCell>{row.studentName} {row.studentId === profileId && <Badge tone="accent">Você</Badge>}</TableCell>
                <TableCell align="right">{formatScore(row.score)}</TableCell>
                <TableCell align="right">{formatScore(row.score / maxScore * 100)}%</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </Box>
      )}
      <Typography variant="body2" sx={{ mt: 2 }}>Notas iguais compartilham a mesma colocação. Alunos sem nota não entram no ranking.</Typography>
    </Card>
  );
}
