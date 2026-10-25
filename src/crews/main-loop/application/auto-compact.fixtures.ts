// The ports of the auto-compaction breaker over fakes, and the session states its counter is read from.
import type { CompactOutcome } from "../../../shared/domain/compact-outcome.ts";
import { AUTOCOMPACT_BREAKER_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { BREAKER_RUN_FIELD } from "./auto-compact.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeRunState } from "../../../../tests/support/fake-run-state.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

/** The breaker's ports over fakes; `outcome` is what every compaction attempt returns, `attempts()` how many ran. */
export function breakerSetup(outcome: CompactOutcome = { status: "skipped" }) {
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

export interface CounterCase {
  /** The state of the session, as the test name says it. */
  name: string;
  /** Sets the session and the run state up. */
  arrange: (session: FakeSessionStore, run: FakeRunState) => void;
  expected: number;
}

/** The run state mirrors 3: the session holds no counter, an empty one, or is down. */
export const RUN_STATE_FALLBACKS: readonly CounterCase[] = [
  {
    name: "the session holds no counter",
    arrange: (_session, run) => { run.fields[BREAKER_RUN_FIELD] = 3; },
    expected: 3,
  },
  {
    name: "the session holds an empty counter",
    arrange: (session, run) => {
      run.fields[BREAKER_RUN_FIELD] = 3;
      session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "");
    },
    expected: 3,
  },
  {
    name: "the session is down",
    arrange: (session, run) => {
      run.fields[BREAKER_RUN_FIELD] = 3;
      session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "");
      session.failure = new Error("no session tools");
    },
    expected: 3,
  },
];

/** Counters read as 0: none anywhere, or an unparsable one in the session. */
export const ZERO_COUNTERS: readonly CounterCase[] = [
  { name: "no counter in the session nor a mirror", arrange: () => {}, expected: 0 },
  {
    name: "an unparsable session counter",
    arrange: (session) => { session.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "many"); },
    expected: 0,
  },
];
