import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "react-router";
import { Badge, Card } from "@bora/ui";

import { PMPR_SOLDADO_2025 } from "@/lib/domain/pmpr-soldado";
import { ROUTES } from "@/lib/routes";

export function PmprPilot() {
  const general = PMPR_SOLDADO_2025.subjects.filter(
    (subject) => subject.group === "Conhecimentos gerais",
  );
  const specific = PMPR_SOLDADO_2025.subjects.filter(
    (subject) => subject.group === "Conhecimentos específicos",
  );

  return (
    <Box sx={{ mb: 2 }} data-testid="pmpr-pilot">
      <Card
        title="Trilha piloto · Soldado PMPR"
        sub="Base do edital para organizar as aulas presenciais"
        action={<Badge tone="accent">Em preparação</Badge>}
      >
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 220 }}>
            {PMPR_SOLDADO_2025.subjects.length} matérias no edital de referência. O professor
            definirá a sequência das aulas e publicará os materiais para os alunos vinculados.
          </Typography>
          <Button component={RouterLink} to={ROUTES.teacher.theory} size="small" variant="contained">
            Preparar aulas
          </Button>
          <Button
            component="a"
            href={PMPR_SOLDADO_2025.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            variant="outlined"
          >
            Conferir edital oficial
          </Button>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5, mb: 2 }}>
          <Box sx={(theme) => ({
            p: 1.5,
            border: `1px solid ${theme.vars.palette.surface.borderStrong}`,
            borderRadius: `${theme.brand.radius.md}px`,
            backgroundColor: theme.vars.palette.surface.sunken,
          })}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>Conhecimentos gerais</Typography>
            <Typography variant="caption">40 questões · 1 ponto cada</Typography>
          </Box>
          <Box sx={(theme) => ({
            p: 1.5,
            border: `1px solid ${theme.vars.palette.surface.borderStrong}`,
            borderRadius: `${theme.brand.radius.md}px`,
            backgroundColor: theme.vars.palette.surface.sunken,
          })}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>Conhecimentos específicos</Typography>
            <Typography variant="caption">20 questões · 2 pontos cada</Typography>
          </Box>
        </Box>

        {[{ title: "Conhecimentos gerais", subjects: general }, { title: "Conhecimentos específicos", subjects: specific }].map((section) => (
          <Box key={section.title} sx={{ mb: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.75 }}>
              {section.title}
            </Typography>
            {section.subjects.map((subject) => (
              <Accordion key={subject.name} disableGutters sx={{ mb: 0.75, borderRadius: 1, overflow: "hidden" }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{subject.name}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                    {subject.topics.map((topic) => (
                      <Typography component="li" variant="body2" key={topic} sx={{ mb: 0.5 }}>
                        {topic}
                      </Typography>
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        ))}

        <Typography variant="caption" color="text.secondary">
          Recorte editorial do {PMPR_SOLDADO_2025.reference}. As leis estaduais terão fonte
          oficial do Paraná; os textos federais, fonte oficial do Planalto. A incidência e
          os materiais serão vinculados a cada aula após a revisão do professor.
        </Typography>
      </Card>
    </Box>
  );
}
