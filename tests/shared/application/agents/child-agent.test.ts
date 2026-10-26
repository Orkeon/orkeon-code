// A sub-agent's act run as a background child (A-3): the board /tasks reads, the requests it
// serves, and the wait. Over a fake ChildRuntime whose pause moves a fake clock. Run:
//   node --test tests/shared/application/agents/child-agent.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";

import {
  CHILD_POLL_MS, MAX_EARLY_WAKES, instanceKey, parseChildInput, readChildOutcome, runChildAct,
} from "../../../../src/shared/application/agents/child-agent.ts";
import { SNAPSHOT_HEARTBEAT_MS, parseSnapshot, requestKey, snapshotKey } from "../../../../src/shared/domain/agents/instances.ts";
import { CHILD_INPUTS, CHILD_OUTCOMES, boardRow, childSetup } from "./child-agent.fixtures.ts";

describe("parseChildInput and readChildOutcome", () => {
  for (const c of CHILD_INPUTS) {
    it(`parseChildInput ${c.name}`, () => {
      // Arrange
      const { input } = c;

      // Act
      const parsed = parseChildInput(input);

      // Assert
      deepStrictEqual(parsed, c.expected);
    });
  }

  for (const c of CHILD_OUTCOMES) {
    it(`readChildOutcome ${c.name}`, () => {
      // Arrange
      const { input } = c;

      // Act
      const outcome = readChildOutcome(input);

      // Assert
      deepStrictEqual(outcome, c.expected);
    });
  }
});

describe("runChildAct", () => {
  it("spawns the child with its key, waits, and returns its reply; the board shows it running then completed", async () => {
    // Arrange
    const { runtime, deps, call, snap } = childSetup();
    let seen = "";
    runtime.script = (n, rt) => {
      if (n === 1) seen = snap().instances[0].state + "/" + String(snap().serving);
      if (n === 2) rt.finish(1, { ok: true, reply: "the review" });
    };

    // Act
    const reply = await runChildAct(deps, call);

    // Assert
    strictEqual(reply, "the review");
    deepStrictEqual(JSON.parse(runtime.spawned[0].input), { key: "dev-plan:child:1", prompt: "review it", request: { system: "S", effort: "low" } });
    strictEqual(seen, "running/true");
    const s = snap();
    deepStrictEqual([s.serving, s.open, s.instances[0].id, s.instances[0].state, s.instances[0].reply], [false, true, "a1", "completed", "the review"]);
    deepStrictEqual([s.instances[0].effort, s.instances[0].system, s.instances[0].brief], ["low", "S", "review it"]);
    ok(s.instances[0].endedAt);
  });

  it("throws the child's failure", async () => {
    // Arrange
    const { runtime, deps, call, snap } = childSetup();
    runtime.script = (_n, rt) => rt.finish(1, { ok: false, error: "model down" });

    // Act
    const act = runChildAct(deps, call);

    // Assert
    await rejects(act, /dev-reviewer a1 failed: model down/);
    strictEqual(snap().instances[0].state, "failed");
  });

  it("serves a /tasks stop: the child is stopped, the act throws, the board says stopped, not failed", async () => {
    // Arrange
    const { runtime, state, deps, call, snap } = childSetup();
    runtime.stoppedAs = "failed";
    runtime.script = (n) => {
      if (n === 1) void state.writeState(requestKey("dev-plan", "a1"), JSON.stringify({ action: "stop", run: snap().startedAt, at: "t" }));
    };

    // Act
    const act = runChildAct(deps, call);

    // Assert
    await rejects(act, /dev-reviewer a1 stopped: stopped by \/tasks stop/);
    deepStrictEqual(runtime.stops, ["a1"]);
    strictEqual(state.state.get(requestKey("dev-plan", "a1")), "");
    const r = snap().instances[0];
    deepStrictEqual([r.state, r.stopRequested], ["stopped", true]);
  });

  it("clears a stop an earlier run left for the same id, and drops one stamped with another run", async () => {
    // Arrange
    const { runtime, state, deps, call } = childSetup();
    const key = requestKey("dev-plan", "a1");
    await state.writeState(key, JSON.stringify({ action: "stop", run: "an earlier run", at: "t" }));
    let atStart = "";
    runtime.script = (n, rt) => {
      if (n === 1) {
        atStart = state.state.get(key) ?? "";
        void state.writeState(key, JSON.stringify({ action: "stop", run: "yet another run", at: "t" }));
      }
      if (n === 2) rt.finish(1, { ok: true, reply: "done" });
    };

    // Act
    const reply = await runChildAct(deps, call);

    // Assert
    strictEqual(reply, "done");
    deepStrictEqual([atStart, runtime.stops, state.state.get(key)], ["", [], ""]);
  });

  it("takes the instance id the child said over the runtime's rows", async () => {
    // Arrange
    const { runtime, deps, call, snap } = childSetup();
    runtime.spawn = (agent) => {
      runtime.rows.push({ id: "a1", agent: "x", state: "running" }, { id: "a2", agent: "y", state: "running" });
      runtime.memory.set(instanceKey("dev-plan:child:1"), "a1");
      void agent;
    };
    runtime.script = (_n, rt) => rt.memory.set("dev-plan:child:1", { ok: true, reply: "r" });

    // Act
    await runChildAct(deps, call);

    // Assert
    strictEqual(snap().instances[0].id, "a1");
  });

  it("says when the child ended without a reply", async () => {
    // Arrange
    const { runtime, deps, call } = childSetup();
    runtime.script = (_n, rt) => { rt.rows[0].state = "completed"; };

    // Act
    const act = runChildAct(deps, call);

    // Assert
    await rejects(act, /ended without leaving a reply/);
  });

  it("gives up after MAX_EARLY_WAKES pauses that return at once, and stops the child", async () => {
    // Arrange
    const { runtime, deps, call } = childSetup();
    runtime.advance = false;

    // Act
    const act = runChildAct(deps, call);

    // Assert
    await rejects(act, new RegExp(`returned at once ${MAX_EARLY_WAKES} times`));
    deepStrictEqual([runtime.pauses, runtime.stops], [MAX_EARLY_WAKES, ["a1"]]);
  });

  it("a failing wait stops the child, marks it failed and rethrows", async () => {
    // Arrange
    const { runtime, deps, call, snap } = childSetup();
    runtime.pause = async () => { throw new Error("cancelled"); };

    // Act
    const act = runChildAct(deps, call);

    // Assert
    await rejects(act, /cancelled/);
    deepStrictEqual(runtime.stops, ["a1"]);
    deepStrictEqual([snap().instances[0].state, snap().instances[0].error], ["failed", "cancelled"]);
  });

  it("pauses CHILD_POLL_MS between two looks", async () => {
    // Arrange
    const { runtime, deps, call } = childSetup();
    const start = runtime.now;
    runtime.script = (n, rt) => { if (n === 3) rt.finish(1, { ok: true, reply: "r" }); };

    // Act
    await runChildAct(deps, call);

    // Assert
    strictEqual(runtime.now - start, 3 * CHILD_POLL_MS);
  });
});

describe("the board", () => {
  it("writes an unchanged snapshot again every SNAPSHOT_HEARTBEAT_MS while the run answers", async () => {
    // Arrange
    const { runtime, state, board } = childSetup();
    board.add(boardRow("running"));
    await board.publish(true);
    const first = JSON.parse(state.state.get(snapshotKey("dev-plan"))!).updatedAt;
    runtime.now += SNAPSHOT_HEARTBEAT_MS;

    // Act
    await board.publish(true);

    // Assert
    const second = JSON.parse(state.state.get(snapshotKey("dev-plan"))!).updatedAt;
    ok(second > first);
  });

  it("writes it never once the run does not answer", async () => {
    // Arrange
    const { runtime, state, board } = childSetup();
    board.add(boardRow("running"));
    await board.publish(true);
    runtime.now += SNAPSHOT_HEARTBEAT_MS;
    await board.publish(true);
    runtime.now += SNAPSHOT_HEARTBEAT_MS;
    await board.publish(false);
    await board.publish(false);
    runtime.now += SNAPSHOT_HEARTBEAT_MS;

    // Act
    await board.publish(false);

    // Assert
    strictEqual(JSON.parse(state.state.get(snapshotKey("dev-plan"))!).serving, false);
  });

  it("close leaves the last run's snapshot when this one started no child", async () => {
    // Arrange
    const { state, board } = childSetup();
    await state.writeState(snapshotKey("dev-plan"), "previous");

    // Act
    await board.close();

    // Assert
    strictEqual(state.state.get(snapshotKey("dev-plan")), "previous");
  });

  it("close says the run ended", async () => {
    // Arrange
    const { state, board } = childSetup();
    await state.writeState(snapshotKey("dev-plan"), "previous");
    await board.close();
    board.add(boardRow("completed"));

    // Act
    await board.close();

    // Assert
    strictEqual(parseSnapshot(state.state.get(snapshotKey("dev-plan"))!)!.open, false);
  });

  it("writes only what changed", async () => {
    // Arrange
    const { state, board } = childSetup();
    board.add(boardRow("running"));
    await board.publish(true);
    const first = state.state.get(snapshotKey("dev-plan"));

    // Act
    await board.publish(true);

    // Assert
    strictEqual(state.state.get(snapshotKey("dev-plan")), first);
  });

  it("warns once when the state bag refuses", async () => {
    // Arrange
    const { state, board, log } = childSetup();
    board.add(boardRow("running"));
    await board.publish(true);
    await board.publish(true);
    state.failure = new Error("no session tools");
    await board.publish(false);

    // Act
    await board.close();

    // Assert
    strictEqual(log.lines.filter((l) => l.startsWith("warn:")).length, 1);
  });
});
