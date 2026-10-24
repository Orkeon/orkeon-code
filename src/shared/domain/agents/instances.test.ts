// The agent instances /tasks reads and decides on (A-3). Run:
//   node --test src/shared/domain/agents/instances.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  buildRepairBrief, describeInstance, instanceLimits, instanceRows, locateInstance, parseRequest, parseSnapshot,
  requestKey, sendVerdict, snapshotKey, stopVerdict,
} from "./instances.ts";
import type { InstanceRecord, RunSnapshot } from "./instances.ts";
import { MAX_BRIEF_CHARS } from "./charter.ts";

const record = (over: Partial<InstanceRecord> = {}): InstanceRecord => ({
  id: "a1", agent: "dev-reviewer", charter: "dev-reviewer", task: "review of the plan", state: "completed",
  startedAt: "2026-10-24T10:00:00.000Z", system: "sys", brief: "the brief", sends: [], ...over,
});
const snapshot = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  crew: "dev-plan", step: "dev-plan", startedAt: "2026-10-24T10:00:00.000Z", updatedAt: "", serving: true,
  open: true, instances: [record()], ...over,
});

describe("instances — keys", () => {
  it("one snapshot key per crew, one request key per instance", () => {
    strictEqual(snapshotKey("dev-plan"), "agent_instances:dev-plan");
    strictEqual(requestKey("dev-plan", "a1"), "agent_request:dev-plan:a1");
  });
});

describe("parseSnapshot", () => {
  it("reads a snapshot back, an unknown state as failed and a record without agent dropped", () => {
    const raw = JSON.stringify({ ...snapshot(), instances: [{ ...record(), state: "weird" }, { id: "a2" }] });
    const s = parseSnapshot(raw)!;
    strictEqual(s.instances.length, 1);
    strictEqual(s.instances[0].state, "failed");
    strictEqual(s.serving, true);
  });

  it("is null for nothing, bad JSON and a shape that is not a snapshot", () => {
    strictEqual(parseSnapshot(null), null);
    strictEqual(parseSnapshot("{"), null);
    strictEqual(parseSnapshot(JSON.stringify({ crew: "x" })), null);
  });
});

describe("parseRequest", () => {
  it("reads stop and send; a cleared, empty or blank send is no request", () => {
    deepStrictEqual(parseRequest(JSON.stringify({ action: "stop", at: "t" })), { action: "stop", at: "t" });
    deepStrictEqual(parseRequest(JSON.stringify({ action: "send", message: "hi", at: "t" })), { action: "send", message: "hi", at: "t" });
    strictEqual(parseRequest(""), null);
    strictEqual(parseRequest(JSON.stringify({ action: "send", message: "  " })), null);
    strictEqual(parseRequest("nope"), null);
  });
});

describe("instanceLimits", () => {
  it("keeps integers within the bounds, else the runtime's defaults", () => {
    deepStrictEqual(instanceLimits({ concurrency: 2, maxInstances: "10" }), { concurrency: 2, maxInstances: 10 });
    deepStrictEqual(instanceLimits({ concurrency: 0, maxInstances: 65 }), { concurrency: 4, maxInstances: 32 });
    deepStrictEqual(instanceLimits({ concurrency: 1.5, maxInstances: "" }), { concurrency: 4, maxInstances: 32 });
    deepStrictEqual(instanceLimits(undefined), { concurrency: 4, maxInstances: 32 });
  });
});

describe("locateInstance", () => {
  const plan = snapshot();
  const verify = snapshot({ crew: "dev-verify", instances: [record({ agent: "dev-auditor" })] });

  it("finds an id held by one crew, with or without the crew in front", () => {
    const found = locateInstance([plan], "a1");
    ok(found.ok && found.found.snapshot.crew === "dev-plan");
    ok(locateInstance([plan, verify], "dev-verify:a1").ok);
  });

  it("asks for the crew when two hold the id, and says when none does", () => {
    const both = locateInstance([plan, verify], "a1");
    ok(!both.ok && both.text.includes("dev-plan:a1 or dev-verify:a1"));
    const none = locateInstance([plan], "a9");
    ok(!none.ok && none.text.includes("no agent instance 'a9'"));
  });
});

describe("stopVerdict and sendVerdict", () => {
  const at = (r: Partial<InstanceRecord>, s: Partial<RunSnapshot> = {}) => ({ snapshot: snapshot(s), record: record(r) });

  it("a stop only for a running instance of a run that answers", () => {
    ok(stopVerdict(at({ state: "running" })).ok);
    ok(!stopVerdict(at({ state: "completed" })).ok);
    ok(!stopVerdict(at({ state: "running" }, { serving: false })).ok);
  });

  it("a send refused while running, in place while the run answers, a repair once it does not", () => {
    strictEqual(sendVerdict(at({ state: "running" })).kind, "refused");
    strictEqual(sendVerdict(at({ state: "completed" })).kind, "in-place");
    strictEqual(sendVerdict(at({ state: "failed" }, { serving: false })).kind, "repair");
  });
});

describe("buildRepairBrief", () => {
  it("carries the message, the previous report and the previous brief, and says it is a new run", () => {
    const brief = buildRepairBrief(record({ reply: "the report" }), "  fix X  ");
    ok(brief.includes("new run of dev-reviewer"));
    ok(brief.includes("## Operator's message\nfix X\n"));
    ok(brief.includes("## Previous report\nthe report\n\n## Previous brief"));
    ok(brief.endsWith("## Previous brief\nthe brief"));
  });

  it("says why there is no report", () => {
    ok(buildRepairBrief(record({ state: "stopped", reply: undefined, error: "stopped by /tasks stop" }), "m")
      .includes("(none: the instance stopped: stopped by /tasks stop)"));
  });

  it("stays within MAX_BRIEF_CHARS, the previous brief cut first, then the report", () => {
    const long = buildRepairBrief(record({ reply: "r".repeat(10_000), brief: "b".repeat(30_000) }), "m");
    strictEqual(long.length <= MAX_BRIEF_CHARS, true);
    ok(long.includes("r".repeat(10_000)));
    ok(long.includes("[… the start is left out]\nbbb"));
    const huge = buildRepairBrief(record({ reply: "r".repeat(40_000), brief: "b".repeat(100) }), "m");
    strictEqual(huge.length <= MAX_BRIEF_CHARS, true);
    ok(huge.includes("[… the start is left out]\nrrr"));
  });
});

describe("instanceRows and describeInstance", () => {
  it("lists open runs first, a stop asked on a running one, and how the run stands", () => {
    const ended = snapshot({ crew: "dev-verify", serving: false, open: false, startedAt: "2026-10-24T11:00:00.000Z" });
    const live = snapshot({ instances: [record({ state: "running", stopRequested: true })] });
    deepStrictEqual(instanceRows([ended, live]).map((r) => [r.crew, r.state, r.run]), [
      ["dev-plan", "running (stop asked)", "answering"],
      ["dev-verify", "completed", "ended"],
    ]);
  });

  it("shows the report and each send with what came of it", () => {
    const lines = describeInstance({
      snapshot: snapshot(),
      record: record({ reply: "R", sends: [{ message: "m1", at: "t1", reply: "ok" }, { message: "m2", at: "t2", refused: "no" }, { message: "m3", at: "t3" }] }),
    });
    ok(lines[0].startsWith("dev-plan:a1 — dev-reviewer (dev-reviewer), completed"));
    deepStrictEqual(lines.slice(-8), [
      "report:", "R", "sent t1: m1", "  reply: ok", "sent t2: m2", "  refused: no", "sent t3: m3", "  (waiting for the crew)",
    ]);
  });
});
