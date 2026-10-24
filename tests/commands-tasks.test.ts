// /tasks (commands/_lib/tasks.ts) over a FakeSessionStore: the task list, and the agent instances
// the dev crews leave in the state bag (A-3) — list, show, stop, send, repair. Run:
//   node --test tests/commands-tasks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { DEFAULT_REPAIR_NOTE, REPAIR_CREW, TASKS_USAGE, runTasks } from "../src/commands/_lib/tasks.ts";
import { requestKey, snapshotKey } from "../src/shared/domain/agents/instances.ts";
import type { InstanceRecord, RunSnapshot } from "../src/shared/domain/agents/instances.ts";
import { EFFORT_STATE_KEY, TASKS_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";

const record = (over: Partial<InstanceRecord> = {}): InstanceRecord => ({
  id: "a1", agent: "dev-reviewer", charter: "dev-reviewer", task: "review of the plan", state: "running",
  startedAt: "2026-10-24T10:00:00.000Z", effort: "low", system: "S", brief: "B", ...over,
});

function setup() {
  const session = new FakeSessionStore();
  const run = (...tokens: string[]) => runTasks(tokens, { session, clock: () => new Date("2026-10-24T10:05:00.000Z") });
  const seed = (crew: string, over: Partial<RunSnapshot> = {}, ...instances: InstanceRecord[]) =>
    session.state.set(snapshotKey(crew), JSON.stringify({
      crew, step: crew, startedAt: "2026-10-24T10:00:00.000Z", updatedAt: "2026-10-24T10:04:59.000Z", serving: true, open: true,
      instances: instances.length > 0 ? instances : [record()], ...over,
    }));
  return { session, run, seed };
}

describe("/tasks — the task list", () => {
  it("adds, marks done, lists and clears, as before", async () => {
    const { session, run } = setup();
    strictEqual((await run()).view.text, "no tasks and no agent instances. usage: /tasks add <subject>");
    strictEqual((await run("add", "write", "tests")).view.text, "task #1 added: write tests");
    strictEqual((await run("done", "1")).view.text, "task #1 done: write tests");
    deepStrictEqual((await run("list")).view.table, [{ n: 1, status: "done", subject: "write tests" }]);
    strictEqual((await run("done", "4")).view.text, "usage: /tasks done <1-1>");
    strictEqual((await run("clear")).view.text, "task list cleared (1 removed).");
    strictEqual(session.state.get(TASKS_STATE_KEY), "[]");
    strictEqual((await run("nope")).view.text, TASKS_USAGE);
  });
});

describe("/tasks — the agent instances", () => {
  it("lists the instances under the tasks, the open run first", async () => {
    const { run, seed } = setup();
    seed("dev-plan");
    seed("dev-verify", { serving: false, open: false }, record({ agent: "dev-auditor", charter: "dev-auditor", state: "completed" }));
    await run("add", "t");
    const { view } = await run();
    deepStrictEqual(view.lines, ["tasks:", "#1 [open] t", "agent instances:"]);
    deepStrictEqual(view.table!.map((r: any) => [r.crew, r.id, r.state, r.run]), [
      ["dev-plan", "a1", "running", "answering"], ["dev-verify", "a1", "completed", "ended"],
    ]);
  });

  it("lists the children of /dev-spec and /dev-change too", async () => {
    const { run, seed } = setup();
    seed("dev-spec", {}, record({ id: "s1" }));
    seed("dev-change", {}, record({ id: "c1" }));
    const { view } = await run();
    deepStrictEqual(view.table!.map((r: any) => [r.crew, r.id]).sort(), [["dev-change", "c1"], ["dev-spec", "s1"]]);
  });

  it("an unreadable snapshot is no instance", async () => {
    const { session, run } = setup();
    session.state.set(snapshotKey("dev-plan"), "{");
    strictEqual((await run()).view.text, "no tasks and no agent instances. usage: /tasks add <subject>");
  });

  it("shows one instance, and asks for the crew when two hold the id", async () => {
    const { run, seed } = setup();
    seed("dev-plan");
    ok((await run("show", "a1")).view.lines![0].startsWith("dev-plan:a1 — dev-reviewer"));
    seed("dev-verify");
    ok((await run("show", "a1")).view.text!.includes("write dev-plan:a1 or dev-verify:a1"));
    strictEqual((await run("show")).view.text, TASKS_USAGE);
  });

  it("stop leaves a request for a running instance of a run that answers, once", async () => {
    const { session, run, seed } = setup();
    seed("dev-plan");
    ok((await run("stop", "a1")).view.text!.startsWith("stop asked for dev-plan:a1"));
    deepStrictEqual(JSON.parse(session.state.get(requestKey("dev-plan", "a1"))!), { action: "stop", run: "2026-10-24T10:00:00.000Z", at: "2026-10-24T10:05:00.000Z" });
    ok((await run("stop", "a1")).view.text!.includes("already waiting"));
  });

  it("stop overwrites a request an earlier run left unread", async () => {
    const { session, run, seed } = setup();
    seed("dev-plan");
    session.state.set(requestKey("dev-plan", "a1"), JSON.stringify({ action: "stop", run: "an earlier run", at: "t" }));
    ok((await run("stop", "a1")).view.text!.startsWith("stop asked for dev-plan:a1"));
    strictEqual(JSON.parse(session.state.get(requestKey("dev-plan", "a1"))!).run, "2026-10-24T10:00:00.000Z");
  });

  it("a run silent for too long is taken for dead: its running child cannot be stopped, it can be repaired", async () => {
    const { run, seed } = setup();
    seed("dev-plan", { updatedAt: "2026-10-24T10:00:00.000Z" });
    deepStrictEqual((await run()).view.table!.map((r: any) => [r.state, r.run]), [["failed", "ended"]]);
    ok((await run("stop", "a1")).view.text!.includes("nothing to stop"));
    strictEqual((await run("repair", "a1")).launch!.crew, REPAIR_CREW);
  });

  it("stop is refused for an ended instance, and for a run that no longer answers", async () => {
    const { run, seed } = setup();
    seed("dev-plan", {}, record({ state: "completed" }));
    ok((await run("stop", "a1")).view.text!.includes("nothing to stop"));
    seed("dev-plan", { serving: false }, record());
    ok((await run("stop", "a1")).view.text!.includes("no longer answers"));
  });

  it("send is refused while the instance runs", async () => {
    const { session, run, seed } = setup();
    seed("dev-plan");
    const out = await run("send", "a1", "why?");
    ok(out.view.text!.includes("is running: a send is refused"));
    strictEqual(out.launch, undefined);
    strictEqual(session.state.has(requestKey("dev-plan", "a1")), false);
  });

  it("send to an ended instance is a repair by a new run, the previous report in its brief, at the effort stored now", async () => {
    const { session, run, seed } = setup();
    seed("dev-plan", {}, record({ state: "completed", reply: "the old review" }));
    strictEqual((await run("send", "a1")).view.text, "usage: /tasks send <id> <message>");
    session.state.set(EFFORT_STATE_KEY, "high");
    const out = await run("send", "a1", "check", "B-2");
    strictEqual(out.launch!.crew, REPAIR_CREW);
    strictEqual(session.state.has(requestKey("dev-plan", "a1")), false);
    const input = out.launch!.input as Record<string, string>;
    deepStrictEqual([input.charter, input.system, input.effort], ["dev-reviewer", "S", "high"]);
    ok(input.brief.includes("check B-2") && input.brief.includes("the old review") && input.brief.includes("B"));
    deepStrictEqual(out.launch!.details, { instance: "dev-plan:a1", charter: "dev-reviewer" });
  });

  it("repair runs any ended instance again, with the default note; a running one is refused", async () => {
    const { run, seed } = setup();
    seed("dev-verify", {}, record({ agent: "dev-auditor", charter: "dev-auditor", state: "stopped" }));
    const out = await run("repair", "a1");
    ok((out.launch!.input as Record<string, string>).brief.includes(DEFAULT_REPAIR_NOTE));
    seed("dev-verify", {}, record());
    ok((await run("repair", "a1")).view.text!.includes("is running: a repair is for an ended instance"));
  });
});
