import { useFormStatus } from "react-dom";

import { Alert, Card } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import { setReviewSpacing } from "@/lib/data/teacher-actions";
import { MAX_INTERVAL, MIN_INTERVAL } from "@/lib/domain/spacing";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

export interface SubjectSpacing {
  readonly subject: string;
  readonly firstInterval: number;
  readonly secondInterval: number;
  readonly blockCount: number;
}

/**
 * Espaçamento de uma disciplina.
 *
 * `noValidate` porque a validação nativa do navegador BLOQUEIA o submit e a
 * action nunca roda — o formulário fica mudo em vez de dizer o que está errado.
 * É a convenção do repositório desde `AuthForm`, e quem valida de verdade é a
 * `check` do banco.
 */
function SpacingRow({
  spacing,
  studyPlanId,
  studentId,
  teacherId,
}: {
  spacing: SubjectSpacing;
  studyPlanId: string;
  studentId: string;
  teacherId: string;
}) {
  const [state, formAction] = useFormActionState(setReviewSpacing);
  const id = spacing.subject.replace(/\W/g, "");

  return (
    <tr>
      <td>
        <strong>{spacing.subject}</strong>
        <div className="muted">{spacing.blockCount} caderno(s)</div>
        {state.error && <p className="field__error">{state.error}</p>}
      </td>
      <td colSpan={3}>
        <form action={formAction} className="spacing-form" noValidate>
          <input type="hidden" name="studyPlanId" value={studyPlanId} />
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="teacherId" value={teacherId} />
          <input type="hidden" name="subjectName" value={spacing.subject} />

          <label className="field field--narrow" htmlFor={`r1-${id}`}>
            <span className="field__label">1ª revisão</span>
            <input
              id={`r1-${id}`}
              name="firstInterval"
              type="number"
              min={MIN_INTERVAL}
              max={MAX_INTERVAL}
              defaultValue={spacing.firstInterval}
            />
          </label>

          <label className="field field--narrow" htmlFor={`r2-${id}`}>
            <span className="field__label">2ª revisão</span>
            <input
              id={`r2-${id}`}
              name="secondInterval"
              type="number"
              min={MIN_INTERVAL}
              max={MAX_INTERVAL}
              defaultValue={spacing.secondInterval}
            />
          </label>

          <Submit />
          {spacing.firstInterval === 0 && (
            <span className="muted">sem revisão programada</span>
          )}
        </form>
      </td>
    </tr>
  );
}

/**
 * A tabela de espaçamentos da ficha do aluno — spec 24.
 *
 * Toda disciplina do planejamento aparece, inclusive a que ainda não tem
 * espaçamento: é aqui que o professor a liga. Zero desliga — na primeira,
 * desliga a disciplina inteira; na segunda, só a segunda coluna.
 */
export function SpacingForms({
  spacings,
  studyPlanId,
  studentId,
  teacherId,
  doneMessage,
}: {
  spacings: readonly SubjectSpacing[];
  studyPlanId: string;
  studentId: string;
  teacherId: string;
  doneMessage?: string;
}) {
  return (
    <Card
      title="Revisão espaçada"
      sub="De quantos em quantos cadernos a disciplina volta. Zero desliga."
    >
      {doneMessage && <Alert kind="success">{doneMessage}</Alert>}
      {spacings.length === 0 ? (
        <p className="muted">Este planejamento ainda não tem cadernos.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Disciplina</th>
                <th colSpan={3}>Espaçamento</th>
              </tr>
            </thead>
            <tbody>
              {spacings.map((spacing) => (
                <SpacingRow
                  key={spacing.subject}
                  spacing={spacing}
                  studyPlanId={studyPlanId}
                  studentId={studentId}
                  teacherId={teacherId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
