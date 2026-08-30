import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Field } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import {
  createBlock,
  deleteBlock,
  restoreBlock,
  setBlockActive,
  setSubjectActive,
  updateBlock,
} from "@/lib/data/teacher-actions";
import type { FormAction } from "@/lib/forms/useFormActionState";

function Submit({
  label,
  pendingLabel,
  variant = "ghost",
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

/**
 * Formulário de um botão só, com campos escondidos.
 *
 * Ativar, desativar, excluir e restaurar são a mesma forma: um `<form>` com
 * `action`, sem entrada do professor. Concentrar aqui evita quatro componentes
 * idênticos e mantém o erro perto do botão que o causou.
 */
function ActionButton({
  action,
  fields,
  label,
  pendingLabel,
  variant,
}: {
  action: FormAction;
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "ghost" | "danger";
}) {
  const [state, formAction] = useFormActionState(action);

  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Submit label={label} pendingLabel={pendingLabel} {...(variant ? { variant } : {})} />
    </form>
  );
}

export interface Ctx {
  /** Planejamento e recorte atuais, para a página voltar onde estava. */
  readonly planId: string;
  readonly view: string;
}

export function ToggleBlockForm({
  blockId,
  active,
  ctx,
}: {
  blockId: string;
  active: boolean;
  ctx: Ctx;
}) {
  return (
    <ActionButton
      action={setBlockActive}
      fields={{ blockId, active: String(!active), planId: ctx.planId, view: ctx.view }}
      label={active ? "Desativar" : "Ativar"}
      pendingLabel="Salvando…"
    />
  );
}

export function ToggleSubjectForm({
  studyPlanId,
  subjectName,
  anyActive,
  ctx,
}: {
  studyPlanId: string;
  subjectName: string;
  anyActive: boolean;
  ctx: Ctx;
}) {
  return (
    <ActionButton
      action={setSubjectActive}
      fields={{
        studyPlanId,
        subjectName,
        active: String(!anyActive),
        planId: ctx.planId,
        view: ctx.view,
      }}
      label={anyActive ? "Desativar matéria" : "Ativar matéria"}
      pendingLabel="Salvando…"
    />
  );
}

/**
 * Excluir só aparece para bloco sem meta (R-CAD-04).
 *
 * Com meta, a tela mostra o motivo em vez do botão: uma meta de bateria
 * pendente cujo bloco foi excluído deixa de poder ser iniciada.
 */
export function DeleteBlockForm({
  blockId,
  goalCount,
  ctx,
}: {
  blockId: string;
  goalCount: number;
  ctx: Ctx;
}) {
  if (goalCount > 0) {
    return (
      <span className="muted" title="Desative-o: ele sai da geração e o histórico fica.">
        {goalCount} meta(s)
      </span>
    );
  }
  return (
    <ActionButton
      action={deleteBlock}
      fields={{ blockId, planId: ctx.planId, view: ctx.view }}
      label="Excluir"
      pendingLabel="Excluindo…"
      variant="danger"
    />
  );
}

export function RestoreBlockForm({ blockId, ctx }: { blockId: string; ctx: Ctx }) {
  return (
    <ActionButton
      action={restoreBlock}
      fields={{ blockId, planId: ctx.planId, view: ctx.view }}
      label="Restaurar"
      pendingLabel="Restaurando…"
    />
  );
}

export interface EditableBlock {
  readonly id: string;
  readonly name: string;
  readonly subject_name: string;
  readonly subject_target: number;
  readonly link: string | null;
}

/** Edição sob demanda: a tabela ficaria ilegível com os campos sempre abertos. */
export function EditBlockForm({ block, ctx }: { block: EditableBlock; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormActionState(updateBlock);

  if (!open) {
    return (
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
        Editar
      </button>
    );
  }

  return (
    <form action={formAction} className="stack-sm">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="blockId" value={block.id} />
      <input type="hidden" name="planId" value={ctx.planId} />
      <input type="hidden" name="view" value={ctx.view} />
      <Field label="Caderno" name="name" defaultValue={block.name} required />
      <Field label="Disciplina" name="subjectName" defaultValue={block.subject_name} required />
      <Field
        label="Meta (%)"
        name="subjectTarget"
        type="number"
        min={0}
        max={100}
        defaultValue={block.subject_target}
      />
      <Field label="Link" name="link" defaultValue={block.link ?? ""} />
      <div className="row">
        <Submit label="Salvar" pendingLabel="Salvando…" variant="primary" />
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Caderno que não veio do catálogo — nasce sem `catalog_block_id`. */
export function NewBlockForm({
  studyPlanId,
  studentId,
  ctx,
}: {
  studyPlanId: string;
  studentId: string;
  ctx: Ctx;
}) {
  const [state, formAction] = useFormActionState(createBlock);

  return (
    <form action={formAction} className="stack-sm">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="studyPlanId" value={studyPlanId} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="planId" value={ctx.planId} />
      <input type="hidden" name="view" value={ctx.view} />
      <div className="row">
        <Field label="Disciplina" name="subjectName" required />
        <Field label="Caderno" name="name" required />
        <Field label="Questões" name="questionCount" type="number" min={0} defaultValue={0} />
        <Field label="Link" name="link" />
      </div>
      <div className="row">
        <Submit label="Adicionar caderno" pendingLabel="Adicionando…" variant="primary" />
      </div>
    </form>
  );
}
