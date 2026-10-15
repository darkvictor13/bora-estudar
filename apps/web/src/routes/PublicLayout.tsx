import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import PauseIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrowOutlined";
import { useState } from "react";
import { Outlet } from "react-router";

import { AuthBackdrop } from "@/components/auth/AuthBackdrop";
import { getSessionContext } from "@/lib/auth/session";
import { forgetTheme } from "@/lib/theme";

/**
 * Sem sessão a preferência da conta é limpa, e o tema é o `light` de
 * R-TEMA-14. As telas públicas NÃO têm escopo de tema próprio: seguem o
 * `data-theme` do `<html>` como o resto do app, e o vidro existe nos dois temas.
 *
 * Quem sai pelo botão já teve a cópia local apagada, e quem esbarra numa rota
 * protegida passa por `requireSession`. Sobra um caso: a sessão vence com a
 * aba fechada e a pessoa volta direto para `/entrar`. Nenhum loader protegido
 * roda nesse caminho, então é aqui que a cópia órfã morre.
 */
export async function publicLayoutLoader() {
  if (!(await getSessionContext())) forgetTheme();
  return null;
}

/** Cartão de acesso centralizado, em vidro, com luzes de marca animadas ao fundo. */
export function PublicLayout() {
  const [paused, setPaused] = useState(false);
  return (
    <Box
      data-testid="auth-overlay"
      sx={(theme) => ({
        minHeight: "100vh",
        position: "relative",
        isolation: "isolate",
        display: "grid",
        placeItems: "center",
        p: 4,
        overflow: "auto",
        backgroundColor: theme.vars.palette.surface.base,
        color: theme.vars.palette.text.primary,
        // Os dois halos da v2, repintados com os verdes da marca. Em alfa baixo — o
        // fundo precisa dar profundidade sem disputar com o cartão.
        backgroundImage: `
          radial-gradient(circle at 75% 15%, ${theme.vars.palette.accent.primarySoft}, transparent 32%),
          radial-gradient(circle at 18% 92%, ${theme.vars.palette.accent.secondarySoft}, transparent 30%)
        `,
        [theme.breakpoints.down("sm")]: { p: 1.75, placeItems: "start center" },
      })}
    >
      <AuthBackdrop paused={paused} />
      <Box sx={{ position: "relative", width: "min(440px, 100%)" }}>
        <Paper
          component="main"
          data-testid="auth-card"
          aria-label="Acesso à plataforma Fronteira Concursos"
          sx={(theme) => ({
            width: "100%",
            display: "flex",
            flexDirection: "column",
            borderRadius: `${theme.brand.radius.xl}px`,
            color: theme.vars.palette.text.primary,
            // O Paper tem gradiente opaco próprio, por tema: `&&` o vence nos dois.
            // Vidro claro: branco leitoso sobre o fundo claro; vidro escuro: verde
            // translúcido sobre o grafite. O texto continua nos tokens do tema.
            "&&": {
              border: "1px solid rgba(255, 255, 255, 0.85)",
              boxShadow: "0 24px 64px rgba(12, 80, 55, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 -1px 0 rgba(255, 255, 255, 0.5)",
              backgroundColor: "rgba(255, 255, 255, 0.64)",
              backgroundImage: "linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.15) 34%, transparent 50%, rgba(255, 255, 255, 0.25) 52%, transparent 74%)",
              backdropFilter: "blur(18px) saturate(140%)",
              WebkitBackdropFilter: "blur(18px) saturate(140%)",
              "@supports not (backdrop-filter: blur(1px))": { backgroundColor: theme.vars.palette.surface.raised },
              ...theme.applyStyles("dark", {
                border: "1px solid rgba(235, 255, 247, 0.28)",
                boxShadow: "0 24px 80px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -1px 0 rgba(255, 255, 255, 0.07)",
                backgroundColor: "rgba(220, 245, 235, 0.07)",
                backgroundImage: "linear-gradient(135deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.04) 32%, transparent 48%, rgba(255, 255, 255, 0.06) 51%, transparent 72%)",
                "@supports not (backdrop-filter: blur(1px))": { backgroundColor: theme.vars.palette.surface.raised },
              }),
            },
            px: 4,
            pt: 4.25,
            pb: 3,
            [theme.breakpoints.down("sm")]: { px: 2.25, pt: 3.25, pb: 2.5 },
          })}
        >
          <Box sx={{ textAlign: "center", mb: 3 }}>
            <Box
              aria-hidden="true"
              sx={(theme) => ({
                width: 74,
                height: 74,
                mx: "auto",
                mb: 2.5,
                display: "grid",
                placeItems: "center",
                borderRadius: "12px",
                boxShadow: theme.vars.palette.elevation.glowPrimary,
              })}
            >
              <Box component="img" src="/fronteira-mark.svg" alt="" sx={{ width: 64, height: 64 }} />
            </Box>
            <Typography
              component="p"
              sx={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.025em" }}
            >
              Fronteira Concursos
            </Typography>
          </Box>

          <Outlet />

          <Typography
            variant="caption"
            component="p"
            sx={{ textAlign: "center", mt: "auto", pt: 2.75, fontSize: "0.6875rem", lineHeight: 1.5 }}
          >
            © {new Date().getFullYear()} Fronteira Concursos
            <br />
            Acesso protegido e dados sincronizados.
          </Typography>
        </Paper>
      <Button
        variant="text"
        size="small"
        startIcon={paused ? <PlayArrowIcon /> : <PauseIcon />}
        onClick={() => setPaused((value) => !value)}
        sx={{ display: "flex", mx: "auto", mt: 2, color: "text.secondary", "@media (prefers-reduced-motion: reduce)": { display: "none" } }}
      >
        {paused ? "Ativar animação" : "Pausar animação"}
      </Button>
      </Box>
    </Box>
  );
}
