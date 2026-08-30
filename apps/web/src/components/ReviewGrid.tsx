import { useFormStatus } from "react-dom";

import { Badge, Card, Empty } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import { setReviewDone } from "@/lib/data/goal-actions";
import { gridProgress, type ReviewCell, type SubjectGrid } from "@/lib/domain/spacing";

function Submit({ done }: { done: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn btn--sm ${done ? "btn--ghost" : "btn--primary"}`}
      disabled={pending}
    >
      {pending ? "…" : done ? "Desfazer" : "Marcar feita"}
    </button>
  );
}

/**
 * Uma célula da grade: o caderno a revisar e a caixa de feito.
 *
 * O formulário é por célula porque a ação é por célula. `ordinal` viaja no
 * corpo, e não no id do bloco: a mesma aula pode aparecer na primeira coluna de
 * uma linha e na segunda de outra, e as duas revisões são fatos diferentes.
 */
function Cell({
  cell,
  ordinal,
  studyPlanId,
  redirectTo,
}: {
  cell: ReviewCell | null;
  ordinal: 1 | 2;
  studyPlanId: string;
  redirectTo: string;
}) {
  const [state, formAction] = useFormActionState(setReviewDone);

  if (!cell) {
    return <span className="muted">—</span>;
  }

  return (
    <div className="review-cell">
      <div>
        <strong>{cell.block.name}</strong>
        {cell.done && (
          <>
            {" "}
            <Badge tone="green">Feita</Badge>
          </>
        )}
      </div>
      {state.error && <p className="field__error">{state.error}</p>}
      <form action={formAction}>
        <input type="hidden" name="studyPlanId" value={studyPlanId} />
        <input type="hidden" name="blockId" value={cell.block.id} />
        <input type="hidden" name="ordinal" value={ordinal} />
        <input type="hidden" name="done" value={String(!cell.done)} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <Submit done={cell.done} />
      </form>
    </div>
  );
}

/**
 * A grade de revisão espaçada — spec 24.
 *
 * Nada aqui é lido do banco: as linhas saem de `buildGrid`, sobre o
 * espaçamento e a ordem dos blocos. O que o banco guarda é o espaçamento e as
 * marcações.
 */
export function ReviewGrid({
  grids,
  studyPlanId,
  redirectTo,
  emptyHint,
  emptyTitle = "Revisão espaçada",
}: {
  grids: readonly SubjectGrid[];
  studyPlanId: string;
  redirectTo: string;
  emptyHint: string;
  /**
   * Título do cartão vazio. Na ficha do professor ele convive com o cartão de
   * ajustes, que também se chama "Revisão espaçada": dois cartões com o mesmo
   * título deixam a tela ambígua para quem lê e para o teste.
   */
  emptyTitle?: string;
}) {
  if (grids.length === 0) {
    return (
      <Card title={emptyTitle}>
        <Empty>{emptyHint}</Empty>
      </Card>
    );
  }

  return (
    <>
      {grids.map((grid) => {
        const progress = gridProgress(grid);
        return (
          <Card
            key={grid.subject}
            title={grid.subject}
            sub={
              `1ª revisão a cada ${grid.firstInterval} caderno(s)` +
              (grid.secondInterval > 0
                ? ` · 2ª a cada ${grid.secondInterval} depois`
                : " · sem segunda revisão") +
              ` · ${progress.done} de ${progress.available} feita(s)`
            }
          >
            <div className="table-wrap">
              <table className="review-table">
                <thead>
                  <tr>
                    <th>Caderno atual</th>
                    <th>1ª revisão</th>
                    <th>2ª revisão</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => (
                    <tr key={row.current.id}>
                      <td>
                        <strong>{row.current.name}</strong>
                        {row.current.link && (
                          <div>
                            <a href={row.current.link} target="_blank" rel="noopener noreferrer">
                              Abrir caderno
                            </a>
                          </div>
                        )}
                      </td>
                      <td>
                        <Cell
                          cell={row.first}
                          ordinal={1}
                          studyPlanId={studyPlanId}
                          redirectTo={redirectTo}
                        />
                      </td>
                      <td>
                        {grid.secondInterval > 0 ? (
                          <Cell
                            cell={row.second}
                            ordinal={2}
                            studyPlanId={studyPlanId}
                            redirectTo={redirectTo}
                          />
                        ) : (
                          <span className="muted">Não usada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </>
  );
}
