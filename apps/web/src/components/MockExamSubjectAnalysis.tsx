import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Badge, Card, Empty } from "@bora/ui";
import { useState } from "react";
import type { MockExamResult, MockExamSubject, MockExamSubjectResult } from "@/lib/api";
import { analyzeMockExamSubjects } from "@/lib/domain/mock-exam-subjects";

const formatPercent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function MockExamSubjectAnalysis({ subjects, answers, results, profileId, draft = false }: {
  subjects: readonly MockExamSubject[];
  answers: readonly MockExamSubjectResult[];
  results: readonly MockExamResult[];
  profileId?: string;
  draft?: boolean;
}) {
  const [chosen, setChosen] = useState("");
  const analyses = analyzeMockExamSubjects(subjects, answers, results, profileId);
  const selected = analyses.find((item) => item.subject === chosen) ?? analyses[0];
  const gaps = analyses.filter((item) => item.mine?.gap !== null && item.mine?.gap !== undefined && item.mine.gap < 0)
    .sort((a, b) => (a.mine?.gap ?? 0) - (b.mine?.gap ?? 0));
  return <Card title={draft ? "Prévia por matéria" : "Análise por matéria"}
    sub="Compare seus acertos com os colegas que tiveram resultado lançado na mesma prova e matéria.">
    {analyses.length === 0 ? <Empty>O professor ainda não cadastrou as matérias deste simulado.</Empty> : <>
      {profileId && gaps.length > 0 && <Box sx={{ mb: 2, p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}>
        <Typography fontWeight={700}>Prioridades de revisão</Typography>
        <Typography variant="body2">Você ficou abaixo da média dos colegas em {gaps.map((item) => `${item.subject} (${formatPercent(Math.abs(item.mine?.gap ?? 0))} abaixo)`).join(", ")}.</Typography>
      </Box>}
      <Typography fontWeight={700} sx={{ mb: 1.5 }}>{profileId ? "Seu desempenho × média dos colegas" : "Média da turma por matéria"}</Typography>
      <Box role="img" aria-label="Comparação do seu aproveitamento com a média dos colegas por matéria" sx={{ display: "flex", gap: 2, overflowX: "auto", py: 1, mb: 1 }}>
        {analyses.map((item) => {
          const comparison = item.ranking.length === 0 ? null : profileId && item.mine ? item.mine.peerAverage : item.classAverage;
          return <Box key={item.subject} sx={{ minWidth: 110, flex: "1 0 110px", textAlign: "center" }}>
          <Box sx={{ height: 144, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 0.5 }}>
            {item.mine && <Box title={`Você: ${formatPercent(item.mine.percent)}`} sx={{ position: "relative", width: 27, minHeight: item.mine.percent > 0 ? 3 : 0, height: `${item.mine.percent}%`, bgcolor: "#4d8deb", borderRadius: "4px 4px 0 0" }}>
              <Typography component="span" variant="caption" sx={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>{formatPercent(item.mine.percent)}</Typography>
            </Box>}
            {comparison !== null && <Box title={`${profileId ? "Colegas" : "Turma"}: ${formatPercent(comparison)}`} sx={{ position: "relative", width: 27, minHeight: comparison > 0 ? 3 : 0, height: `${comparison}%`, bgcolor: "#63c69c", borderRadius: "4px 4px 0 0" }}>
              <Typography component="span" variant="caption" sx={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>{formatPercent(comparison)}</Typography>
            </Box>}
          </Box>
          <Typography variant="caption" sx={{ display: "block", mt: 0.5, lineHeight: 1.2 }}>{item.subject}</Typography>
          <Typography variant="caption" color="text.secondary">{item.ranking.length} {item.ranking.length === 1 ? "resultado" : "resultados"}</Typography>
        </Box>;
        })}
      </Box>
      <Typography variant="body2" sx={{ mb: 2 }}>{profileId && <><Box component="span" sx={{ color: "#4d8deb", fontWeight: 700 }}>■</Box> Você&nbsp;&nbsp; </>}<Box component="span" sx={{ color: "#63c69c", fontWeight: 700 }}>■</Box> {profileId ? "Colegas" : "Turma"}</Typography>
      <TextField select fullWidth label="Ranking por matéria" value={selected?.subject ?? ""} onChange={(event) => setChosen(event.target.value)} sx={{ mb: 2 }}>
        {analyses.map((item) => <MenuItem key={item.subject} value={item.subject}>{item.subject}</MenuItem>)}
      </TextField>
      {selected && <>
        {selected.mine && <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
          <Typography>Você: <strong>{selected.mine.correctAnswers}/{selected.questionCount} · {formatPercent(selected.mine.percent)}</strong></Typography>
          <Typography>Posição: <strong>{selected.mine.rank}º de {selected.ranking.length}</strong></Typography>
          <Typography>Média dos colegas: <strong>{selected.mine.peerAverage === null ? "sem comparação" : formatPercent(selected.mine.peerAverage)}</strong></Typography>
        </Box>}
        {selected.ranking.length === 0 ? <Empty>Ainda não há acertos lançados nesta matéria.</Empty> : <Box sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label={`Ranking de ${selected.subject}`}>
            <TableHead><TableRow><TableCell>Posição</TableCell><TableCell>Aluno</TableCell><TableCell align="right">Acertos</TableCell><TableCell align="right">Aproveitamento</TableCell></TableRow></TableHead>
            <TableBody>{selected.ranking.map((row) => <TableRow key={row.studentId} selected={row.studentId === profileId}>
              <TableCell>{row.rank}º</TableCell><TableCell>{row.studentName} {row.studentId === profileId && <Badge tone="accent">Você</Badge>}</TableCell>
              <TableCell align="right">{row.correctAnswers}/{selected.questionCount}</TableCell><TableCell align="right">{formatPercent(row.percent)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </Box>}
      </>}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>A média dos colegas exclui seu resultado. Empates dividem a mesma posição; matéria sem lançamento não entra na comparação.</Typography>
    </>}
  </Card>;
}
