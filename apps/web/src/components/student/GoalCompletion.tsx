import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import { completeGoal, reopenGoal, MAX_GOAL_MINUTES } from "@/lib/data/goal-actions";

function Submit({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn--${variant} btn--sm`} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * Conclusão de meta que não é de bateria — teoria, estudo extra e reforço.
 *
 * O formulário abre sob demanda porque a semana tem várias metas e a tabela
 * ficaria ilegível com um campo de tempo e um de observação em cada linha. O
 * botão que abre é `type="button"`: o único submit desta linha é o de concluir.
 */
export function CompleteGoalForm({ goalId, week }: { goalId: string; week: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormActionState(completeGoal);

  if (!open) {
    return (
      <button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen(true)}>
        Concluir
      </button>
    );
  }

  return (
    <form action={formAction} className="stack-sm">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="week" value={week} />

      <div className="field" style={{ marginBottom: 0 }}>
        <label className="field__label" htmlFor={`minutes-${goalId}`}>
          Tempo estudado
        </label>
        {/*
          Texto, não número: `type="number"` impede digitar ":" e tornaria
          impossível o formato "1:20" que a mensagem de erro promete aceitar.
          É a mesma decisão de RegisterTimeForm, e o mesmo parseDuration.
        */}
        <input
          id={`minutes-${goalId}`}
          name="minutes"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="45"
          required
        />
        <span className="field__hint">
          Em minutos (45) ou hora:minuto (1:20). No máximo {MAX_GOAL_MINUTES} minutos.
        </span>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label className="field__label" htmlFor={`note-${goalId}`}>
          Observação <span className="muted">(opcional)</span>
        </label>
        <textarea id={`note-${goalId}`} name="note" rows={2} maxLength={2000} />
      </div>

      <div className="row">
        <Submit label="Concluir meta" pendingLabel="Concluindo…" />
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Desfazer a conclusão.
 *
 * Só aparece em meta sem bateria: a RPC recusa `question_block`, e uma meta com
 * ledger atrás dela só volta a pendente pela anulação do professor (R-CONC-06).
 */
export function ReopenGoalForm({ goalId, week }: { goalId: string; week: number }) {
  const [state, formAction] = useFormActionState(reopenGoal);

  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="week" value={week} />
      <Submit label="Desfazer" pendingLabel="Desfazendo…" variant="ghost" />
    </form>
  );
}
