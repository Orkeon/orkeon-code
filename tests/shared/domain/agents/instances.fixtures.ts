// The records, snapshots and raw values the agent instances are tested on.
import { SNAPSHOT_STALE_MS, settleSnapshot } from "../../../../src/shared/domain/agents/instances.ts";
import type { InstanceRecord, Located, RunSnapshot } from "../../../../src/shared/domain/agents/instances.ts";

/** A completed dev-reviewer instance a1; `over` replacing some fields. */
export const record = (over: Partial<InstanceRecord> = {}): InstanceRecord => ({
  id: "a1", agent: "dev-reviewer", charter: "dev-reviewer", task: "review of the plan", state: "completed",
  startedAt: "2026-10-24T10:00:00.000Z", system: "sys", brief: "the brief", ...over,
});

/** An open dev-plan run that answers, holding record(); `over` replacing some fields. */
export const snapshot = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  crew: "dev-plan", step: "dev-plan", startedAt: "2026-10-24T10:00:00.000Z", updatedAt: "", serving: true,
  open: true, instances: [record()], ...over,
});

/** A snapshot with a record of an unknown state and a record without agent. */
export const RAW_SNAPSHOT = JSON.stringify({ ...snapshot(), instances: [{ ...record(), state: "weird" }, { id: "a2" }] });

export interface RawCase { name: string; raw: string | null }

export const NOT_SNAPSHOTS: readonly RawCase[] = [
  { name: "nothing", raw: null },
  { name: "bad JSON", raw: "{" },
  { name: "a shape that is not a snapshot", raw: JSON.stringify({ crew: "x" }) },
];

export const STOP_REQUEST = { action: "stop", run: "r", at: "t" };

export const NO_REQUESTS: readonly RawCase[] = [
  { name: "a cleared value", raw: "" },
  { name: "a send", raw: JSON.stringify({ action: "send", message: "hi" }) },
  { name: "bad JSON", raw: "nope" },
];

export interface LimitCase {
  name: string;
  raw: { concurrency?: unknown; maxInstances?: unknown } | undefined;
  limits: { concurrency: number; maxInstances: number };
}

export const LIMIT_CASES: readonly LimitCase[] = [
  { name: "integers within the bounds", raw: { concurrency: 2, maxInstances: "10" }, limits: { concurrency: 2, maxInstances: 10 } },
  { name: "0 and 65", raw: { concurrency: 0, maxInstances: 65 }, limits: { concurrency: 4, maxInstances: 32 } },
  { name: "1.5 and an empty string", raw: { concurrency: 1.5, maxInstances: "" }, limits: { concurrency: 4, maxInstances: 32 } },
  { name: "nothing", raw: undefined, limits: { concurrency: 4, maxInstances: 32 } },
];

/** The dev-plan run and a dev-verify run, both holding an instance a1. */
export const PLAN = snapshot();
export const VERIFY = snapshot({ crew: "dev-verify", instances: [record({ agent: "dev-auditor" })] });

/** An instance located in its run. */
export const at = (r: Partial<InstanceRecord>, s: Partial<RunSnapshot> = {}): Located => ({ snapshot: snapshot(s), record: record(r) });

export interface StopCase { name: string; located: Located; ok: boolean }

export const STOP_CASES: readonly StopCase[] = [
  { name: "a running instance of a run that answers", located: at({ state: "running" }), ok: true },
  { name: "a completed instance", located: at({ state: "completed" }), ok: false },
  { name: "a running instance of a run that does not answer", located: at({ state: "running" }, { serving: false }), ok: false },
];

export interface SendCase { name: string; located: Located; kind: "refused" | "repair" }

export const SEND_CASES: readonly SendCase[] = [
  { name: "refused while running", located: at({ state: "running" }), kind: "refused" },
  { name: "a repair once completed", located: at({ state: "completed" }), kind: "repair" },
  { name: "a repair once failed, its run not answering", located: at({ state: "failed" }, { serving: false }), kind: "repair" },
];

export const NOW = new Date("2026-10-24T10:10:00.000Z");
/** The time `ms` milliseconds before NOW. */
export const written = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

export interface KeptCase { name: string; snapshot: RunSnapshot }

export const KEPT_RUNS: readonly KeptCase[] = [
  { name: "a run that wrote lately", snapshot: snapshot({ updatedAt: written(SNAPSHOT_STALE_MS) }) },
  { name: "an ended one", snapshot: snapshot({ open: false, serving: false, updatedAt: written(10 * SNAPSHOT_STALE_MS) }) },
];

/** An open run silent one millisecond too long, with a running child and a completed one. */
export const SILENT_RUN = snapshot({
  updatedAt: written(SNAPSHOT_STALE_MS + 1), instances: [record({ state: "running" }), record({ id: "a2" })],
});

/** The silent run settled, its first child located. */
export const deadChild = (): Located => {
  const dead = settleSnapshot(SILENT_RUN, NOW);
  return { snapshot: dead, record: dead.instances[0] };
};

export const UNPARSED_RUN = snapshot({ updatedAt: "not a date", instances: [record({ state: "running" })] });

export const REPAIR_MENTIONS = [
  "new run of dev-reviewer",
  "## Operator's message\nfix X\n",
  "## Previous report\nthe report\n\n## Previous brief",
];

/** An ended dev-verify run started later, and a live dev-plan run with a stop asked. */
export const ROW_RUNS: readonly RunSnapshot[] = [
  snapshot({ crew: "dev-verify", serving: false, open: false, startedAt: "2026-10-24T11:00:00.000Z" }),
  snapshot({ instances: [record({ state: "running", stopRequested: true })] }),
];
