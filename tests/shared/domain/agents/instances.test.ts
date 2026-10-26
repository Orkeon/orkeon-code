// The agent instances /tasks reads and decides on (A-3). Run:
//   node --test tests/shared/domain/agents/instances.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  buildRepairBrief, describeInstance, instanceLimits, instanceRows, locateInstance, parseRequest, parseSnapshot,
  requestKey, sendVerdict, settleSnapshot, snapshotKey, stopVerdict,
} from "../../../../src/shared/domain/agents/instances.ts";
import { MAX_BRIEF_CHARS } from "../../../../src/shared/domain/agents/charter.ts";
import {
  KEPT_RUNS, LIMIT_CASES, NO_REQUESTS, NOT_SNAPSHOTS, NOW, PLAN, RAW_SNAPSHOT, REPAIR_MENTIONS, ROW_RUNS, SEND_CASES,
  SILENT_RUN, STOP_CASES, STOP_REQUEST, UNPARSED_RUN, VERIFY, deadChild, record, snapshot,
} from "./instances.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("instances — keys", () => {
  it("one snapshot key per crew", () => {
    // Arrange
    const crew = "dev-plan";

    // Act
    const key = snapshotKey(crew);

    // Assert
    strictEqual(key, "agent_instances:dev-plan");
  });

  it("one request key per instance", () => {
    // Arrange
    const crew = "dev-plan";

    // Act
    const key = requestKey(crew, "a1");

    // Assert
    strictEqual(key, "agent_request:dev-plan:a1");
  });
});

describe("parseSnapshot", () => {
  it("reads a snapshot back, an unknown state as failed and a record without agent dropped", () => {
    // Arrange
    const raw = RAW_SNAPSHOT;

    // Act
    const s = parseSnapshot(raw)!;

    // Assert
    strictEqual(s.instances.length, 1);
    strictEqual(s.instances[0].state, "failed");
    strictEqual(s.serving, true);
  });

  for (const c of NOT_SNAPSHOTS) {
    it(`is null for nothing, bad JSON and a shape that is not a snapshot: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const s = parseSnapshot(raw);

      // Assert
      strictEqual(s, null);
    });
  }
});

describe("parseRequest", () => {
  it("reads a stop with its run", () => {
    // Arrange
    const raw = JSON.stringify(STOP_REQUEST);

    // Act
    const request = parseRequest(raw);

    // Assert
    deepStrictEqual(request, { action: "stop", run: "r", at: "t" });
  });

  for (const c of NO_REQUESTS) {
    it(`a cleared value, a send or bad JSON is no request: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const request = parseRequest(raw);

      // Assert
      strictEqual(request, null);
    });
  }
});

describe("instanceLimits", () => {
  for (const c of LIMIT_CASES) {
    it(`keeps integers within the bounds, else the runtime's defaults: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const limits = instanceLimits(raw);

      // Assert
      deepStrictEqual(limits, c.limits);
    });
  }
});

describe("locateInstance", () => {
  it("finds an id held by one crew, without the crew in front", () => {
    // Arrange
    const snapshots = [PLAN];

    // Act
    const found = locateInstance(snapshots, "a1");

    // Assert
    ok(found.ok && found.found.snapshot.crew === "dev-plan");
  });

  it("finds an id held by one crew, with the crew in front", () => {
    // Arrange
    const snapshots = [PLAN, VERIFY];

    // Act
    const found = locateInstance(snapshots, "dev-verify:a1");

    // Assert
    ok(found.ok);
  });

  it("asks for the crew when two hold the id", () => {
    // Arrange
    const snapshots = [PLAN, VERIFY];

    // Act
    const both = locateInstance(snapshots, "a1");

    // Assert
    ok(!both.ok && both.text.includes("dev-plan:a1 or dev-verify:a1"));
  });

  it("says when none holds the id", () => {
    // Arrange
    const snapshots = [PLAN];

    // Act
    const none = locateInstance(snapshots, "a9");

    // Assert
    ok(!none.ok && none.text.includes("no agent instance 'a9'"));
  });
});

describe("stopVerdict and sendVerdict", () => {
  for (const c of STOP_CASES) {
    it(`a stop only for a running instance of a run that answers: ${c.name}`, () => {
      // Arrange
      const { located } = c;

      // Act
      const verdict = stopVerdict(located);

      // Assert
      strictEqual(verdict.ok, c.ok);
    });
  }

  for (const c of SEND_CASES) {
    it(`a send refused while running, a repair once ended, whether its run answers or not: ${c.name}`, () => {
      // Arrange
      const { located } = c;

      // Act
      const verdict = sendVerdict(located);

      // Assert
      strictEqual(verdict.kind, c.kind);
    });
  }
});

describe("settleSnapshot", () => {
  for (const c of KEPT_RUNS) {
    it(`keeps a run that wrote lately, and an ended one: ${c.name}`, () => {
      // Arrange
      const run = c.snapshot;

      // Act
      const settled = settleSnapshot(run, NOW);

      // Assert
      strictEqual(settled, run);
    });
  }

  it("takes a silent open run for dead: not answering, its running children failed", () => {
    // Arrange
    const run = SILENT_RUN;

    // Act
    const dead = settleSnapshot(run, NOW);

    // Assert
    deepStrictEqual([dead.serving, dead.open], [false, false]);
    deepStrictEqual(dead.instances.map((r) => [r.state, r.error]), [["failed", "its run stopped answering"], ["completed", undefined]]);
  });

  it("takes a silent open run for dead: its failed child cannot be stopped", () => {
    // Arrange
    const child = deadChild();

    // Act
    const verdict = stopVerdict(child);

    // Assert
    ok(!verdict.ok);
  });

  it("takes a silent open run for dead: its failed child is repaired", () => {
    // Arrange
    const child = deadChild();

    // Act
    const verdict = sendVerdict(child);

    // Assert
    strictEqual(verdict.kind, "repair");
  });

  it("takes an open run whose updatedAt does not parse for dead", () => {
    // Arrange
    const run = UNPARSED_RUN;

    // Act
    const dead = settleSnapshot(run, NOW);

    // Assert
    deepStrictEqual([dead.serving, dead.open, dead.instances[0].state], [false, false, "failed"]);
  });
});

describe("buildRepairBrief", () => {
  it("carries the message, the previous report and the previous brief, and says it is a new run", () => {
    // Arrange
    const ended = record({ reply: "the report" });

    // Act
    const brief = buildRepairBrief(ended, "  fix X  ");

    // Assert
    assertMentions(brief, REPAIR_MENTIONS);
    ok(brief.endsWith("## Previous brief\nthe brief"));
  });

  it("says why there is no report", () => {
    // Arrange
    const stopped = record({ state: "stopped", reply: undefined, error: "stopped by /tasks stop" });

    // Act
    const brief = buildRepairBrief(stopped, "m");

    // Assert
    ok(brief.includes("(none: the instance stopped: stopped by /tasks stop)"));
  });

  it("stays within MAX_BRIEF_CHARS, the previous brief cut first", () => {
    // Arrange
    const ended = record({ reply: "r".repeat(10_000), brief: "b".repeat(30_000) });

    // Act
    const long = buildRepairBrief(ended, "m");

    // Assert
    strictEqual(long.length <= MAX_BRIEF_CHARS, true);
    ok(long.includes("r".repeat(10_000)));
    ok(long.includes("[… the start is left out]\nbbb"));
  });

  it("stays within MAX_BRIEF_CHARS, then the report cut", () => {
    // Arrange
    const ended = record({ reply: "r".repeat(40_000), brief: "b".repeat(100) });

    // Act
    const huge = buildRepairBrief(ended, "m");

    // Assert
    strictEqual(huge.length <= MAX_BRIEF_CHARS, true);
    ok(huge.includes("[… the start is left out]\nrrr"));
  });
});

describe("instanceRows and describeInstance", () => {
  it("lists open runs first, a stop asked on a running one, and how the run stands", () => {
    // Arrange
    const runs = ROW_RUNS;

    // Act
    const rows = instanceRows(runs);

    // Assert
    deepStrictEqual(rows.map((r) => [r.crew, r.state, r.run]), [
      ["dev-plan", "running (stop asked)", "answering"],
      ["dev-verify", "completed", "ended"],
    ]);
  });

  it("shows the instance, its error and its report", () => {
    // Arrange
    const located = { snapshot: snapshot(), record: record({ reply: "R", error: "E", effort: "low" }) };

    // Act
    const lines = describeInstance(located);

    // Assert
    ok(lines[0].startsWith("dev-plan:a1 — dev-reviewer (dev-reviewer), completed"));
    ok(lines[2].endsWith(", effort low"));
    deepStrictEqual(lines.slice(-3), ["error: E", "report:", "R"]);
  });
});
