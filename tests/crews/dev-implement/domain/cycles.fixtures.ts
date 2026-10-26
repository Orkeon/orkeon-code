// The steps the cycles are tested on.
import type { ImplementStep } from "../../../../src/crews/dev-implement/domain/step-section.ts";

/** An open step numbered `number`, anchored on the test file `file` (none when null). */
export function step(number: number, file: string | null): ImplementStep {
  return {
    number, title: `s${number}`, tests: [], tdd: { red: false, green: false, cost: false, line: number }, note: [],
    anchor: file === null ? null : { testFiles: [{ path: file, state: "to create" }], doubles: "", production: [] },
  };
}

/** Steps 1 and 2 on `tests/a.test.ts`, then 3 and 5 on `tests/b.test.ts`. */
export function twoFilesWithAGap(): ImplementStep[] {
  return [step(1, "tests/a.test.ts"), step(2, "tests/a.test.ts"), step(3, "tests/b.test.ts"), step(5, "tests/b.test.ts")];
}
