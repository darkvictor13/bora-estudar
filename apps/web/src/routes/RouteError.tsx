import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Alert, Card, PageHeader } from "@bora/ui";
import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import { useState } from "react";

import { ContentBody } from "@/components/AppShell";
import { captureRouteError } from "@/lib/observability";
import { ROUTES } from "@/lib/routes";

/**
 * Última linha de defesa da árvore de rotas.
 *
 * Numa SPA um erro em loader não tem servidor para transformá-lo em página de
 * erro: sem isto, a tela fica branca e o motivo só aparece no console. Cobre
 * dois casos: o 404 que `professor/alunos/:studentId` lança de propósito
 * quando não há vínculo, e a falha inesperada.
 *
 * É TAMBÉM O ÚNICO LUGAR DE ONDE O ERRO DE LOADER PODE SER RELATADO. O React
 * Router em modo data captura a exceção e renderiza este componente: ela não é
 * relançada, e portanto não passa por `window.onerror` nem pelos manipuladores
 * globais do SDK. Sem a chamada abaixo, o modo de falha mais comum do produto
 * seria o único que ninguém veria.
 */
export function RouteError() {
  const error = useRouteError();

  // NO INICIALIZADOR DO `useState`, e não num efeito.
  //
  // O relato precisa acontecer uma vez e o id precisa ser RENDERIZADO, e o
  // caminho óbvio — efeito que chama `setEventId` — é justamente o que
  // `react-hooks/set-state-in-effect` recusa, por provocar renderização em
  // cascata. O inicializador roda uma vez por montagem, antes da primeira
  // pintura, e devolve o id direto.
  //
  // O que torna isso seguro é a memoização por instância de erro dentro de
  // `captureRouteError`: a dupla invocação do StrictMode em desenvolvimento não
  // gera dois eventos, e o código mostrado não muda entre montagens.
  const [eventId] = useState(() => captureRouteError(error));

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
        {/* O código só aparece quando o erro FOI mesmo relatado — o que exclui
            acesso vencido e registro inexistente, que não geram evento. Mostrar
            um código que ninguém acha no painel é pior do que não mostrar
            nenhum. Em mono, que é a face do que precisa ser lido caractere a
            caractere. */}
        {eventId && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Código do erro:{" "}
            <Typography component="span" variant="numeric" data-testid="error-code">
              {eventId}
            </Typography>
          </Typography>
        )}
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
