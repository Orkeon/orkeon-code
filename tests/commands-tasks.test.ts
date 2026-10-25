// /tasks (commands/_lib/tasks.ts) over a FakeSessionStore: the task list, and the agent instances
// the dev crews leave in the state bag (A-3) — list, show, stop, send, repair. Run:
//   node --test tests/commands-tasks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { DEFAULT_REPAIR_NOTE, REPAIR_CREW, TASKS_USAGE } from "../src/commands/_lib/tasks.ts";
import { requestKey, snapshotKey } from "../src/shared/domain/agents/instances.ts";
import { EFFORT_STATE_KEY, TASKS_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { EMPTY_TEXT, record, tasksHarness } from "./commands-tasks.fixtures.ts";

describe("/tasks — the task list", () => {
  it("says there is nothing, with the usage", async () => {
    // Arrange
    const { run } = tasksHarness();

    // Act
    const { view } = await run();

    // Assert
    strictEqual(view.text, EMPTY_TEXT);
  });

  it("adds a task", async () => {
    // Arrange
    const { run } = tasksHarness();

    // Act
    const { view } = await run("add", "write", "tests");

    // Assert
    strictEqual(view.text, "task #1 added: write tests");
  });

  it("marks a task done", async () => {
    // Arrange
    const { run } = tasksHarness();
    await run("add", "write", "tests");

    // Act
    const { view } = await run("done", "1");

    // Assert
    strictEqual(view.text, "task #1 done: write tests");
  });

  it("lists the tasks", async () => {
    // Arrange
    const { run } = tasksHarness();
    await run("add", "write", "tests");
    await run("done", "1");

    // Act
    const { view } = await run("list");

    // Assert
    deepStrictEqual(view.table, [{ n: 1, status: "done", subject: "write tests" }]);
  });

  it("refuses to mark done a task out of range, with the range", async () => {
    // Arrange
    const { run } = tasksHarness();
    await run("add", "write", "tests");
    await run("done", "1");

    // Act
    const { view } = await run("done", "4");

    // Assert
    strictEqual(view.text, "usage: /tasks done <1-1>");
  });

  it("clears the list", async () => {
    // Arrange
    const { session, run } = tasksHarness();
    await run("add", "write", "tests");
    await run("done", "1");

    // Act
    const { view } = await run("clear");

    // Assert
    strictEqual(view.text, "task list cleared (1 removed).");
    strictEqual(session.state.get(TASKS_STATE_KEY), "[]");
  });

  it("answers an unknown sub-command with the usage", async () => {
    // Arrange
    const { run } = tasksHarness();

    // Act
    const { view } = await run("nope");

    // Assert
    strictEqual(view.text, TASKS_USAGE);
  });
});

describe("/tasks — the agent instances", () => {
  it("lists the instances under the tasks, the open run first", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan");
    seed("dev-verify", { serving: false, open: false }, record({ agent: "dev-auditor", charter: "dev-auditor", state: "completed" }));
    await run("add", "t");

    // Act
    const { view } = await run();

    // Assert
    deepStrictEqual(view.lines, ["tasks:", "#1 [open] t", "agent instances:"]);
    deepStrictEqual(view.table!.map((r: any) => [r.crew, r.id, r.state, r.run]), [
      ["dev-plan", "a1", "running", "answering"], ["dev-verify", "a1", "completed", "ended"],
    ]);
  });

  it("lists the children of /dev-spec and /dev-change too", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-spec", {}, record({ id: "s1" }));
    seed("dev-change", {}, record({ id: "c1" }));

    // Act
    const { view } = await run();

    // Assert
    deepStrictEqual(view.table!.map((r: any) => [r.crew, r.id]).sort(), [["dev-change", "c1"], ["dev-spec", "s1"]]);
  });

  it("an unreadable snapshot is no instance", async () => {
    // Arrange
    const { session, run } = tasksHarness();
    session.state.set(snapshotKey("dev-plan"), "{");

    // Act
    const { view } = await run();

    // Assert
    strictEqual(view.text, EMPTY_TEXT);
  });

  it("shows one instance", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan");

    // Act
    const { view } = await run("show", "a1");

    // Assert
    ok(view.lines![0].startsWith("dev-plan:a1 — dev-reviewer"));
  });

  it("asks for the crew when two hold the id", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan");
    seed("dev-verify");

    // Act
    const { view } = await run("show", "a1");

    // Assert
    ok(view.text!.includes("write dev-plan:a1 or dev-verify:a1"));
  });

  it("answers show without an id with the usage", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan");
    seed("dev-verify");

    // Act
    const { view } = await run("show");

    // Assert
    strictEqual(view.text, TASKS_USAGE);
  });

  it("stop leaves a request for a running instance of a run that answers", async () => {
    // Arrange
    const { session, run, seed } = tasksHarness();
    seed("dev-plan");

    // Act
    const { view } = await run("stop", "a1");

    // Assert
    ok(view.text!.startsWith("stop asked for dev-plan:a1"));
    deepStrictEqual(JSON.parse(session.state.get(requestKey("dev-plan", "a1"))!), { action: "stop", run: "2026-10-24T10:00:00.000Z", at: "2026-10-24T10:05:00.000Z" });
  });

  it("stop leaves its request once", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan");
    await run("stop", "a1");

    // Act
    const { view } = await run("stop", "a1");

    // Assert
    ok(view.text!.includes("already waiting"));
  });

  it("stop overwrites a request an earlier run left unread", async () => {
    // Arrange
    const { session, run, seed } = tasksHarness();
    seed("dev-plan");
    session.state.set(requestKey("dev-plan", "a1"), JSON.stringify({ action: "stop", run: "an earlier run", at: "t" }));

    // Act
    const { view } = await run("stop", "a1");

    // Assert
    ok(view.text!.startsWith("stop asked for dev-plan:a1"));
    strictEqual(JSON.parse(session.state.get(requestKey("dev-plan", "a1"))!).run, "2026-10-24T10:00:00.000Z");
  });

  it("a run silent for too long is taken for dead: its running child is listed failed", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan", { updatedAt: "2026-10-24T10:00:00.000Z" });

    // Act
    const { view } = await run();

    // Assert
    deepStrictEqual(view.table!.map((r: any) => [r.state, r.run]), [["failed", "ended"]]);
  });

  it("a run silent for too long is taken for dead: its running child cannot be stopped", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan", { updatedAt: "2026-10-24T10:00:00.000Z" });

    // Act
    const { view } = await run("stop", "a1");

    // Assert
    ok(view.text!.includes("nothing to stop"));
  });

  it("a run silent for too long is taken for dead: its running child can be repaired", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan", { updatedAt: "2026-10-24T10:00:00.000Z" });

    // Act
    const out = await run("repair", "a1");

    // Assert
    strictEqual(out.launch!.crew, REPAIR_CREW);
  });

  it("stop is refused for an ended instance", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan", {}, record({ state: "completed" }));

    // Act
    const { view } = await run("stop", "a1");

    // Assert
    ok(view.text!.includes("nothing to stop"));
  });

  it("stop is refused for a run that no longer answers", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan", { serving: false }, record());

    // Act
    const { view } = await run("stop", "a1");

    // Assert
    ok(view.text!.includes("no longer answers"));
  });

  it("send is refused while the instance runs", async () => {
    // Arrange
    const { session, run, seed } = tasksHarness();
    seed("dev-plan");

    // Act
    const out = await run("send", "a1", "why?");

    // Assert
    ok(out.view.text!.includes("is running: a send is refused"));
    strictEqual(out.launch, undefined);
    strictEqual(session.state.has(requestKey("dev-plan", "a1")), false);
  });

  it("send without a message answers with its usage", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-plan", {}, record({ state: "completed", reply: "the old review" }));

    // Act
    const { view } = await run("send", "a1");

    // Assert
    strictEqual(view.text, "usage: /tasks send <id> <message>");
  });

  it("send to an ended instance is a repair by a new run, the previous report in its brief, at the effort stored now", async () => {
    // Arrange
    const { session, run, seed } = tasksHarness();
    seed("dev-plan", {}, record({ state: "completed", reply: "the old review" }));
    session.state.set(EFFORT_STATE_KEY, "high");

    // Act
    const out = await run("send", "a1", "check", "B-2");

    // Assert
    strictEqual(out.launch!.crew, REPAIR_CREW);
    strictEqual(session.state.has(requestKey("dev-plan", "a1")), false);
    const input = out.launch!.input as Record<string, string>;
    deepStrictEqual([input.charter, input.system, input.effort], ["dev-reviewer", "S", "high"]);
    ok(input.brief.includes("check B-2") && input.brief.includes("the old review") && input.brief.includes("B"));
    deepStrictEqual(out.launch!.details, { instance: "dev-plan:a1", charter: "dev-reviewer" });
  });

  it("repair runs any ended instance again, with the default note", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-verify", {}, record({ agent: "dev-auditor", charter: "dev-auditor", state: "stopped" }));

    // Act
    const out = await run("repair", "a1");

    // Assert
    ok((out.launch!.input as Record<string, string>).brief.includes(DEFAULT_REPAIR_NOTE));
  });

  it("repair refuses a running instance", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-verify", {}, record());

    // Act
    const { view } = await run("repair", "a1");

    // Assert
    ok(view.text!.includes("is running: a repair is for an ended instance"));
  });

  it("a repair carries the step of the instance's run: a reviewer of /dev-spec is repaired under dev-spec", async () => {
    // Arrange
    const { run, seed } = tasksHarness();
    seed("dev-spec", {}, record({ state: "completed", task: "review of the spec" }));

    // Act
    const out = await run("repair", "a1");

    // Assert
    strictEqual(out.launch!.input.step, "dev-spec");
  });
});
