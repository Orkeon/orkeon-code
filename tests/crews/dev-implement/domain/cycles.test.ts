// The cycles of a run. Run:
//   node --test src/crews/dev-implement/domain/cycles.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { cyclesLine, cyclesOf, stepsLabel } from "../../../../src/crews/dev-implement/domain/cycles.ts";
import { step, twoFilesWithAGap } from "./cycles.fixtures.ts";

describe("cyclesOf", () => {
  it("groups consecutive steps on one test file, and keeps the others apart", () => {
    // Arrange
    const steps = twoFilesWithAGap();

    // Act
    const cycles = cyclesOf(steps);

    // Assert
    deepStrictEqual(cycles.map((c) => c.steps.map((s) => s.number)), [[1, 2], [3], [5]]);
  });

  it("writes each cycle on one line, its steps and its test file", () => {
    // Arrange
    const cycles = cyclesOf(twoFilesWithAGap());

    // Act
    const line = cyclesLine(cycles);

    // Assert
    strictEqual(line, "cycle 1/3 — steps 1-2 (tests/a.test.ts); cycle 2/3 — step 3 (tests/b.test.ts); cycle 3/3 — step 5 (tests/b.test.ts)");
  });

  it("never groups steps without a test file", () => {
    // Arrange
    const steps = [step(1, null), step(2, null)];

    // Act
    const cycles = cyclesOf(steps);

    // Assert
    deepStrictEqual(cycles.map((c) => c.steps.length), [1, 1]);
  });

  it("labels a run and a list", () => {
    // Arrange
    const steps = [step(1, null), step(3, null)];

    // Act
    const label = stepsLabel(steps);

    // Assert
    strictEqual(label, "steps 1, 3");
  });
});
