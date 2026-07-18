import { PublicPage } from "@/components/pages/PublicPage";
import { RouteState } from "@/components/states/RouteState";

export default function NotFound() {
  return <PublicPage title="Página não encontrada" description="A rota solicitada não existe no Bora Estudar."><RouteState kind="not-found" title="Recurso inexistente" description="Falta de permissão e recurso inexistente são tratados separadamente." actionHref="/pagina-nao-encontrada" actionLabel="Ver orientação" /></PublicPage>;
}
