import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Empty, PageHeader } from "@bora/ui";
import { useRef, useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { ContentBody } from "@/components/AppShell";
import { MockExamOverview } from "@/components/MockExamOverview";
import { MockExamRanking, formatScore } from "@/components/MockExamRanking";
import { api, newRequestId, type Result } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { localDate } from "@/lib/domain/schedule";

export async function teacherMockExamsLoader({ request }: { request: Request }) {
  await requireRole("teacher");
  const [exams, classes, students] = await Promise.all([api.listMockExams(), api.listClasses(), api.listStudents({})]);
  const asked = new URL(request.url).searchParams.get("simulado");
  const selected = exams.find((exam) => exam.id === asked) ?? exams[0] ?? null;
  return { exams, classes, students, selected, results: selected ? await api.loadMockExamResults(selected.id) : [] };
}

function ScoreForm({ name, score, maxScore, disabled, onSave }: {
  name: string; score: number | null; maxScore: number; disabled: boolean;
  onSave: (score: number | null) => Promise<boolean>;
}) {
  const [value, setValue] = useState(score === null ? "" : String(score));
  const [saved, setSaved] = useState(false);
  return <Box component="form" onSubmit={(event) => { event.preventDefault();
    setSaved(false);
    void onSave(value.trim() === "" ? null : Number(value.replace(",", "."))).then(setSaved);
  }} sx={{ display: "flex", gap: 1.5, alignItems: "center", py: 1.5, flexWrap: "wrap", borderBottom: 1, borderColor: "divider" }}>
    <Typography sx={{ flex: "1 1 180px" }}>{name}</Typography>
    <TextField size="small" type="number" label={`Nota de ${name}`} value={value} disabled={disabled}
      onChange={(event) => { setValue(event.target.value); setSaved(false); }}
      slotProps={{ htmlInput: { min: 0, max: maxScore, step: 0.01 } }} sx={{ width: 150 }} />
    <Button type="submit" variant="outlined" disabled={disabled}>Salvar nota</Button>
    {saved && <Typography role="status" variant="body2">Salva</Typography>}
  </Box>;
}

export function TeacherMockExams() {
  const { exams, classes, students, selected, results } = useLoaderData<typeof teacherMockExamsLoader>();
  const [, setParams] = useSearchParams();
  const { revalidate } = useRevalidator();
  const [dialogId, setDialogId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<Result<unknown>>): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true; setPending(true); setError(null); setNotice(null);
    try {
      const result = await action();
      if (!result.ok) { setError(result.error.message); return false; }
      await revalidate();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar. Tente novamente.");
      return false;
    } finally { busy.current = false; setPending(false); }
  }
  const roster = students.filter((student) => student.classId === selected?.classId);
  const savedCount = results.filter((row) => row.score !== null).length;

  return <>
    <PageHeader title="Simulados presenciais" description="Cadastre a prova, lance as notas e publique o ranking para a turma"
      actions={<Button disabled={!classes.length || pending} onClick={() => { setError(null); setDialogId(newRequestId()); }}>Novo simulado</Button>} />
    <ContentBody>
      {error && !dialogId && <Alert status="error">{error}</Alert>}
      {notice && <Alert status="success">{notice}</Alert>}
      {!classes.length && <Alert status="info">Crie uma turma e vincule os alunos antes de cadastrar o simulado.</Alert>}
      {!selected ? <Empty>Nenhum simulado cadastrado. Comece por “Novo simulado”.</Empty> : <>
        <TextField select fullWidth label="Simulado" value={selected.id} disabled={pending}
          onChange={(event) => { setError(null); setNotice(null); setParams({ simulado: event.target.value }); }} sx={{ mb: 2 }}>
          {exams.map((exam) => <MenuItem key={exam.id} value={exam.id}>{exam.title} · {exam.className} · {exam.published ? "Publicado" : "Rascunho"}</MenuItem>)}
        </TextField>
        <Card title={selected.title} sub={`${selected.className} · ${selected.examDate.split("-").reverse().join("/")} · Máximo: ${formatScore(selected.maxScore)} pontos`}
          action={<Badge tone={selected.published ? "success" : "neutral"}>{selected.published ? "Publicado" : "Rascunho"}</Badge>}>
          <Typography sx={{ mb: 2 }}>{selected.published ? "O ranking está visível para os alunos da turma. Retire a publicação para corrigir notas." : "As notas ainda não estão visíveis para os alunos. Salve cada nota antes de publicar."}</Typography>
          <Button variant="outlined" disabled={pending || (!selected.published && savedCount === 0)} onClick={() => {
            void run(() => api.publishMockExam(selected.id, !selected.published)).then((ok) => { if (ok) setNotice(selected.published ? "Publicação retirada. Você pode editar as notas." : "Ranking publicado para a turma."); });
          }}>{selected.published ? "Retirar publicação para editar" : `Publicar ranking (${savedCount} ${savedCount === 1 ? "nota" : "notas"})`}</Button>
        </Card>
        <Box sx={{ my: 2 }}>
          <Card title="Lançamento de notas" sub="Deixe a nota vazia e salve para retirar o aluno do ranking. Zero conta como nota.">
            {roster.length === 0 ? <Empty>Nenhum aluno vinculado a esta turma.</Empty> : roster.map((student) => {
              const score = results.find((row) => row.studentId === student.studentId)?.score ?? null;
              return <ScoreForm key={`${selected.id}:${student.studentId}:${score}`} name={student.name ?? "Aluno"} score={score} maxScore={selected.maxScore}
                disabled={pending || selected.published} onSave={(value) => run(() => api.saveMockExamScore(selected.id, student.studentId, value))} />;
            })}
          </Card>
        </Box>
        <MockExamRanking results={results} maxScore={selected.maxScore} draft={!selected.published} />
        <Box sx={{ mt: 2 }}><MockExamOverview results={results} maxScore={selected.maxScore} draft={!selected.published} /></Box>
      </>}
    </ContentBody>
    <Dialog open={dialogId !== null} onClose={() => { if (!pending) setDialogId(null); }} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={(event) => {
        event.preventDefault(); if (!dialogId) return;
        const form = new FormData(event.currentTarget);
        const input = { id: dialogId, title: String(form.get("title") ?? ""), classId: String(form.get("classId") ?? ""), examDate: String(form.get("date") ?? ""), maxScore: Number(form.get("maxScore")) };
        void run(() => api.createMockExam(input)).then((ok) => {
          if (ok) { setDialogId(null); setParams({ simulado: input.id }); setNotice("Simulado cadastrado. Lance as notas da turma."); }
        });
      }}>
        <DialogTitle>Novo simulado presencial</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px !important" }}>
          {error && <Alert status="error">{error}</Alert>}
          <TextField name="title" label="Título" required disabled={pending} slotProps={{ htmlInput: { maxLength: 160 } }} />
          <TextField name="classId" label="Turma" select defaultValue="" required disabled={pending}>
            {classes.map((turma) => <MenuItem key={turma.id} value={turma.id}>{turma.name}</MenuItem>)}
          </TextField>
          <TextField name="date" label="Data do simulado" type="date" defaultValue={localDate()} required disabled={pending} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField name="maxScore" label="Pontuação máxima" type="number" defaultValue="100" required disabled={pending} slotProps={{ htmlInput: { min: 0.01, max: 100000, step: 0.01 } }} />
        </DialogContent>
        <DialogActions><Button variant="text" disabled={pending} onClick={() => setDialogId(null)}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Cadastrar simulado"}</Button></DialogActions>
      </Box>
    </Dialog>
  </>;
}
