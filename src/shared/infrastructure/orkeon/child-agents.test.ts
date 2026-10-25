/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// The children of a crew run over the runtime (A-3): the ChildRuntime adapter, the child's body
// and withChildAct, over a hand-made agent context and crew. Run:
//   node --test src/shared/infrastructure/orkeon/child-agents.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";

import { childAgentBody, createChildRuntime, withChildAct } from "./child-agents.ts";
import { parseSnapshot, snapshotKey } from "../../domain/agents/instances.ts";
import { FakeLlmFacade } from "../../../../tests/support/fake-llm-facade.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { REVIEW_STEPS, STOPS, base, board, fakeRun, openReview, spec } from "./child-agents.fixtures.ts";

describe("createChildRuntime", () => {
  it("is null on a host without background children", () => {
    // Arrange
    const ctx = {} as any;

    // Act
    const runtime = createChildRuntime(ctx, {} as any);

    // Assert
    strictEqual(runtime, null);
  });

  it("maps the crew's instances", () => {
    // Arrange
    const run = fakeRun();
    const rt = createChildRuntime(run.ctx, run.crew)!;
    rt.spawn("dev-reviewer", "{}");

    // Act
    const instances = rt.instances();

    // Assert
    deepStrictEqual(instances, [{ id: "a1", agent: "01JID-dev-reviewer", state: "running" }]);
  });

  for (const c of STOPS) {
    it(`maps the crew's stop: ${JSON.stringify(c.id)} ${c.stopped ? "stopped" : "not stopped"}`, () => {
      // Arrange
      const run = fakeRun();
      const rt = createChildRuntime(run.ctx, run.crew)!;
      rt.spawn("dev-reviewer", "{}");

      // Act
      const stopped = rt.stop(c.id);

      // Assert
      strictEqual(stopped, c.stopped);
    });
  }

  it("pauses on a receive with the timeout, and swallows the timeout", async () => {
    // Arrange
    const run = fakeRun();
    const rt = createChildRuntime(run.ctx, run.crew)!;
    rt.spawn("dev-reviewer", "{}");

    // Act
    await rt.pause(1000);

    // Assert
    deepStrictEqual(run.receives, [{ timeout: 1000 }]);
  });

  it("maps the crew's memory", async () => {
    // Arrange
    const run = fakeRun();
    const rt = createChildRuntime(run.ctx, run.crew)!;
    rt.spawn("dev-reviewer", "{}");
    await rt.pause(1000);

    // Act
    const value = await rt.read("dev-plan:child:1");

    // Assert
    strictEqual(value, run.memory.get("dev-plan:child:1"));
  });

  it("lets a pause fail on any error but the timeout", async () => {
    // Arrange
    const run = fakeRun();
    const rt = createChildRuntime(run.ctx, run.crew)!;
    run.setReceiveError(new Error("cancelled"));

    // Act
    const act = rt.pause(1000);

    // Assert
    await rejects(act, /cancelled/);
  });
});

describe("childAgentBody", () => {
  it("acts on its call and leaves the reply under its key", async () => {
    // Arrange
    const run = fakeRun();
    const facade = new FakeLlmFacade();
    facade.actResult = { output: "the review", iterations: 2 };
    const body = childAgentBody(() => undefined);
    const input = JSON.stringify({ key: "k1", prompt: "review", request: { system: "S", effort: "high" } });

    // Act
    const reply = await body(input, { ...run.ctx, llm: facade, instanceId: "a3" });

    // Assert
    strictEqual(reply, "the review");
    deepStrictEqual(run.memory.get("k1"), { ok: true, reply: "the review" });
    strictEqual(run.memory.get("k1:instance"), "a3");
    deepStrictEqual(facade.calls[0].args, ["review", { system: "S", effort: "high" }]);
  });

  it("leaves the failure under its key and rethrows", async () => {
    // Arrange
    const run = fakeRun();
    const facade = new FakeLlmFacade();
    facade.actResult = new Error("model down\nstack");
    const body = childAgentBody(() => undefined);

    // Act
    const act = body(JSON.stringify({ key: "k1", prompt: "p" }), { ...run.ctx, llm: facade });

    // Assert
    await rejects(act, /model down/);
    deepStrictEqual(run.memory.get("k1"), { ok: false, error: "model down" });
  });

  it("refuses an input that is not a call", async () => {
    // Arrange
    const run = fakeRun();
    const body = childAgentBody(() => undefined);

    // Act
    const act = body("nope", { ...run.ctx, llm: new FakeLlmFacade() });

    // Assert
    await rejects(act, /not a child call/);
  });
});

describe("withChildAct", () => {
  it("runs the act in a child, adds the child agent, and fills the crew's effort", async () => {
    // Arrange
    const run = fakeRun();
    const llm = withChildAct(base(), run.ctx, run.crew, { board: board(), clock: () => new Date(Date.now() + run.receives.length * 1000), log: new FakeLogger(), effort: "low" }, spec);

    // Act
    const reply = await llm.act("p1", {});

    // Assert
    strictEqual(reply, "reply of a1");
    deepStrictEqual(run.added, ["dev-reviewer"]);
    deepStrictEqual(run.spawned.map(([, i]) => JSON.parse(String(i)).request.effort), ["low"]);
  });

  it("adds the child agent once over two acts, and keeps the effort an act names", async () => {
    // Arrange
    const run = fakeRun();
    const llm = withChildAct(base(), run.ctx, run.crew, { board: board(), clock: () => new Date(Date.now() + run.receives.length * 1000), log: new FakeLogger(), effort: "low" }, spec);
    await llm.act("p1", {});

    // Act
    const reply = await llm.act("p2", { effort: "high" });

    // Assert
    strictEqual(reply, "reply of a2");
    deepStrictEqual(run.added, ["dev-reviewer"]);
    deepStrictEqual(run.spawned.map(([, i]) => JSON.parse(String(i)).request.effort), ["low", "high"]);
  });

  it("keeps the act inline, and says so, on a host without background children", async () => {
    // Arrange
    const log = new FakeLogger();
    const llm = withChildAct(base(), {} as any, {} as any, { board: board(), clock: () => new Date(), log }, spec);

    // Act
    const reply = await llm.act("p", {});

    // Assert
    strictEqual(reply, "inline");
    strictEqual(log.lines[0].startsWith("warn: dev-reviewer: this host runs no background child"), true);
  });
});

describe("openChildAct", () => {
  for (const step of REVIEW_STEPS) {
    it(`runs ${step}'s review in a child that /tasks reads under ${step}`, async () => {
      // Arrange
      const { run, state, child } = openReview(step);

      // Act
      const reply = await child.llm.act("p", {});

      // Assert
      strictEqual(reply, "reply of a1");
      deepStrictEqual(run.added, ["dev-reviewer"]);
      const live = parseSnapshot(await state.readState(snapshotKey(step)));
      deepStrictEqual([live?.crew, live?.step, live?.open], [step, step, true]);
      deepStrictEqual(live?.instances.map((i) => [i.charter, i.task, i.state]), [["dev-reviewer", `review of the ${step}`, "completed"]]);
    });

    it(`closes the run of ${step}'s review`, async () => {
      // Arrange
      const { state, child } = openReview(step);
      await child.llm.act("p", {});

      // Act
      await child.close();

      // Assert
      strictEqual(parseSnapshot(await state.readState(snapshotKey(step)))?.open, false);
    });
  }
});
