import assert from "node:assert/strict";
import test from "node:test";

import { calculateBoxPlot } from "./boxplot.ts";

test("boxplot calcula quartis e separa resultado atípico", () => {
  assert.deepEqual(calculateBoxPlot([80, 55, 70, 0, 65, 50, 75, 60, 85]), {
    count: 9, min: 0, q1: 55, median: 65, q3: 75, max: 85,
    lowerWhisker: 50, upperWhisker: 85, outliers: [0],
  });
});

test("amostra pequena não vira boxplot aparentemente preciso", () => {
  assert.equal(calculateBoxPlot([60, 70, 80, 90]), null);
  assert.equal(calculateBoxPlot([NaN, 101, -1, 70, 80, 90, 100]), null);
});
