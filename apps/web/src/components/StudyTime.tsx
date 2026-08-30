import { useState } from "react";

import { Badge, Card, Empty } from "@/components/ui";
import {
  PERIODS,
  formatMinutes,
  streak,
  summarize,
  weeklySeries,
  type Period,
  type StudyRow,
} from "@/lib/domain/study-time";

/**
 * Tempo de estudo por período — spec 25.
 *
 * O período é estado de tela e não vai para o banco: as linhas do planejamento
 * inteiro já vieram, e filtrar é função pura. Trocar de aba não busca nada.
 */
export function StudyTime({ rows, today }: { rows: readonly StudyRow[]; today: Date }) {
  const [period, setPeriod] = useState<Period>("semana");
  const summary = summarize(rows, period, today);

  return (
    <Card
      title="Tempo de estudo"
      sub="Tempo real registrado, por disciplina e por atividade"
      action={
        <div className="period-tabs" role="group" aria-label="Período do tempo de estudo">
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`period-tab${period === option.id ? " is-active" : ""}`}
              aria-pressed={period === option.id}
              onClick={() => setPeriod(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      <p className="study-total">
        <strong>{formatMinutes(summary.total)}</strong>
        <span className="muted"> em {summary.goals} meta(s) concluída(s)</span>
      </p>

      {summary.groups.length === 0 ? (
        // Zero e "não registrou" são coisas diferentes, e a tela diz qual é.
        <Empty>Nenhum tempo registrado neste período.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Disciplina ou atividade</th>
                <th className="num">Metas</th>
                <th className="num">Tempo</th>
                <th className="num">Fatia</th>
              </tr>
            </thead>
            <tbody>
              {summary.groups.map((group) => (
                <tr key={`${group.kind}-${group.label}`}>
                  <td>
                    <strong>{group.label}</strong>{" "}
                    {group.kind === "activity" && <Badge tone="neutral">Atividade</Badge>}
                  </td>
                  <td className="num">{group.goals}</td>
                  <td className="num">{formatMinutes(group.minutes)}</td>
                  <td className="num">
                    {summary.total > 0
                      ? `${Math.round((group.minutes / summary.total) * 100)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Dias seguidos com meta concluída — spec 25. */
export function StudyStreak({ rows, today }: { rows: readonly StudyRow[]; today: Date }) {
  const days = streak(rows, today);

  return (
    <Card title="Sequência" sub="Dias seguidos com pelo menos uma meta concluída">
      <p className="streak-value">
        <strong>{days}</strong>
        <span className="muted"> dia{days === 1 ? "" : "s"} de estudo</span>
      </p>
      {days === 0 && (
        <p className="muted">
          A sequência conta a partir de hoje, e tolera o dia de hoje ainda vazio —
          zera quando ontem também não teve nada.
        </p>
      )}
    </Card>
  );
}

/** Evolução semana a semana — spec 25. */
export function WeeklySeries({
  rows,
  plannedWeeks,
}: {
  rows: readonly StudyRow[];
  plannedWeeks: readonly number[];
}) {
  const series = weeklySeries(rows, plannedWeeks);

  return (
    <Card title="Semana a semana" sub="Metas concluídas, questões e tempo por semana do planejamento">
      {series.length === 0 ? (
        <Empty>Nenhuma semana planejada ainda.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Semana</th>
                <th className="num">Metas</th>
                <th className="num">Questões</th>
                <th className="num">Acertos</th>
                <th className="num">Tempo</th>
                <th className="num">Desempenho</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.week}>
                  <td>
                    <strong>Semana {point.week}</strong>
                  </td>
                  <td className="num">{point.goals}</td>
                  <td className="num">{point.questions}</td>
                  <td className="num">{point.correct}</td>
                  <td className="num">{formatMinutes(point.minutes)}</td>
                  <td className="num">
                    {/* Nulo é "não respondeu nada", que não é 0%. */}
                    {point.score === null ? "—" : `${point.score}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
