import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert } from "@bora/ui";
import { useRef, useState } from "react";
import { useRevalidator } from "react-router";

import {
  ACCESS_MONTHS,
  DEFAULT_ACCESS_MONTHS,
  api,
  newRequestId,
  type ApiError,
  type RequestId,
  type StudentCard,
} from "@/lib/api";

/**
 * LIBERAR E BLOQUEAR O ACESSO DO ALUNO.
 *
 * `access_status` e `access_expires_at` ficam fora do `GRANT UPDATE` de
 * `profiles` para que ninguém estenda o próprio acesso nem se promova. Quem
 * escreve é a RPC `set_student_access`, e o que esta tela faz é escolher a
 * vigência e mandar o pedido — a soma da data é do servidor.
 *
 * ## Liberar SOMA ao que ainda falta
 *
 * Quem renova antes do fim não perde dia pago, que é como mensalidade funciona.
 * A conta é feita no banco de propósito: calculá-la aqui, a partir da data que
 * a tela carregou, produziria vencimento errado em toda aba que ficou aberta.
 *
 * ## Bloquear PRESERVA a data
 *
 * Dá para reativar sem redigitar, e fica auditável até quando o acesso valia.
 */
export function AccessForm({ card }: { card: StudentCard }) {
  const { revalidate } = useRevalidator();

  const [months, setMonths] = useState(DEFAULT_ACCESS_MONTHS);
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * O `request_id` é gerado UMA VEZ POR INTENÇÃO, e não por clique.
   *
   * Gerá-lo no ponto de uso transforma a proteção do servidor em decoração:
   * cada tentativa chegaria ao banco como operação nova, e o duplo clique
   * gravaria dois meses de vigência onde deveria gravar um. A chave é a
   * intenção — ação mais vigência —, e a entrada só sai do mapa quando a
   * gravação dá certo: a retentativa de uma falha reusa o mesmo id.
   *
   * O `Map` mora num ref e é escrito só em manipulador de evento. Escrever ref
   * durante o render é o que o React Compiler recusa.
   */
  const pending = useRef(new Map<string, RequestId>());

  function requestIdFor(key: string): RequestId {
    const known = pending.current.get(key);
    if (known) return known;
    const fresh = newRequestId();
    pending.current.set(key, fresh);
    return fresh;
  }

  async function run(key: string, action: (requestId: RequestId) => Promise<{ ok: boolean; error?: ApiError }>, ok: string) {
    setBusy(true);
    const result = await action(requestIdFor(key));
    setBusy(false);

    if (!result.ok && result.error) {
      setError(result.error);
      setMessage(null);
      return;
    }
    pending.current.delete(key);
    setError(null);
    setMessage(ok);
    await revalidate();
  }

  return (
    <Box data-testid="access-form">
      {error && <Alert status="error">{error.message}</Alert>}
      {message && <Alert status="success">{message}</Alert>}

      <Typography variant="body2" sx={{ mb: 1.5 }}>
        {card.accessExpiresAt
          ? `Vigência atual até ${card.accessExpiresAt}. Liberar soma ao que ainda falta.`
          : "Sem vigência. A primeira liberação conta a partir de hoje."}
      </Typography>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          select
          size="small"
          label="Vigência"
          value={months}
          slotProps={{ select: { inputProps: { "data-testid": "access-months" } } }}
          onChange={(event) => setMonths(Number(event.target.value))}
          sx={{ minWidth: 140 }}
        >
          {ACCESS_MONTHS.map((option) => (
            <MenuItem key={option} value={option}>
              {option === 1 ? "1 mês" : `${option} meses`}
            </MenuItem>
          ))}
        </TextField>

        <Button
          variant="contained"
          size="small"
          disabled={busy}
          data-testid="grant-access"
          onClick={() =>
            void run(
              `grant:${months}`,
              (requestId) =>
                api.grantAccess({ studentId: card.studentId, months, requestId }),
              `Acesso liberado por ${months === 1 ? "1 mês" : `${months} meses`}.`,
            )
          }
        >
          Liberar acesso
        </Button>

        {card.access !== "suspended" && (
          <Button
            variant="outlined"
            size="small"
            color="error"
            disabled={busy}
            data-testid="revoke-access"
            onClick={() =>
              void run(
                "suspend",
                (requestId) => api.revokeAccess(card.studentId, requestId),
                "Acesso bloqueado. A vigência fica guardada.",
              )
            }
          >
            Bloquear acesso
          </Button>
        )}
      </Box>
    </Box>
  );
}
