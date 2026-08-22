"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

import { Alert } from "@/components/ui";
import type { FormState } from "@/lib/auth/actions";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  // useFormStatus só enxerga o <form> ancestral, então precisa ser um
  // componente separado — dentro do próprio form ele sempre retornaria false.
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function AuthForm({
  action,
  submitLabel,
  pendingLabel = "Enviando…",
  children,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string | undefined;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} noValidate>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      {children}
      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}
