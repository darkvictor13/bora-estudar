import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { Alert, Field } from "@bora/ui";
import { useId, useState } from "react";

import { MAX_VOID_REASON_LENGTH, type ApiError, type QuizSessionSummary } from "@/lib/api";

/**
 * A confirmação de anular uma bateria (spec 16, R-ANUL-08 e R-ANUL-11).
 *
 * O motivo é OPCIONAL: vazio vira "Anulação administrativa", e a frase abaixo do
 * campo diz isso, para ninguém achar que precisa inventar um. O diálogo explica o
 * que a anulação faz — não apaga nada, e a meta volta a pendente — porque é
 * irreversível: `voided` é terminal, como `cancelled`.
 *
 * A falha fica AQUI, no diálogo, e o diálogo continua aberto: o professor não
 * perde o que digitou, e a RPC é segura para tentar de novo.
 */
export function VoidSessionDialog({
  session,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  session: QuizSessionSummary | null;
  pending: boolean;
  error: ApiError | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const titleId = useId();

  function close() {
    if (pending) return;
    setReason("");
    onCancel();
  }

  return (
    <Dialog open={session !== null} onClose={close} fullWidth maxWidth="sm" aria-labelledby={titleId} data-testid="void-session-dialog">
      <DialogTitle id={titleId}>Anular esta bateria?</DialogTitle>
      <DialogContent>
        {error && <Alert status="error">{error.message}</Alert>}
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {session ? `${session.blockName} · ${session.subject}. ` : ""}
          Nada é apagado: as respostas continuam registradas, mas a bateria deixa de contar no
          desempenho e a meta volta a ficar pendente, para ser refeita. A anulação não tem volta.
        </Typography>
        <Box>
          <Field
            label="Motivo"
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MAX_VOID_REASON_LENGTH}
            hint="Opcional. Em branco, grava “Anulação administrativa”."
            autoComplete="off"
            disabled={pending}
            invalid={error?.field === "reason"}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button type="button" onClick={close} disabled={pending} data-testid="void-session-cancel">
          Cancelar
        </Button>
        <Button
          type="button"
          variant="contained"
          color="error"
          disabled={pending}
          onClick={() => {
            onConfirm(reason);
            setReason("");
          }}
          data-testid="void-session-confirm"
        >
          {pending ? "Anulando…" : "Anular bateria"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
