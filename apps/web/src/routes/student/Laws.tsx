import GavelIcon from "@mui/icons-material/GavelOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Card, PageHeader } from "@bora/ui";
import { useMemo, useState } from "react";
import { useLoaderData, useSearchParams, type LoaderFunctionArgs } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { LawExamMaps } from "@/components/student/LawExamMaps";
import { LawContinuousReader } from "@/components/student/LawContinuousReader";
import {
  LAW_LIBRARY,
  LAW_SUBJECTS,
  loadLawDocument,
  searchLaws,
  type LawArticle,
  type LawEntry,
} from "@/lib/domain/law-library";
import { requireStudentAccess } from "@/lib/auth/session";

export async function lawsLoader({ request }: LoaderFunctionArgs) {
  const session = await requireStudentAccess();
  const query = new URL(request.url).searchParams;
  const fallback = LAW_LIBRARY[0];
  if (!fallback) throw new Error("A biblioteca de leis está vazia.");
  const law = LAW_LIBRARY.find((entry) => entry.id === query.get("lei")) ?? fallback;
  const document = await loadLawDocument(law);
  return { law, document, profileId: session.profileId };
}

type LoaderData = Awaited<ReturnType<typeof lawsLoader>>;

function LawLibraryNav({
  selected,
  onSelect,
}: {
  selected: LawEntry;
  onSelect: (law: LawEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const matches = useMemo(() => searchLaws(query, subject), [query, subject]);

  return (
    <Card title="Biblioteca" sub={`${LAW_LIBRARY.length} leis · primeiro lote`}>
      <Box sx={{ display: "grid", gap: 1.5 }}>
        <TextField
          size="small"
          placeholder="Buscar lei ou número"
          aria-label="Buscar lei ou número"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <Box component="nav" aria-label="Matérias do Vade Mecum" sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          <Chip label={`Todas (${LAW_LIBRARY.length})`} size="small" color={!subject ? "primary" : "default"} variant={!subject ? "filled" : "outlined"} onClick={() => setSubject("")} />
          {LAW_SUBJECTS.map((name) => (
            <Chip
              key={name}
              label={`${name} (${LAW_LIBRARY.filter((law) => law.subject === name).length})`}
              size="small"
              color={subject === name ? "primary" : "default"}
              variant={subject === name ? "filled" : "outlined"}
              onClick={() => setSubject(name)}
              sx={{ maxWidth: "100%", height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.45 } }}
            />
          ))}
        </Box>
        <Divider />
        <Box component="nav" aria-label="Leis disponíveis" sx={{ display: "grid", gap: 0.65, maxHeight: { lg: "40vh" }, overflowY: { lg: "auto" }, pr: { lg: 0.5 } }}>
          {matches.length === 0 && <Typography color="text.secondary" variant="body2">Nenhuma lei encontrada.</Typography>}
          {matches.map((law) => (
            <Box
              component="button"
              type="button"
              key={law.id}
              onClick={() => onSelect(law)}
              aria-current={selected.id === law.id ? "page" : undefined}
              sx={(theme) => ({
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                p: 1.2,
                borderRadius: `${theme.brand.radius.sm}px`,
                border: `1px solid ${selected.id === law.id ? theme.vars.palette.primary.main : theme.vars.palette.surface.border}`,
                backgroundColor: selected.id === law.id ? theme.vars.palette.accent.primarySoft : theme.vars.palette.surface.sunken,
                color: "text.primary",
                boxShadow: selected.id === law.id ? `inset 3px 0 0 ${theme.vars.palette.primary.main}` : "none",
                transition: "border-color 150ms, background-color 150ms",
                "&:hover": { borderColor: theme.vars.palette.primary.main },
              })}
            >
              <Typography sx={{ fontSize: "0.78rem", fontWeight: 800, lineHeight: 1.3 }}>{law.title}</Typography>
              <Typography sx={{ mt: 0.3, fontSize: "0.7rem", color: "text.secondary" }}>{law.norm} · {law.articleCount} artigos</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Card>
  );
}

function ArticleNav({
  articles,
  selected,
  onSelect,
}: {
  articles: readonly LawArticle[];
  selected: LawArticle;
  onSelect: (article: LawArticle) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = articles.filter((article) =>
    `${article.label} ${article.section}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")),
  );
  return (
    <Card title="Artigos" sub={`${articles.length} no texto integral`}>
      <TextField
        size="small"
        fullWidth
        placeholder="Buscar artigo"
        aria-label="Buscar artigo"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        sx={{ mb: 1.25 }}
      />
      <Box component="nav" aria-label="Artigos da lei" sx={{ display: "grid", gap: 0.4, maxHeight: { lg: "calc(100vh - 210px)" }, overflowY: { lg: "auto" } }}>
        {matches.map((article) => (
          <Button
            key={article.id}
            size="small"
            color={selected.id === article.id ? "primary" : "inherit"}
            variant={selected.id === article.id ? "contained" : "text"}
            onClick={() => onSelect(article)}
            aria-current={selected.id === article.id ? "location" : undefined}
            sx={{ justifyContent: "flex-start", textAlign: "left", fontWeight: selected.id === article.id ? 800 : 600, minHeight: 32 }}
          >
            {article.label}
          </Button>
        ))}
        {matches.length === 0 && <Typography variant="body2" color="text.secondary">Nenhum artigo encontrado.</Typography>}
      </Box>
    </Card>
  );
}

export function Laws() {
  const { law, document, profileId } = useLoaderData() as LoaderData;
  const [params, setParams] = useSearchParams();
  const view = params.get("visao") === "mapas" ? "exam" : "text";
  const requestedArticle = params.get("artigo");
  const [activeArticleId, setActiveArticleId] = useState<string | null>(requestedArticle);
  const article = document.articles.find((item) => item.id === activeArticleId) ?? document.articles[0];

  const selectLaw = (entry: LawEntry) => {
    const next = new URLSearchParams(params);
    next.set("lei", entry.id);
    next.delete("artigo");
    next.delete("visao");
    setParams(next);
    setActiveArticleId(null);
  };
  const selectArticle = (entry: LawArticle) => {
    setActiveArticleId(entry.id);
    const next = new URLSearchParams(params);
    next.set("artigo", entry.id);
    setParams(next, { preventScrollReset: true });
    window.document.getElementById(entry.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const selectView = (nextView: "text" | "exam") => {
    const next = new URLSearchParams(params);
    if (nextView === "exam") next.set("visao", "mapas");
    else next.delete("visao");
    setParams(next, { preventScrollReset: true });
  };
  const selectMap = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("visao", "mapas");
    next.set("mapa", id);
    setParams(next, { preventScrollReset: true });
  };

  if (!article) throw new Error(`Nenhum artigo encontrado em ${law.title}.`);

  return (
    <>
      <PageHeader title="Vade Mecum Policial" description="Leis organizadas por matéria e artigo para apoiar as aulas presenciais" />
      <ContentBody>
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Box sx={(theme) => ({
            p: { xs: 2, md: 2.5 },
            borderRadius: `${theme.brand.radius.lg}px`,
            border: `1px solid ${theme.vars.palette.surface.border}`,
            backgroundImage: `linear-gradient(115deg, ${theme.vars.palette.accent.primarySoft}, ${theme.vars.palette.surface.raised})`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          })}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <GavelIcon color="primary" sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="h2">Primeiro lote de leis</Typography>
                <Typography color="text.secondary" variant="body2">{LAW_LIBRARY.length} normas · leitura por artigo · fonte oficial em cada lei</Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button size="small" variant={view === "text" ? "contained" : "outlined"} onClick={() => selectView("text")}>Lei seca</Button>
              <Button size="small" variant={view === "exam" ? "contained" : "outlined"} onClick={() => selectView("exam")}>Mapas de edital</Button>
            </Box>
          </Box>
          {view === "exam" ? (
            <LawExamMaps selectedMapId={params.get("mapa")} onSelectMap={selectMap} />
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "260px 170px minmax(0, 1fr)" }, alignItems: "start", gap: 1.5 }}>
              <Box sx={{ position: { lg: "sticky" }, top: { lg: 104 }, maxHeight: { lg: "calc(100vh - 112px)" }, overflowY: { lg: "auto" } }}>
                <LawLibraryNav selected={law} onSelect={selectLaw} />
              </Box>
              <Box sx={{ position: { lg: "sticky" }, top: { lg: 104 }, maxHeight: { lg: "calc(100vh - 112px)" } }}>
                <ArticleNav key={law.id} articles={document.articles} selected={article} onSelect={selectArticle} />
              </Box>
              <LawContinuousReader key={law.id} law={law} document={document} profileId={profileId} requestedArticleId={requestedArticle} onActiveArticle={setActiveArticleId} />
            </Box>
          )}
        </Box>
      </ContentBody>
    </>
  );
}
