import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import { recordReinforcement, TEC_QUESTION_URL } from "@/lib/data/goal-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>
      {pending ? "Gravando…" : "Concluir reforço"}
    </button>
  );
}

export interface CycleError {
  readonly questionId: number;
  readonly topic: string | null;
}

/**
 * O aluno refaz cada erro do ciclo no TEC e marca o resultado aqui.
 *
 * Todas precisam ser marcadas: é o `EXCEPT` de `record_reinforcement`, que
 * recusa a gravação se faltar uma. A tela impede antes, com a mesma contagem,
 * para o aluno não perder o trabalho (R-RCIC-09).
 *
 * O `requestId` vem de fora e é gerado **uma vez, quando a tela carrega** —
 * não a cada submissão. É o que faz o reenvio devolver o reforço já gravado em
 * vez de esbarrar em `unique(quiz_session_id)`.
 */
export function ReinforcementForm({
  studyPlanId,
  blockId,
  sessionIds,
  errors,
  requestId,
}: {
  studyPlanId: string;
  blockId: string;
  sessionIds: readonly string[];
  errors: readonly CycleError[];
  requestId: string;
}) {
  const [state, formAction] = useFormActionState(recordReinforcement);

  return (
    <form action={formAction} className="stack-sm">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <input type="hidden" name="studyPlanId" value={studyPlanId} />
      <input type="hidden" name="blockId" value={blockId} />
      <input type="hidden" name="sessionIds" value={sessionIds.join(",")} />
      <input type="hidden" name="requestId" value={requestId} />

      <p className="muted">
        Refaça cada questão no TEC e marque o resultado. As {errors.length} precisam ser
        marcadas — o reforço só fecha quando o ciclo inteiro foi revisado.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Questão</th>
              <th>Tópico</th>
              <th>Como foi desta vez</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error) => (
              <tr key={error.questionId}>
                <td>
                  <input
                    type="hidden"
                    name="question"
                    value={`${error.questionId}|${error.topic ?? ""}`}
                  />
                  <a
                    href={`${TEC_QUESTION_URL}/${error.questionId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    #{error.questionId}
                  </a>
                </td>
                <td className="muted">{error.topic ?? "Tópico não identificado"}</td>
                <td>
                  <div className="row">
                    <label className="row" style={{ gap: 6 }}>
                      <input
                        type="radio"
                        name={`outcome:${error.questionId}`}
                        value="correct"
                      />
                      Acertei
                    </label>
                    <label className="row" style={{ gap: 6 }}>
                      <input
                        type="radio"
                        name={`outcome:${error.questionId}`}
                        value="incorrect"
                      />
                      Errei
                    </label>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row">
        <Submit />
      </div>
    </form>
  );
}
