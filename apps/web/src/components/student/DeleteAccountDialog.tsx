import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { Alert, Field } from "@bora/ui";
import { useId, useState } from "react";

import type { ApiError } from "@/lib/api";

/** A palavra que a pessoa digita para confirmar (R-LGPD-13). */
export const DELETE_ACCOUNT_WORD = "EXCLUIR";

/**
 * O que sai e o que fica, ditos do mesmo jeito no cartão, no diálogo e na
 * política de privacidade (R-LGPD-12 e R-LGPD-16). Está num lugar só para as
 * três telas não divergirem sobre o que acontece com os dados de quem pede.
 */
export function DeletionSummary() {
  return (
    <Box data-testid="deletion-summary" sx={{ "& p": { m: 0, mb: 1, fontSize: "0.875rem", lineHeight: 1.6 } }}>
      <p>
        <strong>O que é apagado:</strong> tudo o que você fez e escreveu — planejamento, metas e
        registros de estudo, progresso e revisões de teoria, marcações em leis e cartões, anotações dos
        resumos, baralhos pessoais e a inscrição na lista de espera. O seu login também deixa de
        existir.
      </p>
      <p>
        <strong>O que fica, sem identificar você:</strong> apenas o histórico de liberações de acesso
        (datas e prazos) e as notas dos simulados presenciais, para estatísticas. Eles passam a
        pertencer a uma conta sem nome, e-mail nem professor.
      </p>
      <p>
        <strong>Não há como desfazer.</strong>
      </p>
    </Box>
  );
}

/**
 * O diálogo de confirmação da exclusão de conta.
 *
 * O botão só habilita com a palavra digitada, e a falha aparece AQUI, sem
 * encerrar a sessão (R-LGPD-14): quem não sabe se excluiu precisa conseguir
 * tentar de novo, e a RPC é segura para isso.
 */
export function DeleteAccountDialog({
  open,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  error: ApiError | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const confirmed = typed.trim() === DELETE_ACCOUNT_WORD;

  function close() {
    if (pending) return;
    setTyped("");
    onCancel();
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby={titleId} data-testid="delete-account-dialog">
      <DialogTitle id={titleId}>Excluir a sua conta?</DialogTitle>
      <DialogContent>
        {error && <Alert status="error">{error.message}</Alert>}
        <DeletionSummary />
        <Box sx={{ mt: 2 }}>
          <Field
            label={`Para confirmar, digite ${DELETE_ACCOUNT_WORD}`}
            name="confirmation"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button type="button" onClick={close} disabled={pending} data-testid="delete-account-cancel">
          Cancelar
        </Button>
        <Button
          type="button"
          variant="contained"
          color="error"
          disabled={!confirmed || pending}
          onClick={onConfirm}
          data-testid="delete-account-confirm"
        >
          {pending ? "Excluindo…" : "Excluir minha conta"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
