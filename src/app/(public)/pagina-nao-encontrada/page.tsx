import type { Metadata } from "next";

import { PublicPage } from "@/components/pages/PublicPage";
import { RouteState } from "@/components/states/RouteState";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function MissingPage() {
  return <PublicPage title="Página não encontrada" description="O endereço informado não corresponde a uma página disponível."><RouteState kind="not-found" title="Recurso inexistente" description="Confira o endereço ou retorne ao início." actionHref="/" actionLabel="Voltar ao início" /></PublicPage>;
}
