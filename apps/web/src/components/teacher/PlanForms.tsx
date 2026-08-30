import { useFormStatus } from "react-dom";

import { Alert, Field } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import {
  activateStudyPlan,
  archiveStudyPlan,
  createStudyPlan,
} from "@/lib/data/teacher-actions";

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

export interface StudentOption {
  readonly id: string;
  readonly name: string;
}

export interface CatalogOption {
  readonly key: string;
  readonly name: string;
}

/**
 * Cria o planejamento e materializa os blocos do catálogo.
 *
 * O `select` de alunos traz só quem tem vínculo vigente — é a mesma condição do
 * `WITH CHECK` de `study_plans_teacher_insert`, então a tela não oferece um
 * caminho que o banco recusa.
 */
export function NewPlanForm({
  students,
  catalogs,
}: {
  students: readonly StudentOption[];
  catalogs: readonly CatalogOption[];
}) {
  const [state, formAction] = useFormActionState(createStudyPlan);

  return (
    <form action={formAction} className="stack-sm">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}

      <div className="row">
        <div className="field" style={{ minWidth: 220 }}>
          <label className="field__label" htmlFor="field-studentId">
            Aluno
          </label>
          <select id="field-studentId" name="studentId" required>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ minWidth: 220 }}>
          <label className="field__label" htmlFor="field-catalogKey">
            Catálogo
          </label>
          <select id="field-catalogKey" name="catalogKey" required>
            {catalogs.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="field__hint">Os blocos ativos dele viram os cadernos do aluno.</span>
        </div>
      </div>

      <div className="row">
        <Field label="Nome do planejamento" name="name" required minLength={3} />
        <Field label="Concurso alvo" name="targetExam" />
      </div>

      <div className="row">
        <Field label="Área" name="area" />
        <Field label="Fase" name="stage" hint="Pré-edital, pós-edital, reta final…" />
        <Field label="Modelo de estudo" name="studyModel" />
        <Field
          label="Metas por semana"
          name="weeklyGoals"
          type="number"
          min={1}
          max={200}
          defaultValue={24}
        />
      </div>

      <div className="row">
        <Submit label="Criar planejamento" pendingLabel="Criando…" />
      </div>
    </form>
  );
}

/** Ativa o planejamento. A troca inteira é `activate_study_plan`. */
export function ActivatePlanForm({ planId }: { planId: string }) {
  const [state, formAction] = useFormActionState(activateStudyPlan);

  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="planId" value={planId} />
      <Submit label="Ativar" pendingLabel="Ativando…" />
    </form>
  );
}

/** Arquiva. Nada é apagado — metas e baterias continuam no histórico. */
export function ArchivePlanForm({ planId }: { planId: string }) {
  const [state, formAction] = useFormActionState(archiveStudyPlan);

  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="planId" value={planId} />
      <Submit label="Arquivar" pendingLabel="Arquivando…" variant="ghost" />
    </form>
  );
}
