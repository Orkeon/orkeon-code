// The auto-compaction breaker and its storage, over the session and run-state fakes. Run:
//   node --test src/crews/main-loop/application/auto-compact.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  BREAKER_RUN_FIELD, autoCompactGuarded, readBreakerFailures, writeBreakerFailures,
} from "./auto-compact.ts";
import type { CompactOutcome } from "../../../shared/domain/compact-outcome.ts";
import { AUTOCOMPACT_BREAKER_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeRunState } from "../../../../tests/support/fake-run-state.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

function setup(outcome: CompactOutcome = { status: "skipped" }) {
  const session = new FakeSessionStore();
  const run = new FakeRunState();
  const log = new FakeLogger();
  let attempts = 0;
  const deps = {
    session, run, log,
    compact: async () => {
      attempts++;
      return outcome;
    },
  };
  return { session, run, log, deps, attempts: () => attempts };
}

describe("breaker storage", () => {
  it("round-trips the counter through the session, mirrored in the run state", async () => {
    const { session, run, deps } = setup();
    await writeBreakerFailures(deps, 2);
    strictEqual(session.state.get(AUTOCOMPACT_BREAKER_STATE_KEY), "2");
    strictEqual(run.fields[BREAKER_RUN_FIELD], 2);
    strictEqual(await readBreakerFailures(deps), 2);
  });

  it("prefers the session's counter to the run state's", async () => {
    const { session, run, deps } = setup();
    session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "1");
    run.fields[BREAKER_RUN_FIELD] = 3;
    strictEqual(await readBreakerFailures(deps), 1);
  });

  it("falls back to the run state when the session holds no counter, or is down", async () => {
    const { session, run, deps } = setup();
    run.fields[BREAKER_RUN_FIELD] = 3;
    strictEqual(await readBreakerFailures(deps), 3);
    session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "");
    strictEqual(await readBreakerFailures(deps), 3);
    session.failure = new Error("no session tools");
    strictEqual(await readBreakerFailures(deps), 3);
  });

  it("reads an unparsable session counter as 0, and an absent mirror as 0", async () => {
    const { session, deps } = setup();
    strictEqual(await readBreakerFailures(deps), 0);
    session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "many");
    strictEqual(await readBreakerFailures(deps), 0);
  });

  it("still mirrors the counter when the session is down", async () => {
    const { session, run, deps } = setup();
    session.failure = new Error("no session tools");
    await writeBreakerFailures(deps, 1);
    strictEqual(run.fields[BREAKER_RUN_FIELD], 1);
    strictEqual(await readBreakerFailures(deps), 1);
  });
});

describe("autoCompactGuarded", () => {
  it("resets the counter after a compaction that worked, and reports it", async () => {
    const { session, run, log, deps } = setup({ status: "compacted", before: 9, after: 3 });
    session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "2");
    await autoCompactGuarded(deps);
    strictEqual(session.state.get(AUTOCOMPACT_BREAKER_STATE_KEY), "0");
    strictEqual(run.fields[BREAKER_RUN_FIELD], 0);
    deepStrictEqual(log.lines, ["info: auto-compact: compacted"]);
  });

  it("leaves the counter and the log alone when the compaction skips", async () => {
    const { session, run, log, deps } = setup({ status: "skipped", reason: "below trigger" });
    session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "1");
    await autoCompactGuarded(deps);
    strictEqual(session.state.get(AUTOCOMPACT_BREAKER_STATE_KEY), "1");
    deepStrictEqual(run.fields, {});
    deepStrictEqual(log.lines, []);
  });

  it("does not attempt a compaction once the breaker is open", async () => {
    const { run, log, deps, attempts } = setup({ status: "failed", reason: "x" });
    run.fields[BREAKER_RUN_FIELD] = 3;
    await autoCompactGuarded(deps);
    strictEqual(attempts(), 0);
    deepStrictEqual(log.lines, ["warn: auto-compact suppressed (breaker open after 3 consecutive failures)"]);
  });
});
