import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { Empty, PageHeader } from "@bora/ui";
import { useLoaderData, useSearchParams } from "react-router";
import { ContentBody } from "@/components/AppShell";
import { MockExamOverview } from "@/components/MockExamOverview";
import { MockExamRanking } from "@/components/MockExamRanking";
import { api } from "@/lib/api";
import { requireStudentAccess } from "@/lib/auth/session";

export async function mockExamsLoader({ request }: { request: Request }) {
  const session = await requireStudentAccess();
  const exams = await api.listMockExams();
  const asked = new URL(request.url).searchParams.get("simulado");
  const selected = exams.find((exam) => exam.id === asked) ?? exams[0] ?? null;
  return { exams, selected, profileId: session.profileId, results: selected ? await api.loadMockExamResults(selected.id) : [] };
}

export function MockExams() {
  const { exams, selected, results, profileId } = useLoaderData<typeof mockExamsLoader>();
  const [, setParams] = useSearchParams();
  return <>
    <PageHeader title="Simulados" description="Resultados dos simulados presenciais da sua turma" />
    <ContentBody>
      {!selected ? <Empty icon="🏆">Nenhum resultado publicado para sua turma. Os simulados aparecerão aqui depois da publicação pelo professor.</Empty> : <>
        <Box sx={{ mb: 2.5 }}>
          <TextField select fullWidth label="Simulado" value={selected.id} onChange={(event) => setParams({ simulado: event.target.value })}>
            {exams.map((exam) => <MenuItem key={exam.id} value={exam.id}>{exam.title} · {exam.examDate.split("-").reverse().join("/")}</MenuItem>)}
          </TextField>
        </Box>
        <Box sx={{ mb: 2 }}>{selected.className}</Box>
        <MockExamRanking results={results} maxScore={selected.maxScore} profileId={profileId} />
        <Box sx={{ mt: 2 }}><MockExamOverview results={results} maxScore={selected.maxScore} profileId={profileId} /></Box>
      </>}
    </ContentBody>
  </>;
}
