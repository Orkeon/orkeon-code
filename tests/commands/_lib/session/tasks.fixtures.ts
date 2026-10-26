// The harness /tasks runs over (a FakeSessionStore, a clock at 10:05, a FakePendingApprovals), the agent instance
// records, the run snapshots the dev crews leave in the state bag, and the approvals the host shows waiting.
import { runTasks } from "../../../../src/commands/_lib/session/tasks.ts";
import type { PendingApproval } from "../../../../src/shared/application/ports.ts";
import { snapshotKey } from "../../../../src/shared/domain/agents/instances.ts";
import type { InstanceRecord, RunSnapshot } from "../../../../src/shared/domain/agents/instances.ts";
import { FakePendingApprovals } from "../../../support/doubles/fake-pending-approvals.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

export const EMPTY_TEXT = "no tasks and no agent instances. usage: /tasks add <subject>";

/** A running dev-reviewer instance `a1`, with `over` on top. */
export const record = (over: Partial<InstanceRecord> = {}): InstanceRecord => ({
  id: "a1", agent: "dev-reviewer", charter: "dev-reviewer", task: "review of the plan", state: "running",
  startedAt: "2026-10-24T10:00:00.000Z", effort: "low", system: "S", brief: "B", ...over,
});

/** A shell_command approval the background task `t1` of /dev-batches waits on, with `over` on top. */
export const approval = (over: Partial<PendingApproval> = {}): PendingApproval => ({
  taskId: "t1", command: "dev-batches", tool: "shell_command", input: '{"command":"npm test"}', ...over,
});

/** The line /tasks shows for `approval()`. */
export const APPROVAL_LINE = 't1 dev-batches: waits for approval of shell_command · {"command":"npm test"}';

/** /tasks over a fresh session at 10:05; `seed` leaves the snapshot of a run of `crew` (one running `a1` by default);
 *  `approvals.pending` is what the host shows waiting. */
export function tasksHarness() {
  const session = new FakeSessionStore();
  const approvals = new FakePendingApprovals();
  const run = (...tokens: string[]) => runTasks(tokens, { session, clock: () => new Date("2026-10-24T10:05:00.000Z"), approvals });
  const seed = (crew: string, over: Partial<RunSnapshot> = {}, ...instances: InstanceRecord[]) =>
    session.state.set(snapshotKey(crew), JSON.stringify({
      crew, step: crew, startedAt: "2026-10-24T10:00:00.000Z", updatedAt: "2026-10-24T10:04:59.000Z", serving: true, open: true,
      instances: instances.length > 0 ? instances : [record()], ...over,
    }));
  return { session, approvals, run, seed };
}
