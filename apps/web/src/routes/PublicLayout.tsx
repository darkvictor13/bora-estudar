import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { Outlet } from "react-router";

import { getSessionContext } from "@/lib/auth/session";
import { forgetTheme } from "@/lib/theme";

/**
 * Sem sessão o tema é claro (R-TEMA-14).
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

/** As três promessas que a v2 mostra ao lado do formulário. */
const BENEFITS = ["Plano de estudos", "Metas semanais", "Evolução real"] as const;

/**
 * A ENTRADA EM DUAS COLUNAS DA v2 — `auth-story` à esquerda, `auth-card` à
 * direita.
 *
 * O layout é o da v2; a cor não é. Lá o fundo era um degradê azul-marinho fixo
 * com o cartão em vidro escuro, o que fazia da tela de entrada a única do
 * produto que ignorava o tema — e que, no modo claro, aparecia como um bloco
 * preto entre duas telas claras. Aqui as duas colunas são pintadas pelos
 * tokens, então a entrada acompanha o tema como qualquer outra tela.
 *
 * Abaixo de `xl` a coluna da história SOME, como na v2: ela é enfeite de tela
 * larga, e num celular empurraria o formulário para baixo da dobra.
 */
export function PublicLayout() {
  return (
    <Box
      data-testid="auth-overlay"
      sx={(theme) => ({
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: 4,
        overflow: "auto",
        backgroundColor: theme.vars.palette.surface.base,
        // Os dois halos da v2, repintados com as cores da marca: âmbar no alto
        // à direita, petróleo embaixo à esquerda. Em alfa muito baixo — o
        // fundo precisa dar profundidade sem disputar com o cartão.
        backgroundImage: `
          radial-gradient(circle at 75% 15%, ${theme.vars.palette.accent.primarySoft}, transparent 32%),
          radial-gradient(circle at 18% 92%, ${theme.vars.palette.accent.secondarySoft}, transparent 30%)
        `,
        [theme.breakpoints.down("sm")]: { p: 1.75, placeItems: "start center" },
      })}
    >
      <Box
        sx={(theme) => ({
          width: "min(1120px, 100%)",
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1fr) minmax(390px, 440px)",
          alignItems: "center",
          gap: 9,
          [theme.breakpoints.down("xl")]: {
            gridTemplateColumns: "1fr",
            gap: 3,
            maxWidth: 520,
            margin: "auto 0",
          },
        })}
      >
        <Box
          component="section"
          aria-label="Apresentação da plataforma"
          sx={(theme) => ({
            maxWidth: 470,
            justifySelf: "center",
            textAlign: "center",
            [theme.breakpoints.down("xl")]: { display: "none" },
          })}
        >
          <Typography
            component="h1"
            sx={{
              fontSize: "clamp(2.375rem, 4.2vw, 3.625rem)",
              lineHeight: 0.98,
              letterSpacing: "-0.055em",
              fontWeight: 800,
              maxWidth: 450,
              mx: "auto",
              mb: 3,
            }}
          >
            Seu concurso começa com um plano.
          </Typography>
          <Typography
            sx={{ fontSize: "1rem", lineHeight: 1.55, maxWidth: 410, mx: "auto" }}
            color="text.secondary"
          >
            Organize seus estudos, acompanhe sua evolução e avance com metas claras até a
            aprovação.
          </Typography>

          <Box sx={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 1.25, mt: 5 }}>
            {BENEFITS.map((benefit) => (
              <Box
                key={benefit}
                sx={(theme) => ({
                  px: 1.875,
                  py: 1.125,
                  borderRadius: `${theme.brand.radius.pill}px`,
                  border: `1px solid ${theme.vars.palette.surface.border}`,
                  backgroundColor: theme.vars.palette.surface.raised,
                  fontSize: "0.8125rem",
                  color: theme.vars.palette.text.secondary,
                })}
              >
                {benefit}
              </Box>
            ))}
          </Box>
        </Box>

        <Paper
          component="main"
          data-testid="auth-card"
          aria-label="Acesso ao Bora Estudar Concursos"
          sx={(theme) => ({
            width: "100%",
            display: "flex",
            flexDirection: "column",
            borderRadius: `${theme.brand.radius.xl}px`,
            boxShadow: theme.vars.palette.elevation.xl,
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
                borderRadius: "50%",
                backgroundColor: theme.vars.palette.fill.primary,
                color: theme.vars.palette.fill.primaryText,
                boxShadow: theme.vars.palette.elevation.glowPrimary,
                fontFamily: theme.typography.numeric.fontFamily,
                fontWeight: 500,
                fontSize: "1.75rem",
                letterSpacing: "-0.1em",
              })}
            >
              BE
            </Box>
            <Typography
              component="p"
              sx={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.025em" }}
            >
              Bora Estudar Concursos
            </Typography>
          </Box>

          <Outlet />

          <Typography
            variant="caption"
            component="p"
            sx={{ textAlign: "center", mt: "auto", pt: 2.75, fontSize: "0.6875rem", lineHeight: 1.5 }}
          >
            © {new Date().getFullYear()} Bora Estudar Concursos
            <br />
            Acesso protegido e dados sincronizados.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
