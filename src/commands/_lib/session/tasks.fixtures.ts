// The harness /tasks runs over (a FakeSessionStore, a clock at 10:05), the agent instance records and the run
// snapshots the dev crews leave in the state bag.
import { runTasks } from "./tasks.ts";
import { snapshotKey } from "../../../shared/domain/agents/instances.ts";
import type { InstanceRecord, RunSnapshot } from "../../../shared/domain/agents/instances.ts";
import { FakeSessionStore } from "../../../../tests/support/doubles/fake-session-store.ts";

export const EMPTY_TEXT = "no tasks and no agent instances. usage: /tasks add <subject>";

/** A running dev-reviewer instance `a1`, with `over` on top. */
export const record = (over: Partial<InstanceRecord> = {}): InstanceRecord => ({
  id: "a1", agent: "dev-reviewer", charter: "dev-reviewer", task: "review of the plan", state: "running",
  startedAt: "2026-10-24T10:00:00.000Z", effort: "low", system: "S", brief: "B", ...over,
});

/** /tasks over a fresh session at 10:05; `seed` leaves the snapshot of a run of `crew` (one running `a1` by default). */
export function tasksHarness() {
  const session = new FakeSessionStore();
  const run = (...tokens: string[]) => runTasks(tokens, { session, clock: () => new Date("2026-10-24T10:05:00.000Z") });
  const seed = (crew: string, over: Partial<RunSnapshot> = {}, ...instances: InstanceRecord[]) =>
    session.state.set(snapshotKey(crew), JSON.stringify({
      crew, step: crew, startedAt: "2026-10-24T10:00:00.000Z", updatedAt: "2026-10-24T10:04:59.000Z", serving: true, open: true,
      instances: instances.length > 0 ? instances : [record()], ...over,
    }));
  return { session, run, seed };
}
