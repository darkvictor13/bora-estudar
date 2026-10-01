import { Navigate, useLocation } from "react-router";

import { ROUTES } from "@/lib/routes";

/** Compatibilidade com favoritos antigos: agora há uma única visão semanal. */
export function Schedule() {
  const { search } = useLocation();
  return <Navigate to={`${ROUTES.student.overview}${search}`} replace />;
}
