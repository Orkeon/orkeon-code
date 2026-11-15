// The phases of a dev step timed with the Clock port: the step's result returned, its time recorded, a failing
// step recorded and its error rethrown, a step inside another counted apart, the extractions of a model timed.
// Run:  node --test tests/shared/application/dev/phase-timer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { BOOM, READ_REQUEST, tickingTimer } from "./phase-timer.fixtures.ts";

describe("PhaseTimer", () => {
  it("returns the result of the step it times", async () => {
    // Arrange
    const { timer } = tickingTimer();

    // Act
    const result = await timer.time("inventory", async () => 42);

    // Assert
    strictEqual(result, 42);
  });

  it("records the time between the reads before and after a step under its phase", async () => {
    // Arrange
    const { timer } = tickingTimer(3_000);

    // Act
    await timer.time("questions", async () => "Yes", "round");

    // Assert
    deepStrictEqual(timer.timing, [{ phase: "questions", ms: 3_000, runs: 1, unit: "round" }]);
  });

  it("ends its line on the time no phase took, the total being the run's own", async () => {
    // Arrange
    const { timer } = tickingTimer(2_000);
    await timer.time("draft", async () => "spec");

    // Act
    const line = timer.line();

    // Assert
    strictEqual(line, "timing: draft 2 s · other 4 s — total 6 s");
  });

  it("records a step that throws and rethrows its error", async () => {
    // Arrange
    const { timer } = tickingTimer(2_000);

    // Act
    const error = await timer.time("draft", () => Promise.reject(BOOM)).catch((e: unknown) => e);

    // Assert
    strictEqual(error, BOOM);
    deepStrictEqual(timer.timing, [{ phase: "draft", ms: 2_000, runs: 1, unit: "attempt" }]);
  });

  it("counts a step timed inside another for its own phase alone, after the phase around it", async () => {
    // Arrange
    const { timer } = tickingTimer(1_000);

    // Act
    await timer.time("questions", () => timer.time("fold", async () => null, "round"), "round");

    // Assert
    deepStrictEqual(timer.timing.map((p) => [p.phase, p.ms]), [["questions", 2_000], ["fold", 1_000]]);
  });

  it("times each extraction of the model it wraps under the phase named", async () => {
    // Arrange
    const { timer, llm } = tickingTimer(4_000);
    const timed = timer.timedExtract(llm, "review extract");

    // Act
    await timed.extract("the answer as JSON", {});

    // Assert
    deepStrictEqual(timer.timing, [{ phase: "review extract", ms: 4_000, runs: 1, unit: "attempt" }]);
  });

  it("leaves the act of the model it wraps untimed", async () => {
    // Arrange
    const { timer, llm } = tickingTimer(4_000);
    const timed = timer.timedExtract(llm, "review extract");

    // Act
    await timed.act("review the plan", READ_REQUEST);

    // Assert
    deepStrictEqual([timer.timing, llm.acts.length], [[], 1]);
  });
});
