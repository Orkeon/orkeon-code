// The time of a dev step's phases, added up and said in one line. Run:
//   node --test tests/shared/domain/dev/phase-timing.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { NO_TIMING, durationText, recordPhase, startPhase, timingLine } from "../../../../src/shared/domain/dev/phase-timing.ts";
import type { PhaseTiming } from "../../../../src/shared/domain/dev/phase-timing.ts";
import { DURATION_CASES, LINE_CASES, RECORD_CASES, START_CASES } from "./phase-timing.fixtures.ts";

describe("recordPhase", () => {
  for (const c of RECORD_CASES) {
    it(c.name, () => {
      // Arrange
      const timing = c.runs.reduce<PhaseTiming>((t, [phase, ms, unit]) => recordPhase(t, phase, ms, unit), NO_TIMING);
      const [phase, ms, unit] = c.last;

      // Act
      const recorded = recordPhase(timing, phase, ms, unit);

      // Assert
      deepStrictEqual(recorded, c.expected);
    });
  }
});

describe("startPhase", () => {
  for (const c of START_CASES) {
    it(c.name, () => {
      // Arrange
      const timing = c.runs.reduce<PhaseTiming>((t, [phase, ms, unit]) => recordPhase(t, phase, ms, unit), NO_TIMING);

      // Act
      const started = startPhase(timing, c.phase);

      // Assert
      deepStrictEqual(started, c.expected);
    });
  }
});

describe("durationText", () => {
  for (const c of DURATION_CASES) {
    it(c.name, () => {
      // Arrange
      const ms = c.ms;

      // Act
      const text = durationText(ms);

      // Assert
      strictEqual(text, c.expected);
    });
  }
});

describe("timingLine", () => {
  for (const c of LINE_CASES) {
    it(c.name, () => {
      // Arrange
      const recorded = c.runs.reduce<PhaseTiming>((t, [phase, ms, unit]) => recordPhase(t, phase, ms, unit), NO_TIMING);
      const timing = (c.started ?? []).reduce<PhaseTiming>((t, phase) => startPhase(t, phase), recorded);

      // Act
      const line = timingLine(timing);

      // Assert
      strictEqual(line, c.expected);
    });
  }
});
