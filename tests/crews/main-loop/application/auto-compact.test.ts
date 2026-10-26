// The auto-compaction breaker and its storage, over the session and run-state fakes. Run:
//   node --test src/crews/main-loop/application/auto-compact.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  BREAKER_RUN_FIELD, autoCompactGuarded, readBreakerFailures, writeBreakerFailures,
} from "../../../../src/crews/main-loop/application/auto-compact.ts";
import { AUTOCOMPACT_BREAKER_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { RUN_STATE_FALLBACKS, ZERO_COUNTERS, breakerSetup } from "./auto-compact.fixtures.ts";

describe("breaker storage", () => {
  it("writes the counter to the session, mirrored in the run state", async () => {
    // Arrange
    const { session, run, deps } = breakerSetup();

    // Act
    await writeBreakerFailures(deps, 2);

    // Assert
    strictEqual(session.state.get(AUTOCOMPACT_BREAKER_STATE_KEY), "2");
    strictEqual(run.fields[BREAKER_RUN_FIELD], 2);
  });

  it("reads back the counter it wrote", async () => {
    // Arrange
    const { deps } = breakerSetup();
    await writeBreakerFailures(deps, 2);

    // Act
    const failures = await readBreakerFailures(deps);

    // Assert
    strictEqual(failures, 2);
  });

  it("prefers the session's counter to the run state's", async () => {
    // Arrange
    const { session, run, deps } = breakerSetup();
    session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "1");
    run.fields[BREAKER_RUN_FIELD] = 3;

    // Act
    const failures = await readBreakerFailures(deps);

    // Assert
    strictEqual(failures, 1);
  });

  for (const c of RUN_STATE_FALLBACKS) {
    it(`falls back to the run state when ${c.name}`, async () => {
      // Arrange
      const { session, run, deps } = breakerSetup();
      c.arrange(session, run);

      // Act
      const failures = await readBreakerFailures(deps);

      // Assert
      strictEqual(failures, c.expected);
    });
  }

  for (const c of ZERO_COUNTERS) {
    it(`reads ${c.name} as 0`, async () => {
      // Arrange
      const { session, run, deps } = breakerSetup();
      c.arrange(session, run);

      // Act
      const failures = await readBreakerFailures(deps);

      // Assert
      strictEqual(failures, c.expected);
    });
  }

  it("still mirrors the counter when the session is down", async () => {
    // Arrange
    const { session, run, deps } = breakerSetup();
    session.failure = new Error("no session tools");

    // Act
    await writeBreakerFailures(deps, 1);

    // Assert
    strictEqual(run.fields[BREAKER_RUN_FIELD], 1);
  });

  it("reads back the mirrored counter when the session is down", async () => {
    // Arrange
    const { session, deps } = breakerSetup();
    session.failure = new Error("no session tools");
    await writeBreakerFailures(deps, 1);

    // Act
    const failures = await readBreakerFailures(deps);

    // Assert
    strictEqual(failures, 1);
  });
});

describe("autoCompactGuarded", () => {
  it("resets the counter after a compaction that worked, and reports it", async () => {
    // Arrange
    const { session, run, log, deps } = breakerSetup({ status: "compacted", before: 9, after: 3 });
    session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "2");

    // Act
    await autoCompactGuarded(deps);

    // Assert
    strictEqual(session.state.get(AUTOCOMPACT_BREAKER_STATE_KEY), "0");
    strictEqual(run.fields[BREAKER_RUN_FIELD], 0);
    deepStrictEqual(log.lines, ["info: auto-compact: compacted"]);
  });

  it("leaves the counter and the log alone when the compaction skips", async () => {
    // Arrange
    const { session, run, log, deps } = breakerSetup({ status: "skipped", reason: "below trigger" });
    session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "1");

    // Act
    await autoCompactGuarded(deps);

    // Assert
    strictEqual(session.state.get(AUTOCOMPACT_BREAKER_STATE_KEY), "1");
    deepStrictEqual(run.fields, {});
    deepStrictEqual(log.lines, []);
  });

  it("does not attempt a compaction once the breaker is open", async () => {
    // Arrange
    const { run, log, deps, attempts } = breakerSetup({ status: "failed", reason: "x" });
    run.fields[BREAKER_RUN_FIELD] = 3;

    // Act
    await autoCompactGuarded(deps);

    // Assert
    strictEqual(attempts(), 0);
    deepStrictEqual(log.lines, ["warn: auto-compact suppressed (breaker open after 3 consecutive failures)"]);
  });
});
