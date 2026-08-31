import { Card, Empty } from "@/components/ui";

export interface BlockTopic {
  readonly topic: string;
  readonly questions: number;
}

/**
 * O que cai no bloco, antes de estudar — spec 26.
 *
 * Recolhido de propósito: um bloco de 27 tópicos empurraria a tabela inteira
 * para fora da tela. É o `<details>` "Ver o que será estudado" da v96.
 */
export function BlockTopics({ topics }: { topics: readonly BlockTopic[] }) {
  if (topics.length === 0) return null;

  return (
    <details className="block-topics">
      <summary>Ver o que será estudado ({topics.length} tópicos)</summary>
      <ul className="list block-topics__list">
        {topics.map((item) => (
          <li key={item.topic}>
            {item.topic} <span className="muted">· {item.questions} questão(ões)</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export interface SessionTopicRow {
  readonly topic: string | null;
  readonly answered: number | null;
  readonly correct: number | null;
  readonly incorrect: number | null;
  readonly main_count: number | null;
  readonly main_correct: number | null;
  readonly reinforcement_count: number | null;
  readonly reinforcement_correct: number | null;
  readonly extra_count: number | null;
  readonly extra_correct: number | null;
}

/** `3/5` ou `—` quando a fase não teve questão nenhuma. */
function phase(count: number | null, correct: number | null): string {
  return (count ?? 0) === 0 ? "—" : `${correct ?? 0}/${count}`;
}

/**
 * Como foi a bateria, por tópico — spec 26.
 *
 * É o recorte de UMA bateria. O acumulado do planejamento é
 * `TopicDifficulty`, da spec 23, e as duas respondem a perguntas diferentes:
 * "como foi hoje" e "onde estou errando sempre".
 */
export function SessionTopics({
  rows,
  title = "Tópicos desta bateria",
  sub,
}: {
  rows: readonly SessionTopicRow[];
  title?: string;
  sub?: string;
}) {
  return (
    <Card title={title} sub={sub}>
      {rows.length === 0 ? (
        <Empty>Nenhuma questão registrada nesta bateria.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tópico</th>
                <th className="num">Feitas</th>
                <th className="num">Acertos</th>
                <th className="num">Principais</th>
                <th className="num">Reforços</th>
                <th className="num">Extras</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.topic}>
                  <td>
                    <strong>{row.topic}</strong>
                  </td>
                  <td className="num">{row.answered}</td>
                  <td className="num">
                    {row.correct}
                    <span className="muted"> ({row.incorrect} erro(s))</span>
                  </td>
                  <td className="num">{phase(row.main_count, row.main_correct)}</td>
                  <td className="num">
                    {phase(row.reinforcement_count, row.reinforcement_correct)}
                  </td>
                  <td className="num">{phase(row.extra_count, row.extra_correct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
