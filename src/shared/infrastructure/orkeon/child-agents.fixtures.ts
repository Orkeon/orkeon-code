/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// The hand-made agent context and crew the children of a crew run over (A-3), the inline Llm, the board and the
// spec of the reviewer child the tests open.
import { openChildAct } from "./child-agents.ts";
import { createChildBoard } from "../../application/agents/child-agent.ts";
import type { Llm } from "../../application/ports.ts";
import { FakeLogger } from "../../../../tests/support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/doubles/fake-session-store.ts";

/**
 * An agent context and a crew of the run `crewName`: each spawn adds a running row named by the agent's id; the
 * last child settles during the parent's first pause, its reply left in the crew's memory; every receive throws
 * `receiveError`, a timeout until the test sets another.
 */
export function fakeRun(crewName = "dev-plan") {
  const memory = new Map<string, unknown>();
  const rows: Array<{ id: string; agent: string; state: string }> = [];
  const spawned: Array<[string, unknown]> = [];
  const added: string[] = [];
  const receives: unknown[] = [];
  let receiveError: Error = Object.assign(new Error("no event within 1000 ms"), { name: "ReceiveTimeoutError" });
  const ctx: any = {
    spawnBackground(agent: string, input: unknown) {
      spawned.push([agent, input]);
      // As the runtime's rows: the agent's id, not its name.
      rows.push({ id: `a${rows.length + 1}`, agent: `01JID-${agent}`, state: "running" });
      return { id: rows.length };
    },
    memory: {
      crew: {
        get: async (k: string) => memory.get(k),
        store: async (k: string, v: unknown) => { memory.set(k, v); },
      },
    },
    async receive(opts: unknown) {
      receives.push(opts);
      // The child settles during the parent's first pause.
      const last = rows[rows.length - 1];
      if (last && last.state === "running") {
        memory.set(`${crewName}:child:${rows.length}`, { ok: true, reply: `reply of ${last.id}` });
        last.state = "completed";
      }
      throw receiveError;
    },
    crew: { has: (name: string) => added.includes(name) },
    spawn(builder: { name: string }) { added.push(builder.name); return {}; },
  };
  const crew: any = {
    instances: () => rows,
    stop: (id: string) => id === "a1",
  };
  return { ctx, crew, memory, rows, spawned, added, receives, setReceiveError: (e: Error) => { receiveError = e; } };
}

/** An Llm acting inline: it answers "inline" and records what it was asked. */
export const base = (): Llm & { asked: unknown[] } => {
  const asked: unknown[] = [];
  return { asked, act: async (p: string, r: unknown) => { asked.push([p, r]); return "inline"; } } as any;
};

/** The board of a dev-plan run. */
export const board = () => createChildBoard({ state: new FakeSessionStore(), clock: () => new Date(), log: new FakeLogger() }, { crew: "dev-plan", step: "dev-plan" });

export const spec = { agent: "dev-reviewer", charter: "dev-reviewer", task: "review", builder: () => ({ name: "dev-reviewer" }) as any };

/** The steps whose review openChildAct runs in a child. */
export const REVIEW_STEPS: readonly string[] = ["dev-spec", "dev-change"];

/** The review of `step` opened in a child over a fake run, its board in a FakeSessionStore on a clock ticking a second a read. */
export function openReview(step: string) {
  const run = fakeRun(step);
  const state = new FakeSessionStore();
  let t = 0;
  const inline = { act: async () => "inline" } as unknown as Llm;
  const child = openChildAct(inline, run.ctx, run.crew, { state, clock: () => new Date(Date.UTC(2026, 9, 24) + (t += 1000)), log: new FakeLogger(), effort: "low" },
    { crew: step, step }, { agent: "dev-reviewer", charter: "dev-reviewer", task: `review of the ${step}`, builder: () => ({ name: "dev-reviewer" }) as any });
  return { run, state, child };
}

export interface StopCase {
  id: string;
  stopped: boolean;
}

/** The crew stops a1 only. */
export const STOPS: readonly StopCase[] = [
  { id: "a1", stopped: true },
  { id: "", stopped: false },
  { id: "a2", stopped: false },
];
