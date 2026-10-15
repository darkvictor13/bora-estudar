import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import MuiLink from "@mui/material/Link";
import { Card, Empty, PageHeader } from "@bora/ui";
import { SummaryPaper } from "./SummaryPaper";
import { summarySections } from "@/lib/domain/summary-sections";
import { ContentBody } from "@/components/AppShell";
import { ROUTES } from "@/lib/routes";
import type { SummaryDocument, SummaryTopic, SummaryNote } from "@/lib/api";

const href = (id: string) => `${ROUTES.student.flashSummaries}?resumo=${encodeURIComponent(id)}`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function SummaryLibrary({ topics }: { topics: SummaryTopic[] }) {
  const [query, setQuery] = useState("");
  const subjects = [...new Set(topics.map(topic => topic.subject))];
  const filtered = topics.filter(topic => normalize(`${topic.subject} ${topic.title}`).includes(normalize(query.trim())));
  // O material é uma carga manual e pessoal: ambiente sem a carga não tem tópico.
  if (!topics.length) return <Card title="Biblioteca PF 2029">
    <Empty>Nenhum resumo foi carregado neste ambiente ainda. Quando o material for importado, os tópicos aparecem aqui.</Empty>
  </Card>;
  return <Card title="Escolha uma disciplina" sub={`${subjects.length} seções · ${topics.length} tópicos disponíveis`}>
    <TextField fullWidth label="Buscar tópico ou disciplina" size="small" value={query} onChange={event => setQuery(event.target.value)} sx={{ mb: 2 }} />
    <Box sx={{ display: "grid", gap: 1 }}>
      {subjects.map(subject => {
        const items = filtered.filter(topic => topic.subject === subject);
        if (!items.length) return null;
        return <Box key={subject} component="details" {...(query.trim() ? { open: true } : {})} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
          <Box component="summary" sx={{ cursor: "pointer", p: 1.75, fontWeight: 750, bgcolor: "action.hover", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}>
            {subject}<Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1.5, fontWeight: 400 }}>{items.length} {items.length === 1 ? "tópico" : "tópicos"}</Typography>
          </Box>
          <Box component="nav" aria-label={`Resumos de ${subject}`} sx={{ display: "grid" }}>
            {items.map(topic => <Button key={topic.id} component={Link} to={href(topic.id)} color="inherit" variant="text" sx={{ justifyContent: "space-between", textAlign: "left", gap: 2, px: 2, py: 1.5, borderRadius: 0, borderTop: "1px solid", borderColor: "divider", overflowWrap: "anywhere" }}>
              {topic.title}<Box component="span" aria-hidden="true" sx={{ color: "primary.main", flexShrink: 0 }}>→</Box>
            </Button>)}
          </Box>
        </Box>;
      })}
    </Box>
    {!filtered.length && <Empty>Nenhum tópico corresponde à busca.</Empty>}
  </Card>;
}

export function SummaryReader({ document, topics, initialNotes }: { document: SummaryDocument; topics: SummaryTopic[]; initialNotes: SummaryNote[] }) {
  const navigate = useNavigate();
  const siblings = topics.filter(topic => topic.subject === document.subject);
  const index = siblings.findIndex(topic => topic.id === document.id);
  const sections = summarySections(document.blocks);
  const [topicQuery, setTopicQuery] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const reader = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusMode || !reader.current) return;
    const hidden: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = reader.current;
    while (branch.parentElement && branch !== window.document.body) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          hidden.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
    }
    return () => { for (const item of hidden) item.element.inert = item.inert; };
  }, [focusMode]);
  return <Box ref={reader} data-summary-focus-scroll={focusMode ? "true" : undefined} sx={focusMode ? { position: "fixed", inset: 0, zIndex: 1201, overflowY: "auto", bgcolor: "background.default" } : undefined}>
    <Box sx={{ display: focusMode ? "none" : "block", "& [data-testid='page-header']": { position: "relative" } }}>
      <PageHeader title={document.title} description={document.subject} actions={<Button component={Link} to={ROUTES.student.flashSummaries} variant="outlined">Todos os resumos</Button>} />
    </Box>
    <ContentBody>
      <Typography variant="caption" component="nav" aria-label="Caminho do resumo" sx={{ display: focusMode ? "none" : "block", mb: 2, overflowWrap: "anywhere" }}>
        <MuiLink component={Link} to={ROUTES.student.flashSummaries} color="inherit" underline="hover">Resumos Flash</MuiLink>{" › "}{document.subject}{" › "}{document.title}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: focusMode ? "minmax(0, 1fr)" : "260px minmax(0, 1fr)" }, gap: 2, alignItems: "start", maxWidth: focusMode ? 1200 : "none", mx: focusMode ? "auto" : 0 }}>
        <Card title="Navegar no material" sx={{ display: focusMode ? "none" : "block", position: { xl: "sticky" }, top: 72, maxHeight: { xl: "calc(100dvh - 90px)" }, overflowY: "auto" }}>
          <TextField select fullWidth size="small" label="Escolher tópico" value={document.id} onChange={event => navigate(href(event.target.value))} sx={{ display: { xs: "block", xl: "none" } }}>
            {siblings.map(topic => <MenuItem key={topic.id} value={topic.id}>{topic.title}</MenuItem>)}
          </TextField>
          <Box component="nav" aria-label="Tópicos dos resumos" sx={{ display: { xs: "none", xl: "grid" }, gap: 0.5 }}>
            <TextField fullWidth size="small" label="Buscar assunto" value={topicQuery} onChange={event => setTopicQuery(event.target.value)} sx={{ mb: 1 }} />
            {siblings.filter(topic => normalize(topic.title).includes(normalize(topicQuery))).map(topic => <Box key={topic.id}>
              <Button component={Link} to={href(topic.id)} variant={topic.id === document.id ? "contained" : "text"} aria-current={topic.id === document.id ? "page" : undefined} sx={{ width: "100%", justifyContent: "start", textAlign: "left", overflowWrap: "anywhere" }}>{topic.title}</Button>
              {topic.id === document.id && <Box component="nav" aria-label="Subtópicos deste resumo" sx={{ ml: 1.5, pl: 1, my: 1, borderLeft: "2px solid", borderColor: "primary.border", display: "grid", gap: 0.5 }}>
                {sections.map((section, sectionIndex) => <Button key={section.start} color="inherit" variant="text" size="small" onClick={() => window.document.getElementById(`summary-section-${section.start}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} sx={{ justifyContent: "start", textAlign: "left", fontWeight: 400, fontSize: ".75rem", gap: 1 }}>
                  <Box component="span" sx={{ color: "text.secondary", flexShrink: 0 }}>{String(sectionIndex + 1).padStart(2, "0")}</Box>{section.title}
                </Button>)}
              </Box>}
            </Box>)}
          </Box>
        </Card>
        <Box>
          <SummaryPaper document={document} initialNotes={initialNotes} focusMode={focusMode} onToggleFocus={() => setFocusMode(value => !value)} />
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "space-between", mt: 3 }}>
            {siblings[index - 1] && <Button component={Link} to={href(siblings[index - 1]!.id)}>Tópico anterior</Button>}
            {siblings[index + 1] && <Button component={Link} to={href(siblings[index + 1]!.id)}>Próximo tópico</Button>}
          </Box>
        </Box>
      </Box>
    </ContentBody>
  </Box>;
}
