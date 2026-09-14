import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Alert, Card, PageHeader } from "@bora/ui";
import { Link, isRouteErrorResponse, useRouteError } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { ROUTES } from "@/lib/routes";

/**
 * Última linha de defesa da árvore de rotas.
 *
 * Numa SPA um erro em loader não tem servidor para transformá-lo em página de
 * erro: sem isto, a tela fica branca e o motivo só aparece no console. Cobre
 * dois casos: o 404 que `professor/alunos/:studentId` lança de propósito
 * quando não há vínculo, e a falha inesperada.
 */
export function RouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <>
        <PageHeader title="Não encontrado" />
        <ContentBody>
        <Card>
          <Alert status="warning">
            Esta página não existe, ou você não tem acesso a ela.
          </Alert>
          <Button component={Link} to={ROUTES.home} variant="outlined" size="small" sx={{ mt: 1.5 }}>
            Voltar para o início
          </Button>
        </Card>
        </ContentBody>
      </>
    );
  }

  const detail =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : "Erro desconhecido.";

  return (
    <>
      <PageHeader title="Algo deu errado" />
      <ContentBody>
      <Card>
        <Alert status="error">{detail}</Alert>
        <Typography variant="body2">
          Atualize a página. Se continuar, o detalhe acima é o que o time precisa saber.
        </Typography>
        <Button component={Link} to={ROUTES.home} variant="outlined" size="small" sx={{ mt: 1.5 }}>
          Voltar para o início
        </Button>
      </Card>
      </ContentBody>
    </>
  );
}

/**
 * Rota inexistente.
 *
 * Numa SPA o servidor devolve o index.html para QUALQUER caminho — é o que
 * permite o roteamento no cliente. Consequência: uma URL sem rota casada não
 * dá 404 do servidor, e sem este componente o resultado é tela branca.
 *
 * Fica FORA do `PublicLayout`: é a única tela que alguém pode alcançar
 * autenticado ou não, e emoldurá-la com o cartão de acesso sugeriria que a
 * pessoa precisa entrar quando o que houve foi um endereço errado.
 */
export function NotFound() {
  return (
    <Box
      component="main"
      data-testid="content"
      sx={(theme) => ({
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: 3,
        backgroundColor: theme.vars.palette.surface.base,
      })}
    >
      <Card sx={{ width: "min(420px, 100%)", textAlign: "center" }}>
        <Typography component="h1" variant="h1" sx={{ mb: 0.5 }}>
          Página não encontrada
        </Typography>
        <Typography variant="body2" sx={{ mb: 2.5 }}>
          O endereço que você abriu não existe neste site.
        </Typography>
        <Button component={Link} to={ROUTES.home} variant="contained" fullWidth>
          Ir para o início
        </Button>
      </Card>
    </Box>
  );
}
