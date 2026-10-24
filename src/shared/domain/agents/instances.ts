// The agent instances of a crew run as /tasks sees them (A-3). The runtime keeps a crew's
// children (`crew.instances()`, `send`, `stop`) on the crew object of ONE run, which no command
// reaches: the crew writes a snapshot of its run in the session's state bag while its children
// run, and reads there the stop /tasks leaves for one instance. This module holds the two
// shapes, their reading, and what /tasks decides and shows from them. Pure, no IO.

import { AGENT_INSTANCES_STATE_PREFIX, AGENT_REQUEST_STATE_PREFIX } from "../session-keys.ts";
import { MAX_BRIEF_CHARS } from "./charter.ts";

export const INSTANCE_STATES = ["running", "completed", "failed", "stopped"] as const;
export type InstanceState = (typeof INSTANCE_STATES)[number];

/** The crews that run children and publish them: one snapshot key each. */
export const CHILD_CREWS = ["dev-spec", "dev-change", "dev-plan", "dev-verify"] as const;

// The runtime keeps a transcript of an ended instance for `crew.send` (`ScriptAgentInstanceOptions`, 40 messages
// and 32 000 characters by default). Orkeon Code sends nothing in place (sendVerdict): a repair is a new run whose
// brief carries the report (buildRepairBrief, within MAX_BRIEF_CHARS), so those limits bind nothing here.

/** The runtime's defaults for `crew.concurrency(n)` and `crew.maxInstances(n)`, and the bounds a crew input is held to. */
export const INSTANCE_LIMITS = {
  concurrency: { fallback: 4, max: 16 },
  maxInstances: { fallback: 32, max: 64 },
} as const;

/** One child of the run. `system` and `brief` are what it was asked, kept for a repair by a new run. */
export interface InstanceRecord {
  /** The runtime's id (`a1`…); empty until the child has said it. */
  id: string;
  agent: string;
  /** The built-in charter the child runs (built-in-charters.ts). */
  charter: string;
  task: string;
  state: InstanceState;
  startedAt: string;
  endedAt?: string;
  effort?: string;
  system: string;
  brief: string;
  reply?: string;
  error?: string;
  stopRequested?: boolean;
}

/**
 * One run of a crew: `serving` while its body answers requests, `open` until the body ends. A run
 * that answers writes it again at least every SNAPSHOT_HEARTBEAT_MS, so a snapshot older than
 * SNAPSHOT_STALE_MS is a run that died (settleSnapshot).
 */
export interface RunSnapshot {
  crew: string;
  /** The dev step whose rule sets apply to the children (and to a repair). */
  step: string;
  startedAt: string;
  updatedAt: string;
  serving: boolean;
  open: boolean;
  instances: InstanceRecord[];
}

/** How often a run that answers writes its snapshot, changed or not. */
export const SNAPSHOT_HEARTBEAT_MS = 5_000;
/** How old the snapshot of a run that says it answers may be before /tasks takes the run for dead. */
export const SNAPSHOT_STALE_MS = 30_000;

/** What /tasks asks of one instance: stop it. `run` is the run's `startedAt`, so a request never reaches the next run's `a1`. */
export interface InstanceRequest { action: "stop"; run: string; at: string }

export const snapshotKey = (crew: string): string => `${AGENT_INSTANCES_STATE_PREFIX}${crew}`;
export const requestKey = (crew: string, id: string): string => `${AGENT_REQUEST_STATE_PREFIX}${crew}:${id}`;

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const optional = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

function parseRecord(raw: unknown): InstanceRecord | null {
  const r = raw as Record<string, unknown> | null;
  if (r === null || typeof r !== "object" || typeof r.agent !== "string") return null;
  const state = (INSTANCE_STATES as readonly string[]).includes(String(r.state)) ? (r.state as InstanceState) : "failed";
  return {
    id: text(r.id), agent: r.agent, charter: text(r.charter) || r.agent, task: text(r.task), state,
    startedAt: text(r.startedAt), endedAt: optional(r.endedAt), effort: optional(r.effort),
    system: text(r.system), brief: text(r.brief), reply: optional(r.reply), error: optional(r.error),
    stopRequested: r.stopRequested === true ? true : undefined,
  };
}

/** A stored snapshot; null when there is none or it cannot be read. */
export function parseSnapshot(raw: string | null): RunSnapshot | null {
  if (!raw) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (v === null || typeof v !== "object" || typeof v.crew !== "string" || !Array.isArray(v.instances)) return null;
  return {
    crew: v.crew, step: text(v.step) || v.crew, startedAt: text(v.startedAt), updatedAt: text(v.updatedAt),
    serving: v.serving === true, open: v.open === true,
    instances: v.instances.map(parseRecord).filter((r): r is InstanceRecord => r !== null),
  };
}

/** A stored request; null when there is none (an empty value is a cleared one) or it cannot be read. */
export function parseRequest(raw: string | null): InstanceRequest | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v?.action === "stop") return { action: "stop", run: text(v.run), at: text(v.at) };
  } catch {
    // unreadable: no request
  }
  return null;
}

/**
 * The snapshot as /tasks may trust it at `now`: a run that says it is open but has not written for
 * SNAPSHOT_STALE_MS died (the host was stopped mid-run): it no longer answers, and its running
 * children are failed, which a repair can take up.
 */
export function settleSnapshot(s: RunSnapshot, now: Date): RunSnapshot {
  const age = now.getTime() - Date.parse(s.updatedAt);
  // An updatedAt that does not parse dates nothing: the run cannot be shown to answer, so it is taken for dead.
  if (!s.open || (Number.isFinite(age) && age <= SNAPSHOT_STALE_MS)) return s;
  return {
    ...s, serving: false, open: false,
    instances: s.instances.map((r) => r.state !== "running" ? r : { ...r, state: "failed", error: "its run stopped answering" }),
  };
}

/** A crew input as an integer within 1..max, else the runtime's default. */
function limit(raw: unknown, bounds: { fallback: number; max: number }): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= bounds.max ? n : bounds.fallback;
}

/** The `concurrency` and `maxInstances` a crew is built with, from its inputs. */
export function instanceLimits(raw: { concurrency?: unknown; maxInstances?: unknown } | null | undefined): {
  concurrency: number; maxInstances: number;
} {
  return {
    concurrency: limit(raw?.concurrency, INSTANCE_LIMITS.concurrency),
    maxInstances: limit(raw?.maxInstances, INSTANCE_LIMITS.maxInstances),
  };
}

// ── /tasks: which instance a reference names, and what may be done with it ──

export interface Located { snapshot: RunSnapshot; record: InstanceRecord }

/**
 * The instance `ref` names: `a1`, or `<crew>:a1` when two crews hold an `a1`. Only the last run of
 * each crew is kept, so an id is unique within a crew.
 */
export function locateInstance(snapshots: readonly RunSnapshot[], ref: string): { ok: true; found: Located } | { ok: false; text: string } {
  const [crew, id] = ref.includes(":") ? ref.split(":", 2) : [undefined, ref];
  const found = snapshots.flatMap((snapshot) =>
    crew !== undefined && snapshot.crew !== crew
      ? []
      : snapshot.instances.filter((r) => r.id === id && id !== "").map((record) => ({ snapshot, record })));
  if (found.length === 1) return { ok: true, found: found[0] };
  if (found.length === 0) return { ok: false, text: `no agent instance '${ref}': /tasks lists them` };
  return {
    ok: false,
    text: `'${ref}' names an instance of ${found.map((f) => f.snapshot.crew).join(" and ")}: write ${found
      .map((f) => `${f.snapshot.crew}:${id}`).join(" or ")}`,
  };
}

const label = (l: Located): string => `${l.snapshot.crew}:${l.record.id}`;

/** Whether /tasks may ask the crew to stop the instance: only a running one, of a run still answering. */
export function stopVerdict(l: Located): { ok: true } | { ok: false; text: string } {
  if (l.record.state !== "running") return { ok: false, text: `${label(l)} is ${l.record.state}: there is nothing to stop` };
  if (!l.snapshot.serving) return { ok: false, text: `${label(l)}: its run no longer answers; it ends with the run` };
  return { ok: true };
}

/**
 * What a send to the instance becomes: refused while it runs; once it has ended, a repair by a new
 * run. A send in place (`crew.send` over the kept transcript) is not offered: the parent stops
 * answering as soon as its child settles, so no command would ever reach the crew object in time.
 */
export function sendVerdict(l: Located): { kind: "refused"; text: string } | { kind: "repair" } {
  if (l.record.state === "running") {
    return { kind: "refused", text: `${label(l)} is running: a send is refused until it ends (/tasks stop ${l.record.id} ends it)` };
  }
  return { kind: "repair" };
}

const CUT_MARK = "[… the start is left out]\n";

/** The tail of `s` within `max` characters, the cut said in front. */
function tail(s: string, max: number): string {
  if (s.length <= max) return s;
  return max <= CUT_MARK.length ? s.slice(s.length - max) : CUT_MARK + s.slice(s.length - (max - CUT_MARK.length));
}

/**
 * The brief of a repair by a new run: the operator's message, the previous report and the previous
 * brief, within MAX_BRIEF_CHARS; the previous brief is cut first, from its start, then the report.
 * The new run has no live context of the old one, and the brief says so.
 */
export function buildRepairBrief(record: InstanceRecord, message: string): string {
  const head = [
    `This is a new run of ${record.charter}, repairing instance ${record.id || "?"} of an ended run: you do not have its context,`,
    "only what follows. Answer the operator's message below, then give the whole report again in the shape the previous brief asked for.",
    "",
    "## Operator's message",
    message.trim(),
    "",
    "## Previous report",
    "",
  ].join("\n");
  const report = record.reply ?? `(none: the instance ${record.state}${record.error ? `: ${record.error}` : ""})`;
  const briefHeading = "\n\n## Previous brief\n";
  const forReport = MAX_BRIEF_CHARS - head.length - briefHeading.length;
  const keptReport = tail(report, Math.max(0, forReport));
  const forBrief = MAX_BRIEF_CHARS - head.length - keptReport.length - briefHeading.length;
  const out = head + keptReport + briefHeading + tail(record.brief, Math.max(0, forBrief));
  return out.slice(0, MAX_BRIEF_CHARS);
}

/** One row per instance, the open runs first, for the /tasks table. */
export function instanceRows(snapshots: readonly RunSnapshot[]): Array<Record<string, string>> {
  const ordered = [...snapshots].sort((a, b) => Number(b.open) - Number(a.open) || b.startedAt.localeCompare(a.startedAt));
  return ordered.flatMap((s) => s.instances.map((r) => ({
    id: r.id || "?",
    crew: s.crew,
    agent: r.agent,
    state: r.stopRequested && r.state === "running" ? "running (stop asked)" : r.state,
    task: r.task,
    run: s.serving ? "answering" : s.open ? "running, not answering" : "ended",
  })));
}

/** The lines `/tasks show <id>` prints. */
export function describeInstance(l: Located): string[] {
  const { snapshot: s, record: r } = l;
  const lines = [
    `${label(l)} — ${r.agent} (${r.charter}), ${r.state}${r.stopRequested && r.state === "running" ? ", stop asked" : ""}`,
    `task: ${r.task}`,
    `started ${r.startedAt}${r.endedAt ? `, ended ${r.endedAt}` : ""}${r.effort ? `, effort ${r.effort}` : ""}`,
    `run of ${s.crew} started ${s.startedAt}: ${s.serving ? "answering /tasks" : s.open ? "running, no longer answering" : "ended"}`,
  ];
  if (r.error) lines.push(`error: ${r.error}`);
  if (r.reply) lines.push("report:", r.reply);
  return lines;
}
