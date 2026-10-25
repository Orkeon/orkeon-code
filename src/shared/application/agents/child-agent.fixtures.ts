// The board and the call runChildAct and the child board are tested over.
import { createChildBoard } from "./child-agent.ts";
import { parseSnapshot, snapshotKey } from "../../domain/agents/instances.ts";
import type { InstanceRecord, InstanceState } from "../../domain/agents/instances.ts";
import { FakeChildRuntime } from "../../../../tests/support/doubles/fake-child-runtime.ts";
import { FakeLogger } from "../../../../tests/support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/doubles/fake-session-store.ts";

/** A fake runtime, the dev-plan board over a session state, the deps and the call of a reviewer, and the snapshot reader. */
export function childSetup() {
  const runtime = new FakeChildRuntime();
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
