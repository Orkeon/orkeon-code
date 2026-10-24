/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// The children of a crew run over the runtime (A-3): the ChildRuntime adapter, the child's body
// and withChildAct, over a hand-made agent context and crew. Run:
//   node --test src/shared/infrastructure/orkeon/child-agents.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";

import { childAgentBody, createChildRuntime, withChildAct } from "./child-agents.ts";
import { createChildBoard } from "../../application/agents/child-agent.ts";
import type { Llm } from "../../application/ports.ts";
import { FakeLlmFacade } from "../../../../tests/support/fake-llm-facade.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

function fakeRun() {
  const memory = new Map<string, unknown>();
  const rows: Array<{ id: string; agent: string; state: string }> = [];
  const spawned: Array<[string, unknown]> = [];
  const added: string[] = [];
  const receives: unknown[] = [];
  let receiveError: Error = Object.assign(new Error("no event within 1000 ms"), { name: "ReceiveTimeoutError" });
  const ctx: any = {
    spawnBackground(agent: string, input: unknown) {
      spawned.push([agent, input]);
      rows.push({ id: `a${rows.length + 1}`, agent, state: "running" });
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
        memory.set(`dev-plan:child:${rows.length}`, { ok: true, reply: `reply of ${last.id}` });
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
    send: async (id: string, m: string) => `${id}:${m}`,
  };
  return { ctx, crew, memory, rows, spawned, added, receives, setReceiveError: (e: Error) => { receiveError = e; } };
}

describe("createChildRuntime", () => {
  it("is null on a host without background children", () => {
    strictEqual(createChildRuntime({} as any, {} as any), null);
  });

  it("maps the crew's instances, stop, send and memory; the pause swallows only the timeout", async () => {
    const run = fakeRun();
    const rt = createChildRuntime(run.ctx, run.crew)!;
    rt.spawn("dev-reviewer", "{}");
    deepStrictEqual(rt.instances(), [{ id: "a1", agent: "dev-reviewer", state: "running" }]);
    deepStrictEqual([rt.stop("a1"), rt.stop(""), rt.stop("a2")], [true, false, false]);
    strictEqual(await rt.send("a1", "hi"), "a1:hi");
    await rt.pause(1000);
    deepStrictEqual(run.receives, [{ timeout: 1000 }]);
    strictEqual(await rt.read("dev-plan:child:1"), run.memory.get("dev-plan:child:1"));
    run.setReceiveError(new Error("cancelled"));
    await rejects(rt.pause(1000), /cancelled/);
  });
});

describe("childAgentBody", () => {
  it("acts on its call and leaves the reply under its key", async () => {
    const run = fakeRun();
    const facade = new FakeLlmFacade();
    facade.actResult = { output: "the review", iterations: 2 };
    const body = childAgentBody(() => undefined);
    const input = JSON.stringify({ key: "k1", prompt: "review", request: { system: "S", effort: "high" } });
    strictEqual(await body(input, { ...run.ctx, llm: facade }), "the review");
    deepStrictEqual(run.memory.get("k1"), { ok: true, reply: "the review" });
    deepStrictEqual(facade.calls[0].args, ["review", { system: "S", effort: "high" }]);
  });

  it("leaves the failure under its key and rethrows; refuses an input that is not a call", async () => {
    const run = fakeRun();
    const facade = new FakeLlmFacade();
    facade.actResult = new Error("model down\nstack");
    const body = childAgentBody(() => undefined);
    await rejects(body(JSON.stringify({ key: "k1", prompt: "p" }), { ...run.ctx, llm: facade }), /model down/);
    deepStrictEqual(run.memory.get("k1"), { ok: false, error: "model down" });
    await rejects(body("nope", { ...run.ctx, llm: facade }), /not a child call/);
  });
});

describe("withChildAct", () => {
  const base = (): Llm & { asked: unknown[] } => {
    const asked: unknown[] = [];
    return { asked, act: async (p: string, r: unknown) => { asked.push([p, r]); return "inline"; } } as any;
  };
  const board = () => createChildBoard({ state: new FakeSessionStore(), clock: () => new Date(), log: new FakeLogger() }, { crew: "dev-plan", step: "dev-plan" });
  const spec = { agent: "dev-reviewer", charter: "dev-reviewer", task: "review", builder: () => ({ name: "dev-reviewer" }) as any };

  it("runs the act in a child, adds the child agent once, and fills the crew's effort", async () => {
    const run = fakeRun();
    const llm = withChildAct(base(), run.ctx, run.crew, { board: board(), clock: () => new Date(Date.now() + run.receives.length * 1000), log: new FakeLogger(), effort: "low" }, spec);
    strictEqual(await llm.act("p1", {}), "reply of a1");
    strictEqual(await llm.act("p2", { effort: "high" }), "reply of a2");
    deepStrictEqual(run.added, ["dev-reviewer"]);
    deepStrictEqual(run.spawned.map(([, i]) => JSON.parse(String(i)).request.effort), ["low", "high"]);
  });

  it("keeps the act inline, and says so, on a host without background children", async () => {
    const b = base();
    const log = new FakeLogger();
    const llm = withChildAct(b, {} as any, {} as any, { board: board(), clock: () => new Date(), log }, spec);
    strictEqual(await llm.act("p", {}), "inline");
    strictEqual(log.lines[0].startsWith("warn: dev-reviewer: this host runs no background child"), true);
  });
});
