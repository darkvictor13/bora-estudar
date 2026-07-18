"use client";

import { useEffect } from "react";

import { RouteState } from "@/components/states/RouteState";

export function RouteError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="route-page">
      <RouteState kind="connection-error" title="Não foi possível carregar esta página" description="Verifique sua conexão e tente novamente." />
      <button className="be-button be-button--primary" type="button" onClick={() => unstable_retry()}>
        Tentar novamente
      </button>
    </div>
  );
}
