// The cycles of a run. Run:
//   node --test src/crews/dev-implement/domain/cycles.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { cyclesLine, cyclesOf, stepsLabel } from "./cycles.ts";
import type { ImplementStep } from "./step-section.ts";

function step(number: number, file: string | null): ImplementStep {
  return {
    number, title: `s${number}`, tests: [], tdd: { red: false, green: false, cost: false, line: number }, note: [],
    anchor: file === null ? null : { testFiles: [{ path: file, state: "to create" }], doubles: "", production: [] },
  };
}

describe("cyclesOf", () => {
  it("groups consecutive steps on one test file, and keeps the others apart", () => {
    const cycles = cyclesOf([step(1, "tests/a.test.ts"), step(2, "tests/a.test.ts"), step(3, "tests/b.test.ts"), step(5, "tests/b.test.ts")]);
    deepStrictEqual(cycles.map((c) => c.steps.map((s) => s.number)), [[1, 2], [3], [5]]);
    strictEqual(cyclesLine(cycles), "cycle 1/3 — steps 1-2 (tests/a.test.ts); cycle 2/3 — step 3 (tests/b.test.ts); cycle 3/3 — step 5 (tests/b.test.ts)");
  });
  it("never groups steps without a test file", () => {
    deepStrictEqual(cyclesOf([step(1, null), step(2, null)]).map((c) => c.steps.length), [1, 1]);
  });
  it("labels a run and a list", () => {
    strictEqual(stepsLabel([step(1, null), step(3, null)]), "steps 1, 3");
  });
});
