import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { Card, Empty } from "@bora/ui";
import type { Statistics, SubjectPeerComparison } from "@/lib/api";
import { formatMinutes } from "@/lib/domain/week";
import { fieldWidth } from "@/lib/ui/field-width";

const colors = ["#16a085", "#448aff", "#a879ef", "#e59c22", "#de668f", "#22b8cf"];
const subjectColor = (stats: Statistics) => { const names = [...new Set([...stats.bySubject.map((row) => row.subject), ...(stats.studyTime ?? []).map((row) => row.subject), ...(stats.byBlock ?? []).map((row) => row.subject)])].sort(); return (name: string) => colors[names.indexOf(name) % colors.length] ?? colors[0]!; };
const pct = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const tone = (value: number) => value >= 80 ? "success" : value >= 60 ? "warning" : "error";
const tableStyle = { width: "100%", borderCollapse: "collapse", textAlign: "left", "& th": { color: "text.secondary", fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".04em" }, "& td, & th": { p: 1.5, borderBottom: "1px solid", borderColor: "divider" }, "& tbody tr:hover": { bgcolor: "action.hover" } } as const;

export function PerformanceOverview({ stats, subjectPeers = [] }: { stats: Statistics; subjectPeers?: readonly SubjectPeerComparison[] }) {
  const score = stats.questionsAnswered ? stats.correctAnswers / stats.questionsAnswered * 100 : 0;
  const subjects = stats.bySubject;
  const peerBySubject = new Map(subjectPeers.map((row) => [row.subject, row]));
  const allSubjectsComparable = subjects.length >= 3 && subjects.every((subject) => peerBySubject.get(subject.subject)?.peerAverage !== null && peerBySubject.get(subject.subject)?.peerAverage !== undefined);
  const coord = (index: number, radius: number) => {
    const angle = index * 2 * Math.PI / subjects.length - Math.PI / 2;
    return [200 + Math.cos(angle) * radius, 145 + Math.sin(angle) * radius];
  };
  return <Card title="Desempenho geral" sub="Resultado das questões registradas no planejamento e no ano selecionados">
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr .65fr 1fr" }, alignItems: "center", gap: 3, py: 2 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden", bgcolor: "action.hover" }}>
        {([["Questões resolvidas", stats.questionsAnswered, "text.primary"], ["Acertos", stats.correctAnswers, "success.main"], ["Erros", stats.questionsAnswered - stats.correctAnswers, "error.main"], ["Disciplinas", subjects.length, "text.primary"]] as const).map(([label, value, textColor]) => <Box key={label} sx={{ p: 2.5, border: "1px solid", borderColor: "divider" }}><Typography variant="caption">{label}</Typography><Typography sx={{ fontSize: "1.8rem", fontWeight: 850, color: textColor }}>{Number(value).toLocaleString("pt-BR")}</Typography></Box>)}
      </Box>
      <Box sx={{ display: "grid", justifyItems: "center", gap: 1.5 }}>
        <Box role="img" aria-label={`${pct(score)} de acertos`} sx={(theme) => ({ width: 158, height: 158, borderRadius: "50%", background: stats.questionsAnswered ? `conic-gradient(${theme.vars.palette.success.main} ${score}%, ${theme.vars.palette.error.main} 0)` : theme.vars.palette.surface.sunken, p: "22px" })}>
          <Box sx={(theme) => ({ height: "100%", borderRadius: "50%", bgcolor: theme.vars.palette.surface.raised, display: "grid", alignContent: "center", textAlign: "center" })}><Typography sx={{ fontSize: "1.5rem", fontWeight: 850 }}>{stats.questionsAnswered ? pct(score) : "—"}</Typography><Typography sx={{ fontSize: ".6rem", textTransform: "uppercase" }}>Aproveitamento</Typography></Box>
        </Box>
        <Typography variant="caption"><Box component="span" sx={{ color: "success.main" }}>● Acertos</Box> · <Box component="span" sx={{ color: "error.main" }}>● Erros</Box></Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}><Typography fontWeight={750}>Radar por matéria</Typography><Typography variant="caption">Você e média dos colegas por disciplina · 0 a 100%</Typography>
        {subjects.length < 3 ? <Empty>O radar aparece com três disciplinas respondidas.</Empty> : <>
          <Box component="svg" viewBox="0 0 400 290" role="img" aria-label="Radar comparativo por matéria: aluno em azul e colegas em verde" sx={{ width: "100%", maxHeight: 280, color: "text.secondary" }}>
            {[20, 40, 60, 80, 100].map((level) => <polygon key={level} points={subjects.map((_, i) => coord(i, level).join(",")).join(" ")} fill="none" stroke="currentColor" opacity=".2" />)}
            {subjects.map((subject, i) => { const [x, y] = coord(i, 125); return <g key={subject.subject}><line x1="200" y1="145" x2={coord(i, 100)[0]} y2={coord(i, 100)[1]} stroke="currentColor" opacity=".15" /><text x={x} y={y} textAnchor="middle" fill="currentColor" fontSize="10">{subject.subject.length > 24 ? `${subject.subject.slice(0, 22)}…` : subject.subject}</text></g>; })}
            {allSubjectsComparable && <polygon points={subjects.map((subject, i) => coord(i, peerBySubject.get(subject.subject)!.peerAverage!).join(",")).join(" ")} fill="#29b88c" fillOpacity=".17" stroke="#29b88c" strokeWidth="2.5" />}
            <polygon points={subjects.map((subject, i) => coord(i, subject.score).join(",")).join(" ")} fill="#448aff" fillOpacity=".12" stroke="#448aff" strokeWidth="2.5" />
            {subjects.map((subject, i) => <circle key={`student-${subject.subject}`} cx={coord(i, subject.score)[0]} cy={coord(i, subject.score)[1]} r="4" fill="#78a7ff"><title>Você · {subject.subject}: {pct(subject.score)}</title></circle>)}
            {subjects.map((subject, i) => { const peer = peerBySubject.get(subject.subject); return peer?.peerAverage === null || peer?.peerAverage === undefined ? null : <circle key={`peer-${subject.subject}`} cx={coord(i, peer.peerAverage)[0]} cy={coord(i, peer.peerAverage)[1]} r="4" fill="#29b88c"><title>Colegas · {subject.subject}: {pct(peer.peerAverage)}</title></circle>; })}
          </Box>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1 }}><Typography variant="caption" sx={{ color: "#448aff", fontWeight: 800 }}>● Você</Typography><Typography variant="caption" sx={{ color: "#29b88c", fontWeight: 800 }}>● Média dos colegas</Typography></Box>
          {!allSubjectsComparable && <Typography variant="caption" color="text.secondary">A linha da turma aparece quando houver amostra suficiente em todas as matérias; os pontos disponíveis aparecem em verde.</Typography>}
          {subjects.map((subject) => { const peer = peerBySubject.get(subject.subject); return <Box key={subject.subject} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 1, py: .5, borderTop: "1px solid", borderColor: "divider" }}><Typography variant="caption" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject.subject}</Typography><Typography variant="caption" sx={{ fontWeight: 800 }}><Box component="span" sx={{ color: "#448aff" }}>{pct(subject.score)}</Box>{" · "}<Box component="span" sx={{ color: "#29b88c" }}>{peer?.peerAverage === null || peer?.peerAverage === undefined ? "—" : pct(peer.peerAverage)}</Box></Typography></Box>; })}
        </>}
      </Box>
    </Box>
  </Card>;
}

export function StudyTimeDistribution({ stats }: { stats: Statistics }) {
  const color = subjectColor(stats);
  const [month, setMonth] = useState("all");
  const entries = stats.studyTime ?? [];
  const months = [...new Set(entries.map((entry) => entry.date.slice(0, 7)))].sort();
  const sums = new Map<string, number>();
  for (const entry of entries) if (month === "all" || entry.date.startsWith(month)) sums.set(entry.subject, (sums.get(entry.subject) ?? 0) + entry.minutes);
  const rows = [...sums.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, minutes]) => sum + minutes, 0);

  const segments = rows.map(([subject, minutes], index) => { const start = rows.slice(0, index).reduce((sum, row) => sum + row[1], 0) / total * 100; const end = start + minutes / total * 100; return `${color(subject)} ${start}% ${end}%`; });
  return <Card title="Distribuição do tempo de estudo por matéria" sub="Participação de cada disciplina no tempo registrado">
    <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}><TextField select size="small" label="Período" value={month} onChange={(event) => setMonth(event.target.value)} sx={fieldWidth(180)}><MenuItem value="all">Ano selecionado</MenuItem>{months.map((value) => <MenuItem key={value} value={value}>{value.slice(5)}/{value.slice(0, 4)}</MenuItem>)}</TextField></Box>
    {!total ? <Empty>Nenhum tempo por matéria registrado neste período.</Empty> : <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "200px 1fr" }, gap: 4, alignItems: "center" }}>
      <Box sx={{ textAlign: "center" }}><Box aria-hidden="true" sx={{ width: 160, height: 160, mx: "auto", borderRadius: "50%", background: `conic-gradient(${segments.join(",")})`, border: "2px solid", borderColor: "divider" }} /><Typography sx={{ mt: 2, fontSize: "1.7rem", fontWeight: 850 }}>{formatMinutes(total)}</Typography><Typography variant="caption">Tempo total registrado</Typography></Box>
      <Box component="table" aria-label="Tempo por matéria" sx={tableStyle}><Box component="tbody">{rows.map(([subject, minutes]) => <Box component="tr" key={subject}><Box component="th" scope="row"><Box component="span" sx={{ color: color(subject), mr: 1 }}>●</Box>{subject}</Box><Box component="td" sx={{ textAlign: "right" }}><Typography fontWeight={800}>{formatMinutes(minutes)}</Typography><Typography variant="caption">{pct(minutes / total * 100)}</Typography></Box></Box>)}</Box></Box>
    </Box>}
  </Card>;
}

export function PerformanceTables({ stats }: { stats: Statistics }) {
  const color = subjectColor(stats);
  const blocks = [...(stats.byBlock ?? [])].sort((a, b) => a.correctAnswers / a.questions - b.correctAnswers / b.questions);
  return <Box sx={{ display: "grid", gap: 2 }}>
    <Card title="Aproveitamento geral por disciplina" sub="Acertos em verde e erros em vermelho; resultado das questões do período">
      <Box sx={{ overflowX: "auto" }}><Box component="table" sx={{ ...tableStyle, minWidth: 660 }}><Box component="thead"><tr><th>Disciplina</th><th>Questões</th><th>Desempenho</th><th>Resultado</th></tr></Box><Box component="tbody">{[...stats.bySubject].sort((a, b) => b.score - a.score).map((subject) => { const score = subject.correctAnswers / subject.questions * 100; return <tr key={subject.subject}><th scope="row"><Box component="span" sx={{ color: color(subject.subject), mr: 1 }}>●</Box>{subject.subject}</th><td>{subject.questions}</td><td style={{ width: "40%" }}><Box aria-hidden="true" sx={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", bgcolor: "error.main" }}><Box sx={{ width: `${score}%`, bgcolor: "success.main" }} /></Box></td><td><Typography variant="caption" sx={{ color: "success.main", fontWeight: 800 }}>{pct(score)} ({subject.correctAnswers})</Typography>{" · "}<Typography variant="caption" sx={{ color: "error.main", fontWeight: 800 }}>{pct(100 - score)} ({subject.questions - subject.correctAnswers})</Typography></td></tr>; })}</Box></Box></Box>
    </Card>
    <Card title="Blocos × desempenho" sub="Do menor para o maior aproveitamento, para identificar os conteúdos que precisam de revisão">
      {!blocks.length ? <Empty>A comparação aparece quando houver questões registradas nos blocos.</Empty> : <Box sx={{ overflowX: "auto" }}><Box component="table" sx={{ ...tableStyle, minWidth: 700 }}><thead><tr><th>Disciplina</th><th>Bloco</th><th>Total realizado</th><th>Acertos e erros</th><th>Aproveitamento geral</th></tr></thead><tbody>{blocks.map((block) => { const score = block.correctAnswers / block.questions * 100; return <tr key={JSON.stringify([block.subject, block.block])}><th scope="row" style={{ color: color(block.subject) }}>{block.subject}</th><td>{block.block}</td><td>{block.questions}</td><td><Typography variant="caption" sx={{ color: "success.main", fontWeight: 800 }}>{block.correctAnswers} acertos</Typography>{" · "}<Typography variant="caption" sx={{ color: "error.main", fontWeight: 800 }}>{block.questions - block.correctAnswers} erros</Typography></td><td><Box component="span" sx={{ px: 1.25, py: .5, borderRadius: 99, bgcolor: `${tone(score)}.soft`, color: `${tone(score)}.main`, fontWeight: 800 }}>{pct(score)}</Box></td></tr>; })}</tbody></Box></Box>}
    </Card>
  </Box>;
}
