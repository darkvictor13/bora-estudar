import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import {
  ACCESS_MONTHS,
  grantAccess,
  linkStudent,
  suspendAccess,
} from "@/lib/data/teacher-actions";

function Submit({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "ghost" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn--${variant} btn--sm`} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Reivindica um candidato da lista de espera. */
export function LinkStudentForm({ studentId }: { studentId: string }) {
  const [state, formAction] = useFormActionState(linkStudent);

  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="studentId" value={studentId} />
      <Submit label="Vincular a mim" pendingLabel="Vinculando…" />
    </form>
  );
}

/**
 * Libera ou estende o acesso.
 *
 * O período é um `select` porque a v96 tinha só o literal 3 e o professor
 * acabava sem como dar um mês de teste nem um ano de turma.
 */
export function GrantAccessForm({
  studentId,
  hasActive,
}: {
  studentId: string;
  hasActive: boolean;
}) {
  const [state, formAction] = useFormActionState(grantAccess);

  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      <input type="hidden" name="studentId" value={studentId} />
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ minWidth: 150, marginBottom: 0 }}>
          <label className="field__label" htmlFor={`months-${studentId}`}>
            Período
          </label>
          <select id={`months-${studentId}`} name="months" defaultValue={3}>
            {ACCESS_MONTHS.map((m) => (
              <option key={m} value={m}>
                {m} {m === 1 ? "mês" : "meses"}
              </option>
            ))}
          </select>
        </div>
        <Submit
          label={hasActive ? "Estender acesso" : "Liberar acesso"}
          pendingLabel="Salvando…"
        />
      </div>
    </form>
  );
}

/** Suspende o acesso ativo. A vigência é preservada (R-VINC-18). */
export function SuspendAccessForm({ studentId }: { studentId: string }) {
  const [state, formAction] = useFormActionState(suspendAccess);

  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      <input type="hidden" name="studentId" value={studentId} />
      <Submit label="Suspender acesso" pendingLabel="Suspendendo…" variant="danger" />
    </form>
  );
}
