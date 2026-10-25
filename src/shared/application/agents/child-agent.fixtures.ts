// The fake ChildRuntime, the board and the call runChildAct and the child board are tested over.
import { createChildBoard } from "./child-agent.ts";
import type { ChildRuntime } from "../ports.ts";
import { parseSnapshot, snapshotKey } from "../../domain/agents/instances.ts";
import type { InstanceRecord, InstanceState } from "../../domain/agents/instances.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

/**
 * A runtime whose children run until `script` says otherwise; each pause moves the clock by `ms`.
 * As the runtime's, its rows name the agent by its id, never its name.
 */
export class FakeRuntime implements ChildRuntime {
  now = Date.parse("2026-10-24T10:00:00.000Z");
  rows: Array<{ id: string; agent: string; state: string }> = [];
  memory = new Map<string, unknown>();
  spawned: Array<{ agent: string; input: string }> = [];
  stops: string[] = [];
  pauses = 0;
  advance = true;
  /** Called after each pause with its number: what the child does meanwhile. */
  script: (n: number, rt: FakeRuntime) => void = () => undefined;
  clock = () => new Date(this.now);

  spawn(agent: string, input: string): void {
    this.spawned.push({ agent, input });
    this.rows.push({ id: `a${this.rows.length + 1}`, agent: `01JAGENTID${agent.length}`, state: "running" });
  }
  instances() { return this.rows; }
  /** What a stopped child's row becomes, and whether its body leaves its rejected act behind (the real path). */
  stoppedAs = "stopped";
  stopLeavesFailure = true;
  stop(id: string): boolean {
    this.stops.push(id);
    const n = this.rows.findIndex((r) => r.id === id && r.state === "running");
    if (n < 0) return false;
    this.rows[n].state = this.stoppedAs;
    if (this.stopLeavesFailure) this.memory.set(`dev-plan:child:${n + 1}`, { ok: false, error: "The operation was canceled." });
    return true;
  }
  async read(key: string): Promise<unknown> { return this.memory.get(key); }
  async pause(ms: number): Promise<void> {
    this.pauses += 1;
    if (this.advance) this.now += ms;
    this.script(this.pauses, this);
  }
  /** The child of `n` leaves its outcome and ends. */
  finish(n: number, outcome: unknown): void {
    this.memory.set(`dev-plan:child:${n}`, outcome);
    this.rows[n - 1].state = "completed";
  }
}

/** A fake runtime, the dev-plan board over a session state, the deps and the call of a reviewer, and the snapshot reader. */
export function childSetup() {
  const runtime = new FakeRuntime();
  const state = new FakeSessionStore();
  const log = new FakeLogger();
  const board = createChildBoard({ state, clock: runtime.clock, log }, { crew: "dev-plan", step: "dev-plan" });
  const deps = { runtime, board, clock: runtime.clock, log };
  const call = { agent: "dev-reviewer", charter: "dev-reviewer", task: "review of the plan", prompt: "review it", request: { system: "S", effort: "low" as const } };
  const snap = () => parseSnapshot(state.state.get(snapshotKey("dev-plan")) ?? null)!;
  return { runtime, state, log, board, deps, call, snap };
}

/** A board row of agent x in `state`. */
export const boardRow = (state: InstanceState): InstanceRecord => ({ id: "a1", agent: "x", charter: "x", task: "t", state, startedAt: "", system: "", brief: "" });

export interface ChildInputCase {
  name: string;
  input: unknown;
  expected: unknown;
}

export const CHILD_INPUTS: readonly ChildInputCase[] = [
  {
    name: "reads the child's input from its string",
    input: JSON.stringify({ key: "k", prompt: "p", request: { system: "s" } }),
    expected: { key: "k", prompt: "p", request: { system: "s" } },
  },
  { name: "reads an input given as an object, its request empty", input: { key: "k", prompt: "p" }, expected: { key: "k", prompt: "p", request: {} } },
  { name: "reads nothing from a broken string", input: "{", expected: null },
  { name: "reads nothing from an input whose key is not a string", input: JSON.stringify({ key: 1, prompt: "p" }), expected: null },
];

export const CHILD_OUTCOMES: readonly ChildInputCase[] = [
  { name: "reads an outcome", input: { ok: true, reply: "r" }, expected: { ok: true, reply: "r" } },
  { name: "reads a failure without its error as one", input: { ok: false }, expected: { ok: false, error: "the child failed" } },
  { name: "reads nothing from no outcome", input: undefined, expected: undefined },
  { name: "reads nothing from a success without its reply", input: { ok: true }, expected: undefined },
];
