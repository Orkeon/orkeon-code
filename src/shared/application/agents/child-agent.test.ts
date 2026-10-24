// A sub-agent's act run as a background child (A-3): the board /tasks reads, the requests it
// serves, and the wait. Over a fake ChildRuntime whose pause moves a fake clock. Run:
//   node --test src/shared/application/agents/child-agent.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";

import {
  CHILD_POLL_MS, MAX_EARLY_WAKES, createChildBoard, parseChildInput, readChildOutcome, runChildAct,
} from "./child-agent.ts";
import type { ChildRuntime } from "../ports.ts";
import { parseSnapshot, requestKey, snapshotKey } from "../../domain/agents/instances.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

/** A runtime whose children run until `script` says otherwise; each pause moves the clock by `ms`. */
class FakeRuntime implements ChildRuntime {
  now = Date.parse("2026-10-24T10:00:00.000Z");
  rows: Array<{ id: string; agent: string; state: string }> = [];
  memory = new Map<string, unknown>();
  spawned: Array<{ agent: string; input: string }> = [];
  stops: string[] = [];
  sends: Array<[string, string]> = [];
  pauses = 0;
  advance = true;
  /** Called after each pause with its number: what the child does meanwhile. */
  script: (n: number, rt: FakeRuntime) => void = () => undefined;
  clock = () => new Date(this.now);

  spawn(agent: string, input: string): void {
    this.spawned.push({ agent, input });
    this.rows.push({ id: `a${this.rows.length + 1}`, agent, state: "running" });
  }
  instances() { return this.rows; }
  stop(id: string): boolean {
    this.stops.push(id);
    const row = this.rows.find((r) => r.id === id && r.state === "running");
    if (row) row.state = "stopped";
    return row !== undefined;
  }
  async send(id: string, message: string): Promise<string> {
    this.sends.push([id, message]);
    return `answer to ${message}`;
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

function setup() {
  const runtime = new FakeRuntime();
  const state = new FakeSessionStore();
  const log = new FakeLogger();
  const board = createChildBoard({ state, clock: runtime.clock, log }, { crew: "dev-plan", step: "dev-plan" });
  const deps = { runtime, board, clock: runtime.clock, log };
  const call = { agent: "dev-reviewer", charter: "dev-reviewer", task: "review of the plan", prompt: "review it", request: { system: "S", effort: "low" as const } };
  const snap = () => parseSnapshot(state.state.get(snapshotKey("dev-plan")) ?? null)!;
  return { runtime, state, log, board, deps, call, snap };
}

describe("parseChildInput and readChildOutcome", () => {
  it("reads the child's input from its string, and nothing that is not one", () => {
    deepStrictEqual(parseChildInput(JSON.stringify({ key: "k", prompt: "p", request: { system: "s" } })), { key: "k", prompt: "p", request: { system: "s" } });
    deepStrictEqual(parseChildInput({ key: "k", prompt: "p" }), { key: "k", prompt: "p", request: {} });
    strictEqual(parseChildInput("{"), null);
    strictEqual(parseChildInput(JSON.stringify({ key: 1, prompt: "p" })), null);
  });

  it("reads an outcome, a failure without its error as one, and nothing else", () => {
    deepStrictEqual(readChildOutcome({ ok: true, reply: "r" }), { ok: true, reply: "r" });
    deepStrictEqual(readChildOutcome({ ok: false }), { ok: false, error: "the child failed" });
    strictEqual(readChildOutcome(undefined), undefined);
    strictEqual(readChildOutcome({ ok: true }), undefined);
  });
});

describe("runChildAct", () => {
  it("spawns the child with its key, waits, and returns its reply; the board shows it running then completed", async () => {
    const { runtime, deps, call, snap } = setup();
    let seen = "";
    runtime.script = (n, rt) => {
      if (n === 1) seen = snap().instances[0].state + "/" + String(snap().serving);
      if (n === 2) rt.finish(1, { ok: true, reply: "the review" });
    };
    strictEqual(await runChildAct(deps, call), "the review");
    deepStrictEqual(JSON.parse(runtime.spawned[0].input), { key: "dev-plan:child:1", prompt: "review it", request: { system: "S", effort: "low" } });
    strictEqual(seen, "running/true");
    const s = snap();
    deepStrictEqual([s.serving, s.open, s.instances[0].id, s.instances[0].state, s.instances[0].reply], [false, true, "a1", "completed", "the review"]);
    deepStrictEqual([s.instances[0].effort, s.instances[0].system, s.instances[0].brief], ["low", "S", "review it"]);
    ok(s.instances[0].endedAt);
  });

  it("throws the child's failure", async () => {
    const { runtime, deps, call, snap } = setup();
    runtime.script = (_n, rt) => rt.finish(1, { ok: false, error: "model down" });
    await rejects(runChildAct(deps, call), /dev-reviewer a1 failed: model down/);
    strictEqual(snap().instances[0].state, "failed");
  });

  it("serves a /tasks stop: the child is stopped, the act throws, the board says stopped", async () => {
    const { runtime, state, deps, call, snap } = setup();
    runtime.script = (n) => {
      if (n === 1) void state.writeState(requestKey("dev-plan", "a1"), JSON.stringify({ action: "stop", at: "t" }));
    };
    await rejects(runChildAct(deps, call), /dev-reviewer a1 stopped: stopped by \/tasks stop/);
    deepStrictEqual(runtime.stops, ["a1"]);
    strictEqual(state.state.get(requestKey("dev-plan", "a1")), "");
    const r = snap().instances[0];
    deepStrictEqual([r.state, r.stopRequested], ["stopped", true]);
  });

  it("refuses a send while the child runs, and records it", async () => {
    const { runtime, state, deps, call, snap } = setup();
    runtime.script = (n, rt) => {
      if (n === 1) void state.writeState(requestKey("dev-plan", "a1"), JSON.stringify({ action: "send", message: "hi", at: "t" }));
      if (n === 2) rt.finish(1, { ok: true, reply: "done" });
    };
    await runChildAct(deps, call);
    deepStrictEqual(runtime.sends, []);
    deepStrictEqual(snap().instances[0].sends.map((s) => [s.message, s.refused]), [["hi", "the instance is running"]]);
  });

  it("says when the child ended without a reply", async () => {
    const { runtime, deps, call } = setup();
    runtime.script = (_n, rt) => { rt.rows[0].state = "completed"; };
    await rejects(runChildAct(deps, call), /ended without leaving a reply/);
  });

  it("gives up after MAX_EARLY_WAKES pauses that return at once, and stops the child", async () => {
    const { runtime, deps, call } = setup();
    runtime.advance = false;
    await rejects(runChildAct(deps, call), new RegExp(`returned at once ${MAX_EARLY_WAKES} times`));
    deepStrictEqual([runtime.pauses, runtime.stops], [MAX_EARLY_WAKES, ["a1"]]);
  });

  it("a failing wait stops the child, marks it failed and rethrows", async () => {
    const { runtime, deps, call, snap } = setup();
    runtime.pause = async () => { throw new Error("cancelled"); };
    await rejects(runChildAct(deps, call), /cancelled/);
    deepStrictEqual(runtime.stops, ["a1"]);
    deepStrictEqual([snap().instances[0].state, snap().instances[0].error], ["failed", "cancelled"]);
  });

  it("pauses CHILD_POLL_MS between two looks", async () => {
    const { runtime, deps, call } = setup();
    const start = runtime.now;
    runtime.script = (n, rt) => { if (n === 3) rt.finish(1, { ok: true, reply: "r" }); };
    await runChildAct(deps, call);
    strictEqual(runtime.now - start, 3 * CHILD_POLL_MS);
  });
});

describe("the board", () => {
  it("serves a send to an ended child in place while the run answers", async () => {
    const { runtime, state, board, snap } = setup();
    board.add({ id: "a1", agent: "dev-reviewer", charter: "dev-reviewer", task: "t", state: "completed", startedAt: "", system: "", brief: "", sends: [] });
    await state.writeState(requestKey("dev-plan", "a1"), JSON.stringify({ action: "send", message: "why?", at: "t" }));
    await board.serve(runtime);
    await board.publish(true);
    deepStrictEqual(runtime.sends, [["a1", "why?"]]);
    strictEqual(snap().instances[0].sends[0].reply, "answer to why?");
  });

  it("close says the run ended, and leaves the last run's snapshot when this one started no child", async () => {
    const { state, board } = setup();
    await state.writeState(snapshotKey("dev-plan"), "previous");
    await board.close();
    strictEqual(state.state.get(snapshotKey("dev-plan")), "previous");
    board.add({ id: "a1", agent: "x", charter: "x", task: "t", state: "completed", startedAt: "", system: "", brief: "", sends: [] });
    await board.close();
    strictEqual(parseSnapshot(state.state.get(snapshotKey("dev-plan"))!)!.open, false);
  });

  it("writes only what changed, and warns once when the state bag refuses", async () => {
    const { state, board, log } = setup();
    board.add({ id: "a1", agent: "x", charter: "x", task: "t", state: "running", startedAt: "", system: "", brief: "", sends: [] });
    await board.publish(true);
    const first = state.state.get(snapshotKey("dev-plan"));
    await board.publish(true);
    strictEqual(state.state.get(snapshotKey("dev-plan")), first);
    state.failure = new Error("no session tools");
    await board.publish(false);
    await board.close();
    strictEqual(log.lines.filter((l) => l.startsWith("warn:")).length, 1);
  });
});
