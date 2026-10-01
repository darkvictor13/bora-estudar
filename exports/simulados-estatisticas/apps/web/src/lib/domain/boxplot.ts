export interface BoxPlotSummary {
  readonly count: number;
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
  readonly lowerWhisker: number;
  readonly upperWhisker: number;
  readonly outliers: readonly number[];
}

/** Quartis interpolados (percentil tipo 7), com bigodes limitados a 1,5 × IQR. */
export function calculateBoxPlot(values: readonly number[]): BoxPlotSummary | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0 && value <= 100).sort((a, b) => a - b);
  if (sorted.length < 5) return null;

  const percentile = (portion: number) => {
    const position = (sorted.length - 1) * portion;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return (sorted[low] ?? 0) + ((sorted[high] ?? 0) - (sorted[low] ?? 0)) * (position - low);
  };
  const q1 = percentile(0.25);
  const median = percentile(0.5);
  const q3 = percentile(0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const within = sorted.filter((value) => value >= lowerBound && value <= upperBound);

  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    q1,
    median,
    q3,
    max: sorted.at(-1) ?? 0,
    lowerWhisker: within[0] ?? q1,
    upperWhisker: within.at(-1) ?? q3,
    outliers: sorted.filter((value) => value < lowerBound || value > upperBound),
  };
}
