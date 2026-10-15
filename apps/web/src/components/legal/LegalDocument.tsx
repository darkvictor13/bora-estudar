import ArrowBackIcon from "@mui/icons-material/ArrowBackOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { Link as RouterLink, useNavigate } from "react-router";

import { LEGAL } from "@/lib/legal";
import { ROUTES } from "@/lib/routes";

/**
 * A página de um documento legal: coluna de leitura, título, data e seções.
 *
 * Pública (R-LGPD-15): abre sem login e fora do cartão de vidro das telas de
 * acesso, que tem 440px e não comporta texto corrido. O "Voltar" usa o
 * histórico, porque quem chega daqui veio do cadastro, do login ou de Meus
 * dados, e cada um espera voltar ao lugar de onde saiu.
 */
export function LegalDocument({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <Box
      component="main"
      data-testid="legal-document"
      sx={(theme) => ({
        minHeight: "100vh",
        backgroundColor: theme.vars.palette.surface.base,
        color: theme.vars.palette.text.primary,
        px: 2,
        py: { xs: 3, sm: 6 },
      })}
    >
      <Box sx={{ maxWidth: 760, mx: "auto" }}>
        <Button
          type="button"
          variant="text"
          size="small"
          startIcon={<ArrowBackIcon fontSize="small" />}
          sx={{ mb: 2, px: 0 }}
          onClick={() => {
            if (window.history.length > 1) void navigate(-1);
            else void navigate(ROUTES.signIn);
          }}
        >
          Voltar
        </Button>

        <Typography component="h1" sx={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.025em" }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, mb: 3 }}>
          {LEGAL.productName} · atualizado em {LEGAL.updatedAt}
        </Typography>

        {children}

        <Box component="nav" aria-label="Documentos legais" sx={{ mt: 5, pt: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 2 }}>
          <Link component={RouterLink} to={ROUTES.privacy}>Política de privacidade</Link>
          <Link component={RouterLink} to={ROUTES.terms}>Termos de uso</Link>
        </Box>
      </Box>
    </Box>
  );
}

/** Uma seção numerada, com `h2` de verdade para o leitor de tela navegar. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ mb: 3.5 }}>
      <Typography component="h2" sx={{ fontSize: "1.0625rem", fontWeight: 700, mb: 1 }}>
        {heading}
      </Typography>
      <Box sx={{ "& p": { m: 0, mb: 1.25, lineHeight: 1.65, fontSize: "0.9375rem" }, "& ul": { mt: 0, mb: 1.25, pl: 3 }, "& li": { mb: 0.5, lineHeight: 1.6, fontSize: "0.9375rem" } }}>
        {children}
      </Box>
    </Box>
  );
}

/** O contato do controlador: o e-mail quando existe, e o professor quando não. */
export function ContactLine() {
  return LEGAL.contactEmail ? (
    <>
      pelo e-mail <Link href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</Link>
    </>
  ) : (
    <>pelo seu professor, que repassa o pedido a {LEGAL.controllerName}</>
  );
}
