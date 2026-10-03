import { useRef, useState } from "react";

import type { Result } from "@/lib/api";

/**
 * As marcações de uma tela de leitura — a lei seca e a revisão de cartões
 * (specs 40 e 42) — entre o que está pintado e o que está gravado.
 *
 * Cada ação grava o antes e o depois, e as gravações de uma aba saem em FILA:
 * a segunda só vai ao banco depois de a primeira voltar, e a ordem do banco é a
 * da tela (R-LEI-15, R-GRIFO-17). O desfazer é da sessão (R-GRIFO-18), e
 * desfazer também é uma gravação.
 */
export function useMarkingSession<M>(
  initial: readonly M[],
  onSave: (previous: readonly M[], next: readonly M[]) => Promise<Result<null>>,
) {
  const [marks, setMarks] = useState<readonly M[]>(initial);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const undo = useRef<(readonly M[])[]>([]);

  const persist = (previous: readonly M[], next: readonly M[]) => {
    saving.current = saving.current.then(async () => {
      const result = await onSave(previous, next);
      setSaveError(result.ok ? null : result.error.message);
    });
  };

  const change = (next: readonly M[]) => {
    undo.current.push(marks);
    if (undo.current.length > 30) undo.current.shift();
    setUndoCount(undo.current.length);
    setMarks(next);
    persist(marks, next);
  };

  const undoLast = () => {
    const previous = undo.current.pop();
    if (!previous) return;
    setUndoCount(undo.current.length);
    setMarks(previous);
    persist(marks, previous);
  };

  return { marks, change, undoLast, canUndo: undoCount > 0, saveError };
}
