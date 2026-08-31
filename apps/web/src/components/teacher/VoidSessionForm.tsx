import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import { DEFAULT_VOID_REASON, voidQuizSession } from "@/lib/data/teacher-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--danger btn--sm" disabled={pending}>
      {pending ? "Anulando…" : "Anular"}
    </button>
  );
}

/**
 * Anula a bateria, pedindo o motivo.
 *
 * O formulário abre sob demanda porque a lista tem uma linha por bateria e um
 * campo de motivo em cada uma seria ilegível. O botão que abre é
 * `type="button"`: o único submit da linha é o "Anular".
 *
 * O aviso sobre as questões voltarem a ser inéditas não é detalhe: é a
 * consequência que o professor precisa entender antes de clicar, e vem de
 * `vw_seen_questions` filtrar `status = 'completed'`.
 */
export function VoidSessionForm({
  quizSessionId,
  studentId,
}: {
  quizSessionId: string;
  studentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormActionState(voidQuizSession);

  if (!open) {
    return (
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
        Anular
      </button>
    );
  }

  return (
    <form action={formAction} className="stack-sm">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="quizSessionId" value={quizSessionId} />
      <input type="hidden" name="studentId" value={studentId} />

      <p className="muted" style={{ maxWidth: 380 }}>
        A bateria sai do desempenho e a meta volta a pendente. As respostas ficam
        registradas para auditoria, e as questões voltam a ser inéditas para as
        próximas baterias.
      </p>

      <div className="field">
        <label className="field__label" htmlFor={`reason-${quizSessionId}`}>
          Motivo
        </label>
        <input
          id={`reason-${quizSessionId}`}
          name="reason"
          type="text"
          autoComplete="off"
          placeholder={DEFAULT_VOID_REASON}
        />
      </div>

      <div className="row">
        <Submit />
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
