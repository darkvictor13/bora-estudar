import BackspaceIcon from "@mui/icons-material/BackspaceOutlined";
import BorderColorIcon from "@mui/icons-material/BorderColorOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import CropSquareIcon from "@mui/icons-material/CropSquareOutlined";
import FormatStrikethroughIcon from "@mui/icons-material/FormatStrikethroughOutlined";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlinedOutlined";
import MouseIcon from "@mui/icons-material/MouseOutlined";
import UndoIcon from "@mui/icons-material/UndoOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { useState, type ReactNode } from "react";

import { MARK_COLORS, type MarkColor, type MarkStyle, type TextMark } from "@/lib/domain/text-markings";

/**
 * A barra de marcação da lei seca e do cartão (specs 40 e 42): as quatro
 * ferramentas, as sete cores, apagar e desfazer. Quem a usa guarda as
 * marcações; a barra só diz o que aplicar.
 */
interface Props {
  /** Quantos trechos estão selecionados agora. */
  readonly selectionCount: number;
  readonly canUndo: boolean;
  /** A dica do botão de seleção — "Selecione um trecho da lei". */
  readonly selectHint: string;
  readonly onPaint: (style: MarkStyle, color: MarkColor) => void;
  readonly onErase: () => void;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
  readonly sx?: SxProps<Theme>;
}

const TOOLS: readonly { style: MarkStyle; label: string; icon: ReactNode }[] = [
  { style: "highlight", label: "Marca-texto", icon: <BorderColorIcon fontSize="small" /> },
  { style: "underline", label: "Sublinhar", icon: <FormatUnderlinedIcon fontSize="small" /> },
  { style: "strike", label: "Tachar", icon: <FormatStrikethroughIcon fontSize="small" /> },
  { style: "outline", label: "Contornar", icon: <CropSquareIcon fontSize="small" /> },
];

const COLOR_LABELS: Readonly<Record<MarkColor, string>> = {
  yellow: "Amarelo",
  mint: "Verde",
  blue: "Azul",
  pink: "Rosa",
  lilac: "Lilás",
  peach: "Pêssego",
  salmon: "Salmão",
};

/** Como um trecho marcado é pintado. Cor fixa: o fundo do papel é sempre claro. */
export function markSx(mark: Pick<TextMark, "style" | "color"> | null) {
  if (!mark) return undefined;
  const color = MARK_COLORS[mark.color];
  switch (mark.style) {
    case "highlight": return { backgroundColor: color, color: "#18201e", borderRadius: "2px" };
    case "underline": return { textDecoration: `underline 3px ${color}`, textUnderlineOffset: "3px" };
    case "strike": return { textDecoration: `line-through 2px ${color}` };
    case "outline": return { boxShadow: `inset 0 0 0 2px ${color}`, borderRadius: "3px" };
  }
}

export function MarkingToolbar({ selectionCount, canUndo, selectHint, onPaint, onErase, onUndo, onDismiss, sx }: Props) {
  const [style, setStyle] = useState<MarkStyle>("highlight");
  const [color, setColor] = useState<MarkColor>("yellow");
  const hasSelection = selectionCount > 0;

  return (
    <Box
      // Apertar um botão da barra não pode desfazer a seleção do texto.
      onMouseDown={(event) => event.preventDefault()}
      aria-label="Ferramentas de marcação"
      sx={[(theme) => ({
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.4,
        p: 0.8, border: `1px solid ${theme.vars.palette.surface.border}`,
        borderRadius: `${theme.brand.radius.md}px`,
        backgroundColor: theme.vars.palette.surface.raised,
      }), ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <Tooltip title={selectHint}><IconButton size="small" aria-label="Selecionar texto" onClick={onDismiss}><MouseIcon fontSize="small" /></IconButton></Tooltip>
      {TOOLS.map((tool) => (
        <Tooltip key={tool.style} title={tool.label}>
          <span><IconButton size="small" aria-label={tool.label} aria-pressed={style === tool.style} disabled={!hasSelection} onClick={() => { setStyle(tool.style); onPaint(tool.style, color); }} sx={{ backgroundColor: style === tool.style ? "action.selected" : undefined }}>{tool.icon}</IconButton></span>
        </Tooltip>
      ))}
      <Tooltip title="Apagar marcação do trecho"><span><IconButton size="small" aria-label="Apagar marcação" disabled={!hasSelection} onClick={onErase}><BackspaceIcon fontSize="small" /></IconButton></span></Tooltip>
      <Box aria-hidden="true" sx={{ width: "1px", flex: "0 0 1px", height: 25, backgroundColor: "divider", mx: 0.4 }} />
      {(Object.keys(MARK_COLORS) as MarkColor[]).map((tone) => (
        <Tooltip key={tone} title={COLOR_LABELS[tone]}>
          <span><IconButton
            size="small"
            aria-label={`Marcar em ${COLOR_LABELS[tone].toLowerCase()}`}
            aria-pressed={color === tone}
            onClick={() => { setColor(tone); if (hasSelection) onPaint(style, tone); }}
            sx={{ p: 0.35, border: color === tone ? "2px solid" : "2px solid transparent", borderColor: color === tone ? "text.primary" : "transparent" }}
          ><Box sx={{ width: 18, height: 18, borderRadius: "50%", backgroundColor: MARK_COLORS[tone], border: "1px solid rgba(0,0,0,0.12)" }} /></IconButton></span>
        </Tooltip>
      ))}
      <Tooltip title="Desfazer última marcação"><span><IconButton size="small" aria-label="Desfazer marcação" disabled={!canUndo} onClick={onUndo}><UndoIcon fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Limpar seleção"><span><IconButton size="small" aria-label="Limpar seleção" disabled={!hasSelection} onClick={onDismiss}><CloseIcon fontSize="small" /></IconButton></span></Tooltip>
      <Typography variant="caption" color="text.secondary" sx={{ ml: "auto", px: 0.6 }}>
        {hasSelection ? `${selectionCount} trecho${selectionCount > 1 ? "s" : ""} selecionado${selectionCount > 1 ? "s" : ""}` : "Selecione um trecho para marcar"}
      </Typography>
    </Box>
  );
}
