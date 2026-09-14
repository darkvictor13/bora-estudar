import ArrowBackIcon from "@mui/icons-material/ArrowBackOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { Link } from "react-router";

/**
 * O miolo de um cartão de autenticação: voltar, título, subtítulo, conteúdo.
 *
 * Na v2 as cinco telas eram `<section class="auth-view">` escondidas por CSS
 * dentro do mesmo cartão, trocadas por `mostrarAuthView(...)`. Aqui cada uma é
 * uma ROTA, o que resolve de graça três coisas que aquela versão não tinha: o
 * botão voltar do navegador, um endereço para mandar a alguém, e o título da
 * aba dizendo onde a pessoa está.
 */
export function AuthView({
  title,
  description,
  backTo,
  backLabel = "Voltar",
  children,
  footer,
}: {
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Box>
      {backTo && (
        <Button
          component={Link}
          to={backTo}
          variant="text"
          size="small"
          startIcon={<ArrowBackIcon fontSize="small" />}
          sx={{ mb: 1.75, px: 0 }}
        >
          {backLabel}
        </Button>
      )}

      <Typography
        component="h2"
        sx={{ textAlign: "center", fontSize: "1.375rem", fontWeight: 800, letterSpacing: "-0.025em" }}
      >
        {title}
      </Typography>

      {description && (
        <Typography
          variant="body2"
          sx={{ textAlign: "center", maxWidth: 330, mx: "auto", mt: 0.5, mb: 2.75 }}
        >
          {description}
        </Typography>
      )}

      {children}

      {footer && (
        <Box sx={{ textAlign: "center", mt: 2.25, fontSize: "0.75rem" }}>{footer}</Box>
      )}
    </Box>
  );
}
