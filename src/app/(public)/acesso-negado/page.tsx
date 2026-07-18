import type { Metadata } from "next";

import { PublicPage } from "@/components/pages/PublicPage";
import { RouteState } from "@/components/states/RouteState";

export const metadata: Metadata = { title: "Acesso negado" };

export default function AccessDeniedPage() {
  return <PublicPage title="Acesso negado" description="Sua sessão não possui permissão para abrir este conteúdo."><RouteState kind="denied" title="Você não pode acessar esta página" description="Volte para a sua área ou entre com uma conta autorizada." actionHref="/" actionLabel="Ir para minha área" /></PublicPage>;
}
