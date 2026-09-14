import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { api } from "@/lib/api";
import { applyTheme, writeLocalTheme, type Theme } from "@/lib/theme";

/**
 * Alterna o tema da conta.
 *
 * `<button type="button">` com `onClick`, e não um `<form>` com submit: a
 * sidebar já tem um submit — o "Sair" —, e um segundo aqui tornaria ambíguo
 * todo seletor de formulário escopado na sidebar.
 *
 * A troca é OTIMISTA: aplica na tela e no aparelho, depois grava. Se a
 * gravação recusar, a escolha continua valendo aqui e a mensagem diz
 * exatamente isso — o modo de falha que não se aceita é o silencioso, em que a
 * pessoa acha que escolheu e no outro aparelho volta o claro sem explicação
 * (R-TEMA-12).
 */
export function ThemeToggle({
  profileId,
  initial,
  collapsed = false,
}: {
  profileId: string;
  initial: Theme;
  collapsed?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [unsaved, setUnsaved] = useState(false);

  async function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";

    setTheme(next);
    applyTheme(next);
    writeLocalTheme(profileId, next);
    setUnsaved(false);

    const result = await api.saveThemePreference(next);
    if (!result.ok) setUnsaved(true);
  }

  const label = theme === "dark" ? "Tema claro" : "Tema escuro";
  const icon = theme === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />;

  return (
    <Box data-testid="theme-toggle">
      {collapsed ? (
        <Tooltip title={label} placement="right">
          <IconButton type="button" aria-label={label} onClick={toggle} sx={{ width: "100%" }}>
            {icon}
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          type="button"
          variant="text"
          size="small"
          fullWidth
          startIcon={icon}
          onClick={toggle}
          sx={{ justifyContent: "flex-start" }}
        >
          {label}
        </Button>
      )}

      {unsaved && (
        <Typography
          variant="caption"
          component="p"
          role="status"
          data-testid="theme-unsaved"
          sx={{ mt: 0.5 }}
        >
          Tema aplicado neste aparelho. Não foi possível salvar na sua conta.
        </Typography>
      )}
    </Box>
  );
}
