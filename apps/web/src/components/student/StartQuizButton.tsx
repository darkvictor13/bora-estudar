"use client";

import { useState, useTransition } from "react";

import { startQuizSession } from "@/lib/data/quiz-actions";

export function StartQuizButton({ goalId, label = "Iniciar bateria" }: { goalId: string; label?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      // A URL de retorno é montada no cliente porque precisa ser exatamente a
      // origem que o aluno está usando — localhost, preview ou produção.
      const returnUrl = `${location.origin}${location.pathname}`;
      const result = await startQuizSession(goalId, returnUrl);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) location.assign(result.url);
    });
  }

  return (
    <>
      <button type="button" className="btn btn--primary btn--sm" onClick={handleClick} disabled={pending}>
        {pending ? "Abrindo…" : label}
      </button>
      {error && (
        <div className="muted" style={{ color: "var(--red-600)", marginTop: 4 }}>
          {error}
        </div>
      )}
    </>
  );
}
