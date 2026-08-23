import { Link, isRouteErrorResponse, useRouteError } from "react-router";

import { Alert, Card, PageHeader } from "@/components/ui";
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
        <Card>
          <Alert kind="warning">
            Esta página não existe, ou você não tem acesso a ela.
          </Alert>
          <Link className="btn btn--ghost btn--sm" to={ROUTES.home}>
            Voltar para o início
          </Link>
        </Card>
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
      <Card>
        <Alert kind="error">{detail}</Alert>
        <p className="muted">
          Atualize a página. Se continuar, o detalhe acima é o que o time precisa saber.
        </p>
        <Link className="btn btn--ghost btn--sm" to={ROUTES.home}>
          Voltar para o início
        </Link>
      </Card>
    </>
  );
}

/**
 * Rota inexistente.
 *
 * Numa SPA o servidor devolve o index.html para QUALQUER caminho — é o que
 * permite o roteamento no cliente. Consequência: uma URL sem rota casada não
 * dá 404 do servidor, e sem este componente o resultado é tela branca.
 */
export function NotFound() {
  return (
    <main className="auth">
      <div className="auth__card">
        <p className="auth__brand">Página não encontrada</p>
        <p className="auth__sub">O endereço que você abriu não existe neste site.</p>
        <Link className="btn btn--primary btn--block" to={ROUTES.home}>
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
