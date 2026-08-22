"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HASH_KEYS, ProtocolError, hashHasPayload, parseResultHash } from "@bora/protocol";

import { Alert } from "@/components/ui";
import { submitQuizResult } from "@/lib/data/quiz-actions";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; message: string }
  | { kind: "failed"; message: string };

/**
 * Recebe o resultado que a extensão devolve no fragmento da URL.
 *
 * Precisa ser componente de cliente: o fragmento nunca é enviado ao servidor,
 * então nenhum Server Component consegue lê-lo.
 */
export function QuizResultHandler() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Em desenvolvimento o React monta duas vezes; sem a trava o resultado seria
  // enviado em duplicata. O servidor é idempotente, mas evitar a segunda ida
  // é mais barato e deixa a intenção explícita.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (!hashHasPayload(location.hash, HASH_KEYS.result)) return;
    handled.current = true;

    let cancelled = false;

    (async () => {
      let result;
      try {
        result = parseResultHash(location.hash).body;
      } catch (error) {
        const message =
          error instanceof ProtocolError && error.code === "incompatible_version"
            ? "Atualize a extensão: ela devolveu o resultado num formato que este site ainda não entende."
            : "O resultado voltou da extensão em formato inválido. Reenvie pelo popup da extensão.";
        if (!cancelled) setStatus({ kind: "failed", message });
        return;
      }

      setStatus({ kind: "sending" });
      const response = await submitQuizResult(result);
      if (cancelled) return;

      if (response.error) {
        // A hash CONTINUA na URL. Ela é a única cópia do resultado neste
        // navegador; limpá-la antes da confirmação foi o que fez a versão
        // anterior perder bateria já respondida. Um F5 tenta de novo.
        setStatus({
          kind: "failed",
          message: `Não foi possível gravar o resultado: ${response.error}. Não refaça a bateria — atualize a página para tentar de novo.`,
        });
        return;
      }

      // Só agora, com a gravação confirmada.
      history.replaceState(null, "", location.pathname + location.search);
      setStatus({ kind: "done", message: response.success ?? "Resultado gravado." });
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status.kind === "idle") return null;
  if (status.kind === "sending") return <Alert kind="info">Gravando o resultado da bateria…</Alert>;
  if (status.kind === "failed") return <Alert kind="error">{status.message}</Alert>;
  return <Alert kind="success">{status.message}</Alert>;
}
