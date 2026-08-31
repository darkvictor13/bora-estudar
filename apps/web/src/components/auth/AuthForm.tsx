import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

import { Alert } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import type { FormState } from "@/lib/auth/actions";

/** Campos que nunca são repostos: segredo digitado de novo é digitado de novo. */
const SECRET_FIELDS = new Set(["password", "passwordConfirmation"]);

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
  const formRef = useRef<HTMLFormElement>(null);
  // O que a pessoa digitou, guardado no envio para poder ser reposto se a
  // resposta for erro.
  const typed = useRef<Record<string, string>>({});

  const [state, formAction] = useFormActionState(
    async (previous: FormState, data: FormData): Promise<FormState> => {
      typed.current = {};
      for (const [name, value] of data.entries()) {
        if (typeof value === "string" && !SECRET_FIELDS.has(name)) typed.current[name] = value;
      }
      return action(previous, data);
    },
  );

  /**
   * Repõe o que foi digitado quando a submissão falha.
   *
   * O React 19 reseta o `<form action={…}>` assim que a action termina, como
   * uma submissão nativa faria. Com campos não-controlados isso apaga tudo:
   * uma senha errada no login levava junto o e-mail, e a pessoa redigitava os
   * dois a cada tentativa. Só na falha — no sucesso o valor certo é o que o
   * loader acabou de trazer, não o que estava na tela.
   */
  useEffect(() => {
    if (!state.error || !formRef.current) return;
    for (const [name, value] of Object.entries(typed.current)) {
      const field = formRef.current.elements.namedItem(name);
      if (field instanceof HTMLInputElement && !field.value) field.value = value;
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="form" noValidate>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      {children}
      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}
