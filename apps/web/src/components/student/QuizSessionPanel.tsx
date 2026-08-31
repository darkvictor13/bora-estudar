import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import { cancelQuizSession, registerQuizTime } from "@/lib/data/quiz-actions";

function Submit({ label, pendingLabel, variant = "primary" }: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn--${variant} btn--sm`} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Bateria já respondida: falta o tempo para a meta concluir. */
export function RegisterTimeForm({ quizSessionId }: { quizSessionId: string }) {
  const [state, formAction] = useFormActionState(registerQuizTime);

  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      <input type="hidden" name="quizSessionId" value={quizSessionId} />
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="minutes">
            Tempo gasto
          </label>
          {/*
            Texto, não número: type="number" impede digitar ":" e tornava
            impossível o formato "1:20" que a validação sempre prometeu aceitar.
            inputMode mantém o teclado numérico no celular.
          */}
          <input
            id="minutes"
            name="minutes"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="80"
            required
          />
          <span className="field__hint">Em minutos (80) ou hora:minuto (1:20).</span>
        </div>
        <Submit label="Registrar tempo e concluir" pendingLabel="Registrando…" />
      </div>
    </form>
  );
}

/** Sessão aberta que o aluno quer descartar sem passar pela extensão. */
export function CancelSessionForm({ quizSessionId }: { quizSessionId: string }) {
  const [state, formAction] = useFormActionState(cancelQuizSession);

  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      <input type="hidden" name="quizSessionId" value={quizSessionId} />
      <Submit label="Cancelar bateria" pendingLabel="Cancelando…" variant="danger" />
    </form>
  );
}
