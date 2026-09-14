import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { Alert } from "@bora/ui";
import { useEffect, useRef, type ReactNode } from "react";

import { useFormActionState } from "@/lib/forms/useFormActionState";
import type { FormState } from "@/lib/auth/actions";

/** Campos que nunca são repostos: segredo digitado de novo é digitado de novo. */
const SECRET_FIELDS = new Set(["password", "passwordConfirmation"]);

export function AuthForm({
  action,
  submitLabel,
  pendingLabel = "Enviando…",
  children,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string | undefined;
  /** Recebe o erro de campo da última tentativa, para marcá-lo em vermelho. */
  children: ReactNode | ((state: FormState) => ReactNode);
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // O que a pessoa digitou, guardado no envio para poder ser reposto se a
  // resposta for erro.
  const typed = useRef<Record<string, string>>({});

  const [state, formAction, pending] = useFormActionState(
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
   * dois a cada tentativa (BUG-11). Só na falha — no sucesso o valor certo é o
   * que o loader acabou de trazer, não o que estava na tela.
   */
  useEffect(() => {
    if (!state.error || !formRef.current) return;
    for (const [name, value] of Object.entries(typed.current)) {
      const field = formRef.current.elements.namedItem(name);
      if (field instanceof HTMLInputElement && !field.value) field.value = value;
    }
  }, [state]);

  return (
    <Box component="form" ref={formRef} action={formAction} noValidate>
      {state.error && <Alert status="error">{state.error}</Alert>}
      {state.success && <Alert status="success">{state.success}</Alert>}

      {typeof children === "function" ? children(state) : children}

      {/*
        `pending` vem do `useActionState`, e não do `useFormStatus`: aquele só
        enxerga o <form> ancestral, o que obrigaria este botão a ser um
        componente separado só para poder consultá-lo.
      */}
      <Button type="submit" variant="contained" fullWidth disabled={pending} sx={{ mt: 0.5 }}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </Box>
  );
}
