import { Badge, Card, Empty } from "@/components/ui";
import { RECURRENT_SESSIONS, TOPIC_ATTENTION_PCT } from "@/lib/data/student";

export interface TopicRow {
  readonly block_id: string | null;
  readonly topic: string | null;
  readonly answered: number | null;
  readonly incorrect: number | null;
  readonly distinct_wrong: number | null;
  readonly sessions_with_error: number | null;
  readonly score_pct: number | null;
  readonly recurrent: boolean;
}

/**
 * Onde o aluno está errando — spec 23.
 *
 * A mesma tabela serve à ficha do professor e às estatísticas do aluno: a
 * pergunta é a mesma, e a RLS já decide o que cada um enxerga.
 *
 * "Recorrente" é erro em duas baterias **distintas**. Errar duas vezes na mesma
 * bateria pode ser não ter entendido o enunciado; errar em duas diferentes é
 * não saber a matéria — e é a distinção que decide a intervenção.
 */
export function TopicDifficulty({
  rows,
  blockNames,
  title = "Dificuldades por tópico",
}: {
  rows: readonly TopicRow[];
  blockNames: ReadonlyMap<string, string>;
  title?: string;
}) {
  const recorrentes = rows.filter((row) => row.recurrent).length;

  return (
    <Card
      title={title}
      sub={
        rows.length
          ? `${rows.length} tópico(s) com erro · ${recorrentes} recorrente(s)`
          : undefined
      }
    >
      {rows.length === 0 ? (
        <Empty>Nenhum erro registrado ainda. Nada a reforçar por tópico.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tópico</th>
                <th>Bloco</th>
                <th className="num">Respondidas</th>
                <th className="num">Erros</th>
                <th className="num">Questões distintas</th>
                <th className="num">Acerto</th>
                <th>Diagnóstico</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.block_id}-${row.topic}`}>
                  <td>
                    <strong>{row.topic}</strong>
                  </td>
                  <td className="muted">
                    {(row.block_id && blockNames.get(row.block_id)) ?? "—"}
                  </td>
                  <td className="num">{row.answered}</td>
                  <td className="num">
                    <strong>{row.incorrect}</strong>
                    <div className="muted">
                      em {row.sessions_with_error} bateria(s)
                    </div>
                  </td>
                  <td className="num">{row.distinct_wrong}</td>
                  <td className="num">
                    {row.score_pct === null ? "—" : `${row.score_pct}%`}
                  </td>
                  <td>
                    {row.recurrent ? (
                      <Badge tone="red">Recorrente</Badge>
                    ) : (row.score_pct ?? 100) < TOPIC_ATTENTION_PCT ? (
                      <Badge tone="amber">Atenção</Badge>
                    ) : (
                      <Badge tone="neutral">Pontual</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="muted">
          Recorrente é erro em {RECURRENT_SESSIONS} ou mais baterias diferentes — errar duas
          vezes na mesma pode ser o enunciado; em duas diferentes, é a matéria.
        </p>
      )}
    </Card>
  );
}
