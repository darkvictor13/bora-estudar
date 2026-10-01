import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassIcon from "@mui/icons-material/HourglassEmptyOutlined";
import MenuBookIcon from "@mui/icons-material/MenuBookOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Card } from "@bora/ui";
import { useMemo, useState } from "react";

import {
  LAW_EXAM_MAPS,
  filterLawExamMap,
  getLawExamMap,
  getLawExamMapStats,
} from "@/lib/domain/law-exam-maps";

interface LawExamMapsProps {
  readonly selectedMapId: string | null;
  readonly onSelectMap: (id: string) => void;
}

export function LawExamMaps({ selectedMapId, onSelectMap }: LawExamMapsProps) {
  const [query, setQuery] = useState("");
  const selected = getLawExamMap(selectedMapId);
  const stats = getLawExamMapStats(selected);
  const sections = useMemo(() => filterLawExamMap(selected, query), [query, selected]);

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box
        component="nav"
        aria-label="Concursos do Vade Mecum"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1.25 }}
      >
        {LAW_EXAM_MAPS.map((map) => {
          const mapStats = getLawExamMapStats(map);
          const active = map.id === selected.id;
          return (
            <Box
              component="button"
              type="button"
              key={map.id}
              onClick={() => onSelectMap(map.id)}
              aria-current={active ? "page" : undefined}
              sx={(theme) => ({
                cursor: "pointer",
                minWidth: 0,
                p: 1.75,
                textAlign: "left",
                color: "text.primary",
                borderRadius: `${theme.brand.radius.md}px`,
                border: `1px solid ${active ? theme.vars.palette.primary.main : theme.vars.palette.surface.border}`,
                background: active
                  ? `linear-gradient(135deg, ${theme.vars.palette.accent.primarySoft}, ${theme.vars.palette.surface.raised})`
                  : theme.vars.palette.surface.raised,
                boxShadow: active ? theme.vars.palette.elevation.lg : theme.vars.palette.elevation.sm,
                transition: "transform 160ms ease, border-color 160ms ease",
                "&:hover": { transform: "translateY(-2px)", borderColor: theme.vars.palette.primary.main },
              })}
            >
              <Typography sx={{ color: "primary.main", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.1em" }}>{map.shortName}</Typography>
              <Typography sx={{ mt: 0.35, fontWeight: 850, lineHeight: 1.25 }}>{map.title}</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.75, fontSize: "0.76rem" }}>{mapStats.available} de {mapStats.total} normas já disponíveis</Typography>
              <LinearProgress variant="determinate" value={mapStats.coverage} sx={{ mt: 1.1, height: 5, borderRadius: 999 }} />
            </Box>
          );
        })}
      </Box>

      <Card title={selected.title} sub={`${selected.accent} · mapa histórico do edital`}>
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" }, gap: 1.25, alignItems: "center" }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              <Chip icon={<MenuBookIcon />} label={`${stats.total} normas e documentos`} size="small" variant="outlined" />
              <Chip icon={<CheckCircleIcon />} label={`${stats.available} disponíveis`} size="small" color="success" variant="outlined" />
              <Chip icon={<HourglassIcon />} label={`${stats.pending} para integrar`} size="small" variant="outlined" />
            </Box>
            <TextField
              size="small"
              placeholder="Buscar no mapa"
              aria-label="Buscar norma no mapa"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              sx={{ width: { xs: "100%", md: 280 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
            />
          </Box>

          <Alert status="info">Este mapa preserva o recorte do edital. O texto integral fica em uma única biblioteca e pode receber atualizações sem apagar o conteúdo histórico cobrado.</Alert>

          {sections.length === 0 && (
            <Box sx={{ p: 3, textAlign: "center", border: 1, borderColor: "divider", borderRadius: 2 }}>
              <Typography color="text.secondary">Nenhuma norma encontrada neste mapa.</Typography>
            </Box>
          )}

          {sections.map((section) => (
            <Box key={section.title} component="section" sx={{ display: "grid", gap: 0.75 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 0.25 }}>
                <Typography sx={{ fontSize: "0.8rem", fontWeight: 900, letterSpacing: "0.055em", textTransform: "uppercase" }}>{section.title}</Typography>
                <Chip label={section.items.length} size="small" sx={{ height: 22, fontWeight: 800 }} />
              </Box>
              <Box sx={{ display: "grid", gap: 0.65 }}>
                {section.items.map((item) => (
                  <Box
                    key={`${section.title}-${item.canonicalId}`}
                    sx={(theme) => ({
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
                      alignItems: "center",
                      gap: 1.25,
                      p: 1.35,
                      borderRadius: `${theme.brand.radius.sm}px`,
                      border: `1px solid ${item.available ? theme.vars.palette.primary.main : theme.vars.palette.surface.border}`,
                      backgroundColor: item.available ? theme.vars.palette.accent.primarySoft : theme.vars.palette.surface.sunken,
                      boxShadow: item.available ? `inset 3px 0 0 ${theme.vars.palette.primary.main}` : "none",
                    })}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
                        <Typography sx={{ fontSize: "0.9rem", fontWeight: 850 }}>{item.title}</Typography>
                        <Typography sx={{ color: "text.secondary", fontFamily: "DM Mono, monospace", fontSize: "0.66rem" }}>{item.canonicalId}</Typography>
                      </Box>
                      <Typography color="text.secondary" sx={{ mt: 0.4, fontSize: "0.78rem", lineHeight: 1.45 }}><strong>Recorte:</strong> {item.scope}</Typography>
                    </Box>
                    {item.libraryId ? (
                      <Button component="a" href={`/aluno/leis?lei=${item.libraryId}`} size="small" variant="contained" startIcon={<MenuBookIcon />}>Ler lei</Button>
                    ) : (
                      <Chip label="Texto a integrar" size="small" icon={<HourglassIcon />} variant="outlined" />
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Card>
    </Box>
  );
}
