// A sub-agent's act run as a background child of the crew (A-3, approach A2 of temp/03 § A). The
// child is an agent of the crew holding the charter's tools; it acts on the prompt and leaves its
// reply in the crew's memory under a key the parent chose. Meanwhile the parent body keeps the run's
// board — the snapshot /tasks reads in the session's state bag — and serves the stop /tasks asks
// for a running one. An act with `waitFor: "children"` would wait as well, but no script runs
// during its wait, so nothing could answer /tasks. The runtime's instance rows name the agent by
// its id, not its name: the child says its instance id (`ctx.instanceId`) under instanceKey first.

import type { ActRequest, ChildRuntime, Logger, SessionStore } from "../ports.ts";
import { INSTANCE_STATES, SNAPSHOT_HEARTBEAT_MS, parseRequest, requestKey, snapshotKey } from "../../domain/agents/instances.ts";
import type { InstanceRecord, InstanceState, RunSnapshot } from "../../domain/agents/instances.ts";

type StateBag = Pick<SessionStore, "readState" | "writeState">;

/** How long the parent waits between two looks at its child. */
export const CHILD_POLL_MS = 1000;
/** Pauses in a row that return at once before the wait gives up rather than spin. */
export const MAX_EARLY_WAKES = 3;

/** What the child is handed: what it acts on, how, and where it leaves its reply. */
export interface ChildInput {
  key: string;
  prompt: string;
  request: ActRequest;
}

/** What a child leaves under its key once its act has settled. */
export type ChildOutcome = { ok: true; reply: string } | { ok: false; error: string };

/** The child's input, read back from the string spawnBackground carries; null when it is not one. */
export function parseChildInput(raw: unknown): ChildInput | null {
  let v: any;
  try {
    v = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (v === null || typeof v !== "object" || typeof v.key !== "string" || typeof v.prompt !== "string") return null;
  const request = v.request !== null && typeof v.request === "object" ? (v.request as ActRequest) : {};
  return { key: v.key, prompt: v.prompt, request };
}

/** Where the child leaves its instance id (`a1`…) beside its reply. */
export const instanceKey = (key: string): string => `${key}:instance`;

/** A stored outcome; undefined while the child has left none. */
export function readChildOutcome(raw: unknown): ChildOutcome | undefined {
  const v = raw as Record<string, unknown> | null | undefined;
  if (v === null || typeof v !== "object") return undefined;
  if (v.ok === true && typeof v.reply === "string") return { ok: true, reply: v.reply };
  if (v.ok === false) return { ok: false, error: typeof v.error === "string" ? v.error : "the child failed" };
  return undefined;
}

const firstLine = (error: unknown): string => String((error as Error)?.message ?? error).split("\n")[0];

/** The run's board: its children, the snapshot /tasks reads, and the requests it serves. */
export interface ChildBoard {
  /** A key no other child of this run uses. */
  nextKey(): string;
  add(record: InstanceRecord): void;
  records(): readonly InstanceRecord[];
  /** Writes the snapshot when it changed; a failed write is logged once and never fails the run. */
  publish(serving: boolean): Promise<void>;
  /** Reads and clears the pending stop of each running child of this run, and stops it. */
  serve(runtime: Pick<ChildRuntime, "stop">): Promise<void>;
  /** Clears what /tasks left for `id`: a request of an earlier run, or one this run no longer serves. */
  clearRequest(id: string): Promise<void>;
  /** The run has ended: the snapshot says so. */
  close(): Promise<void>;
}

export interface BoardDeps {
  state: StateBag;
  clock: () => Date;
  log: Logger;
}

export function createChildBoard(deps: BoardDeps, run: { crew: string; step: string }): ChildBoard {
  const records: InstanceRecord[] = [];
  const startedAt = deps.clock().toISOString();
  let serial = 0;
  let written = "";
  let writtenAt = 0;
  let warned = false;
  let open = true;
  const now = () => deps.clock().toISOString();

  async function write(serving: boolean): Promise<void> {
    const body: Omit<RunSnapshot, "updatedAt"> = { crew: run.crew, step: run.step, startedAt, serving, open, instances: records };
    const text = JSON.stringify(body);
    const at = deps.clock().getTime();
    // Unchanged, it is written again while the run answers, so /tasks can tell a live run from a dead one.
    if (text === written && !(serving && at - writtenAt >= SNAPSHOT_HEARTBEAT_MS)) return;
    try {
      await deps.state.writeState(snapshotKey(run.crew), JSON.stringify({ ...body, updatedAt: now() }));
      written = text;
      writtenAt = at;
    } catch (error) {
      if (!warned) deps.log.warn(`${run.crew}: the agent instances could not be written for /tasks: ${firstLine(error)}`);
      warned = true;
    }
  }

  async function clearRequest(id: string): Promise<void> {
    if (id !== "") await deps.state.writeState(requestKey(run.crew, id), "").catch(() => undefined);
  }

  async function serveOne(runtime: Pick<ChildRuntime, "stop">, record: InstanceRecord): Promise<void> {
    let raw: string | null;
    try {
      raw = await deps.state.readState(requestKey(run.crew, record.id));
    } catch {
      return;
    }
    const request = parseRequest(raw);
    if (request === null) return;
    await clearRequest(record.id);
    // Ids restart at a1 in every run: a stop meant for another run is dropped, never served here.
    if (request.run !== startedAt) return;
    record.stopRequested = runtime.stop(record.id) || undefined;
    deps.log.info(`${run.crew}: /tasks stop ${record.id} (${record.agent})${record.stopRequested ? "" : ": it was no longer running"}`);
  }

  return {
    nextKey: () => `${run.crew}:child:${++serial}`,
    add: (record) => {
      records.push(record);
    },
    records: () => records,
    publish: write,
    async serve(runtime) {
      for (const record of records) if (record.id !== "" && record.state === "running") await serveOne(runtime, record);
    },
    clearRequest,
    async close() {
      open = false;
      // A run that started no child leaves the last run's snapshot alone: its instances can still be repaired.
      if (records.length > 0) await write(false);
    },
  };
}

export interface ChildCall {
  /** The crew agent the child runs as. */
  agent: string;
  /** The built-in charter it runs (built-in-charters.ts). */
  charter: string;
  /** What it is asked, in a few words, for /tasks. */
  task: string;
  prompt: string;
  request: ActRequest;
}

export interface ChildDeps {
  runtime: ChildRuntime;
  board: ChildBoard;
  clock: () => Date;
  log: Logger;
}

const asState = (s: string): InstanceState =>
  (INSTANCE_STATES as readonly string[]).includes(s) ? (s as InstanceState) : "failed";

/**
 * The instance id of the child under `key`: the one it said, else the newest running instance no
 * record of the board holds (the parent starts one child at a time, so that is the one it just
 * started; the rows name the agent by its id, not its name, so they cannot be matched by name).
 */
async function childInstanceId(runtime: Pick<ChildRuntime, "instances" | "read">, board: ChildBoard, key: string): Promise<string> {
  const said = await runtime.read(instanceKey(key));
  if (typeof said === "string" && said !== "") return said;
  const held = new Set(board.records().map((r) => r.id));
  const fresh = runtime.instances().filter((i) => i.state === "running" && !held.has(i.id));
  return fresh.length > 0 ? fresh[fresh.length - 1].id : "";
}

/**
 * The act of `call` run by a background child; resolves to its reply, throws when it failed or was
 * stopped (the caller's sub-agent run reads that as a failed model call).
 */
export async function runChildAct(deps: ChildDeps, call: ChildCall): Promise<string> {
  const { runtime, board, clock, log } = deps;
  const key = board.nextKey();
  const input: ChildInput = { key, prompt: call.prompt, request: call.request };
  runtime.spawn(call.agent, JSON.stringify(input));
  const record: InstanceRecord = {
    id: "", agent: call.agent, charter: call.charter, task: call.task,
    state: "running", startedAt: clock().toISOString(), effort: call.request.effort, system: call.request.system ?? "",
    brief: call.prompt,
  };
  const resolveId = async () => {
    if (record.id !== "") return;
    record.id = await childInstanceId(runtime, board, key);
    // A request an earlier run left for this id is not this child's.
    await board.clearRequest(record.id);
  };
  await resolveId();
  board.add(record);
  log.info(`${call.agent} ${record.id || "?"} started in the background: ${call.task}`);
  let early = 0;
  try {
    for (;;) {
      await resolveId();
      const outcome = readChildOutcome(await runtime.read(key));
      const row = runtime.instances().find((i) => i.id === record.id);
      const stopped = row?.state === "stopped" || (record.stopRequested === true && outcome?.ok !== true);
      if (stopped && (outcome !== undefined || (row !== undefined && row.state !== "running"))) {
        // A stopped child's act rejects, and its body leaves that failure: the stop is what happened.
        record.state = "stopped";
        record.error = "stopped by /tasks stop";
        break;
      }
      if (outcome !== undefined) {
        record.state = outcome.ok ? "completed" : "failed";
        if (outcome.ok) record.reply = outcome.reply;
        else record.error = outcome.error;
        break;
      }
      if (row !== undefined && row.state !== "running") {
        record.state = asState(row.state);
        record.error = "the child ended without leaving a reply";
        break;
      }
      await board.serve(runtime);
      await board.publish(true);
      const before = clock().getTime();
      await runtime.pause(CHILD_POLL_MS);
      if (clock().getTime() - before < CHILD_POLL_MS / 4) {
        early += 1;
        if (early >= MAX_EARLY_WAKES) {
          record.state = "failed";
          record.error = `the wait for ${call.agent} returned at once ${early} times in a row`;
          runtime.stop(record.id);
          break;
        }
      } else {
        early = 0;
      }
    }
  } catch (error) {
    // The wait itself failed (the run was cancelled, the host refused a read): the child goes with it.
    record.state = "failed";
    record.error = firstLine(error);
    runtime.stop(record.id);
    throw error;
  } finally {
    record.endedAt = clock().toISOString();
    await board.clearRequest(record.id);
    await board.publish(false);
  }
  log.info(`${call.agent} ${record.id || "?"} ${record.state}${record.error ? `: ${record.error}` : ""}`);
  if (record.state === "completed" && record.reply !== undefined) return record.reply;
  throw new Error(`${call.agent} ${record.id || "?"} ${record.state}: ${record.error ?? "no reply"}`);
}
