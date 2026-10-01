import ArrowBackIcon from "@mui/icons-material/ArrowBackOutlined";
import AutoGraphIcon from "@mui/icons-material/AutoGraphOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { Card, Empty, PageHeader } from "@bora/ui";
import { Link, useLoaderData } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type FlashcardReview } from "@/lib/api";
import { requireStudentAccess } from "@/lib/auth/session";
import { buildFlashcardStatistics, type FlashcardStatisticsDeck } from "@/lib/domain/flashcard-statistics";
import { lessonReviewFromLibrary, libraryDeckCards } from "@/lib/domain/library-flashcards";
import { ROUTES } from "@/lib/routes";

export async function flashcardStatisticsLoader() {
  await requireStudentAccess();
  const plan = await api.loadActivePlanOrNull();
  const lessons = plan ? (await api.loadTheoryControl(plan.id)).flatMap((subject) => subject.lessons).filter((lesson) => lesson.published && (lesson.flashcardCards ?? []).length > 0) : [];
  const personalDecks = await api.listPersonalFlashcardDecks();
  const catalog = await api.loadLibraryFlashcardCatalog();
  const libraryDecks = catalog.subjects.flatMap((subject) => subject.decks.map((deck) => ({ deck, subject: subject.name })));
  const [lessonReviews, libraryReviews, personalReviews] = await Promise.all([
    api.loadFlashcardReviewsForLessons(lessons.map((lesson) => lesson.id)),
    api.loadLibraryFlashcardReviews(libraryDecks.map(({ deck }) => deck.id)),
    api.loadPersonalFlashcardReviews(personalDecks.map((deck) => deck.id)),
  ]);
  const decks: FlashcardStatisticsDeck[] = [
    ...libraryDecks.map(({ deck, subject }) => ({ id: deck.id, source: "Biblioteca editorial" as const, subject, cards: libraryDeckCards(deck), reviews: libraryReviews.filter((review) => review.deckId === deck.id).map(lessonReviewFromLibrary) })),
    ...lessons.map((lesson) => ({ id: lesson.id, source: "Aulas do professor" as const, subject: lesson.subject, cards: lesson.flashcardCards ?? [], reviews: lessonReviews.filter((review) => review.lessonId === lesson.id) })),
    ...personalDecks.map((deck) => ({ id: deck.id, source: "Meus decks" as const, subject: deck.subject, cards: deck.cards, reviews: personalReviews.filter((review) => review.deckId === deck.id).map((review): FlashcardReview => ({ ...review, lessonId: review.deckId })) })),
  ];
  return buildFlashcardStatistics(decks);
}

type LoaderData = Awaited<ReturnType<typeof flashcardStatisticsLoader>>;
const ANSWER_COLORS = { correct: "#21A179", doubt: "#D99B27", errors: "#E65353" } as const;

export function FlashcardStatistics() {
  const stats = useLoaderData() as LoaderData;
  const answered = stats.answers.correct + stats.answers.doubt + stats.answers.errors;
  return (
    <>
      <PageHeader title="Estatísticas dos flashcards" description="Memorização, revisões e desempenho por disciplina" />
      <ContentBody>
        <Button component={Link} to={ROUTES.student.flashcards} startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2 }}>Voltar aos decks</Button>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" }, gap: 1.5, mb: 2 }}>
          {[
            ["Cartões disponíveis", stats.cards],
            ["Cartões estudados", stats.studied],
            ["Respostas registradas", stats.totalReviews],
            ["Retenção atual", stats.retention === null ? "—" : `${stats.retention}%`],
          ].map(([label, value]) => <Card key={label} title={String(value)} sub={String(label)}><Box /></Card>)}
        </Box>

        {stats.studied === 0 ? <Empty icon="📊">Estude alguns cartões para formar suas primeiras estatísticas.</Empty> : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.1fr .9fr" }, gap: 2 }}>
            <Card title="Última resposta por cartão" sub="Mostra como cada cartão foi classificado na revisão mais recente">
              <Box sx={{ display: "flex", height: 18, borderRadius: 10, overflow: "hidden", my: 2, backgroundColor: "action.hover" }}>
                {answered > 0 && Object.entries(stats.answers).map(([key, value]) => <Box key={key} sx={{ width: `${value / answered * 100}%`, backgroundColor: ANSWER_COLORS[key as keyof typeof ANSWER_COLORS] }} />)}
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                {[["Acertei", stats.answers.correct, ANSWER_COLORS.correct], ["Dúvida", stats.answers.doubt, ANSWER_COLORS.doubt], ["Errei", stats.answers.errors, ANSWER_COLORS.errors]].map(([label, value, color]) => <Box key={String(label)} sx={{ p: 1.5, borderRadius: 2, backgroundColor: "action.hover" }}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography variant="h6" sx={{ color: String(color), fontWeight: 800 }}>{value}</Typography>
                </Box>)}
              </Box>
            </Card>

            <Card title="Situação da memória" sub="Fila calculada pela repetição espaçada">
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mt: 1 }}>
                {[["Novos", stats.memory.fresh], ["Aprendendo", stats.memory.learning], ["Para revisar", stats.memory.due], ["Consolidados", stats.memory.consolidated]].map(([label, value]) => <Box key={String(label)} sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{value}</Typography>
                </Box>)}
              </Box>
            </Card>

            <Card title="Desempenho por disciplina" sub="Percentual de cartões lembrados entre os cartões já estudados">
              <Box sx={{ display: "grid", gap: 1.75, mt: 1 }}>
                {stats.bySubject.filter((item) => item.studied > 0).map((item) => <Box key={item.subject}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.subject}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.score}%</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={item.score ?? 0} color={(item.score ?? 0) >= 80 ? "success" : (item.score ?? 0) >= 60 ? "warning" : "error"} sx={{ height: 8, borderRadius: 5 }} />
                  <Typography variant="caption" color="text.secondary">{item.studied} de {item.cards} cartões estudados</Typography>
                </Box>)}
              </Box>
            </Card>

            <Card title="Origem dos decks" sub="Conteúdo oficial e pessoal permanecem separados">
              <Box sx={{ display: "grid", gap: 1, mt: 1 }}>
                {stats.bySource.map((item) => <Box key={item.source} sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 1, p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                  <Box><Typography variant="body2" sx={{ fontWeight: 800 }}>{item.source}</Typography><Typography variant="caption" color="text.secondary">{item.decks} decks · {item.cards} cartões</Typography></Box>
                  <Box sx={{ textAlign: "right" }}><Typography sx={{ fontWeight: 800 }}>{item.studied}</Typography><Typography variant="caption" color="text.secondary">estudados</Typography></Box>
                </Box>)}
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2, color: "text.secondary" }}><AutoGraphIcon fontSize="small" /><Typography variant="caption">As estatísticas usam a última classificação e o histórico acumulado de respostas.</Typography></Box>
            </Card>
          </Box>
        )}
      </ContentBody>
    </>
  );
}
