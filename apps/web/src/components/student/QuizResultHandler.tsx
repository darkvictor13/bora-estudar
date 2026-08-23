import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
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
 * O fragmento nunca é enviado ao servidor, então só código de navegador o
 * enxerga. Numa SPA isso deixa de ser uma restrição — não existe mais Server
 * Component de quem se defender —, mas o componente continua existindo porque
 * o trabalho é o mesmo: ler a hash, gravar, e só então limpá-la.
 */
export function QuizResultHandler() {
  const { revalidate } = useRevalidator();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Em desenvolvimento o React monta duas vezes; sem a trava o resultado seria
  // enviado em duplicata. O servidor é idempotente, mas evitar a segunda ida
  // é mais barato e deixa a intenção explícita.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (!hashHasPayload(location.hash, HASH_KEYS.result)) return;
    handled.current = true;

    // Sem trava de cancelamento aqui, e é deliberado. O ciclo do React em
    // desenvolvimento é montar → limpar → montar: a limpeza cancelaria a
    // ÚNICA execução em andamento, e a segunda montagem sairia na trava acima
    // sem começar outra. Ninguém escreveria o estado, ninguém limparia a hash,
    // e a tela ficaria em "Gravando…" para sempre — com o resultado já no
    // banco. Um setState em componente desmontado não custa nada no React 19;
    // engolir a confirmação de uma bateria respondida custa uma hora de estudo.
    (async () => {
      let result;
      try {
        result = parseResultHash(location.hash).body;
      } catch (error) {
        const message =
          error instanceof ProtocolError && error.code === "incompatible_version"
            ? "Atualize a extensão: ela devolveu o resultado num formato que este site ainda não entende."
            : "O resultado voltou da extensão em formato inválido. Reenvie pelo popup da extensão.";
        setStatus({ kind: "failed", message });
        return;
      }

      setStatus({ kind: "sending" });
      const response = await submitQuizResult(result);

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
      // Era `router.refresh()`. Numa SPA o equivalente é revalidar os loaders:
      // é o que faz a meta aparecer concluída e o cartão da bateria mudar de
      // estado sem recarregar a página.
      void revalidate();
    })();
  }, [revalidate]);

  if (status.kind === "idle") return null;
  if (status.kind === "sending") return <Alert kind="info">Gravando o resultado da bateria…</Alert>;
  if (status.kind === "failed") return <Alert kind="error">{status.message}</Alert>;
  return <Alert kind="success">{status.message}</Alert>;
}
