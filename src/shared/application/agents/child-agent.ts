// A sub-agent's act run as a background child of the crew (A-3, approach A2 of temp/03 § A). The
// child is an agent of the crew holding the charter's tools; it acts on the prompt and leaves its
// reply in the crew's memory under a key the parent chose. Meanwhile the parent body keeps the run's
// board — the snapshot /tasks reads in the session's state bag — and serves what /tasks asks of one
// instance: stop a running one, send to an ended one in place. An act with `waitFor: "children"`
// would wait as well, but no script runs during its wait, so nothing could answer /tasks.

import type { ActRequest, ChildRuntime, Logger, SessionStore } from "../ports.ts";
import { INSTANCE_STATES, parseRequest, requestKey, snapshotKey } from "../../domain/agents/instances.ts";
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
  /** Reads and clears the pending request of each child, and does what it asks. */
  serve(runtime: Pick<ChildRuntime, "stop" | "send">): Promise<void>;
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
  let warned = false;
  let open = true;
  const now = () => deps.clock().toISOString();

  async function write(serving: boolean): Promise<void> {
    const body: Omit<RunSnapshot, "updatedAt"> = { crew: run.crew, step: run.step, startedAt, serving, open, instances: records };
    const text = JSON.stringify(body);
    if (text === written) return;
    try {
      await deps.state.writeState(snapshotKey(run.crew), JSON.stringify({ ...body, updatedAt: now() }));
      written = text;
    } catch (error) {
      if (!warned) deps.log.warn(`${run.crew}: the agent instances could not be written for /tasks: ${firstLine(error)}`);
      warned = true;
    }
  }

  async function serveOne(runtime: Pick<ChildRuntime, "stop" | "send">, record: InstanceRecord): Promise<void> {
    const key = requestKey(run.crew, record.id);
    let raw: string | null;
    try {
      raw = await deps.state.readState(key);
    } catch {
      return;
    }
    const request = parseRequest(raw);
    if (request === null) return;
    await deps.state.writeState(key, "").catch(() => undefined);
    if (request.action === "stop") {
      if (record.state !== "running") return;
      record.stopRequested = runtime.stop(record.id) || undefined;
      deps.log.info(`${run.crew}: /tasks stop ${record.id} (${record.agent})${record.stopRequested ? "" : ": it was no longer running"}`);
      return;
    }
    const send = { message: request.message, at: now() } as InstanceRecord["sends"][number];
    record.sends.push(send);
    if (record.state === "running") {
      send.refused = "the instance is running";
      return;
    }
    try {
      send.reply = await runtime.send(record.id, request.message);
    } catch (error) {
      send.refused = firstLine(error);
    }
  }

  return {
    nextKey: () => `${run.crew}:child:${++serial}`,
    add: (record) => {
      records.push(record);
    },
    records: () => records,
    publish: write,
    async serve(runtime) {
      for (const record of records) if (record.id !== "") await serveOne(runtime, record);
    },
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

/** The newest instance of `agent` no record of the board holds: the one spawnBackground just registered. */
function newInstanceId(runtime: Pick<ChildRuntime, "instances">, board: ChildBoard, agent: string): string {
  const held = new Set(board.records().map((r) => r.id));
  const mine = runtime.instances().filter((i) => i.agent === agent && !held.has(i.id));
  return mine.length > 0 ? mine[mine.length - 1].id : "";
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
    id: newInstanceId(runtime, board, call.agent), agent: call.agent, charter: call.charter, task: call.task,
    state: "running", startedAt: clock().toISOString(), effort: call.request.effort, system: call.request.system ?? "",
    brief: call.prompt, sends: [],
  };
  board.add(record);
  log.info(`${call.agent} ${record.id || "?"} started in the background: ${call.task}`);
  let early = 0;
  try {
    for (;;) {
      if (record.id === "") record.id = newInstanceId(runtime, board, call.agent);
      const outcome = readChildOutcome(await runtime.read(key));
      if (outcome !== undefined) {
        record.state = outcome.ok ? "completed" : "failed";
        if (outcome.ok) record.reply = outcome.reply;
        else record.error = outcome.error;
        break;
      }
      const row = runtime.instances().find((i) => i.id === record.id);
      if (row !== undefined && row.state !== "running") {
        record.state = asState(row.state);
        record.error = record.state === "stopped" ? "stopped by /tasks stop" : "the child ended without leaving a reply";
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
    await board.publish(false);
  }
  log.info(`${call.agent} ${record.id || "?"} ${record.state}${record.error ? `: ${record.error}` : ""}`);
  if (record.state === "completed" && record.reply !== undefined) return record.reply;
  throw new Error(`${call.agent} ${record.id || "?"} ${record.state}: ${record.error ?? "no reply"}`);
}
