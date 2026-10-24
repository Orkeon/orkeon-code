// Unit tests for the access cost: the report reader, the added lines, the measured cost, the section. Run:
//   node --test src/shared/domain/dev/access-cost.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import type { AccessCostReport } from "./access-cost.ts";
import {
  COST_NOT_WIRED, DEFAULT_RECEIVERS, addedLines, costLineOf, costSection, costSummary, measuredCost, notIndexed,
  nothingChanged, readAccessCostReport, receiversArgument, underRoots,
} from "./access-cost.ts";

const ZERO = { reads: 0, writes: 0, loops: 0, lambdas: 0, memory_filters: 0 };

/** A report as access_cost answers it (AccessCostDtos.cs). */
function raw(): Record<string, unknown> {
  return {
    members: [
      {
        member: "/workspace/src/order.ts::OrderService::place",
        port_calls: [
          { receiver: "this.repository", method: "findById", line: 10, in_loop: false, in_lambda: false },
          { receiver: "this.repository", method: "save", line: 14, in_loop: true, in_lambda: false },
          { receiver: "this.bus", method: "publish", line: 20, in_loop: false, in_lambda: true },
        ],
        in_memory_filters: [{ line: 22, method: "Where" }],
        cost: { reads: 1, writes: 0, loops: 1, lambdas: 1, memory_filters: 1 },
      },
      { member: "/workspace/src/order.ts::OrderService::total", port_calls: [], in_memory_filters: [], cost: ZERO },
    ],
    cost: { reads: 1, writes: 0, loops: 1, lambdas: 1, memory_filters: 1 },
  };
}

function report(): AccessCostReport {
  const r = readAccessCostReport(raw());
  if (r === null) throw new Error("unreadable");
  return r;
}

describe("readAccessCostReport", () => {
  it("reads the members, their calls and filters, and the totals", () => {
    const r = report();
    strictEqual(r.members.length, 2);
    deepStrictEqual(r.members[0].portCalls[1], { receiver: "this.repository", method: "save", line: 14, inLoop: true, inLambda: false });
    deepStrictEqual(r.members[0].memoryFilters, [{ line: 22, method: "Where" }]);
    deepStrictEqual(r.cost, { reads: 1, writes: 0, loops: 1, lambdas: 1, memoryFilters: 1 });
  });

  it("refuses a report whose fields are missing or mistyped", () => {
    strictEqual(readAccessCostReport(null), null);
    strictEqual(readAccessCostReport({ members: [] }), null);
    strictEqual(readAccessCostReport({ members: [{ member: 3, port_calls: [], in_memory_filters: [], cost: ZERO }], cost: ZERO }), null);
    strictEqual(readAccessCostReport({ members: [], cost: { ...ZERO, memory_filters: "1" } }), null);
    strictEqual(readAccessCostReport({ members: [{ member: "m", port_calls: [{ receiver: "r", method: "m" }], in_memory_filters: [], cost: ZERO }], cost: ZERO }), null);
  });
});

describe("addedLines", () => {
  it("numbers the added lines of each hunk in the new file", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts",
      "@@ -1,3 +1,4 @@", " one", "-two", "+deux", "+trois", " four",
      "@@ -10 +11,2 @@", "+eleven", "\\ No newline at end of file", " twelve",
    ].join("\n");
    deepStrictEqual([...(addedLines(diff) ?? [])], [2, 3, 11]);
  });

  it("reads a new file's diff (--no-index) as all lines added, and a text without a hunk as unknown", () => {
    deepStrictEqual([...(addedLines("--- /dev/null\n+++ b/x.ts\n@@ -0,0 +1,2 @@\n+a\n+b\n") ?? [])], [1, 2]);
    strictEqual(addedLines("Binary files differ\n"), null);
  });
});

describe("underRoots", () => {
  it("keeps the files under a root, every file without a root or with '.'", () => {
    const files = ["src/a.ts", "srcx/b.ts", "tests/a.test.ts", "src"];
    deepStrictEqual(underRoots(files, ["src/"]), ["src/a.ts", "src"]);
    deepStrictEqual(underRoots(files, ["./src", "tests"]), ["src/a.ts", "tests/a.test.ts", "src"]);
    deepStrictEqual(underRoots(files, []), files);
    deepStrictEqual(underRoots(files, ["."]), files);
  });
});

describe("receiversArgument", () => {
  it("leaves the runtime's default without the pack's regex", () => {
    strictEqual(receiversArgument(undefined), undefined);
    strictEqual(receiversArgument("  "), undefined);
  });

  it("adds the pack's regex to the default, case-insensitive (access-cost.py's meaning)", () => {
    strictEqual(receiversArgument("_fs|_llm"), `(?i)(?:${DEFAULT_RECEIVERS})|(?:_fs|_llm)`);
    const re = new RegExp(DEFAULT_RECEIVERS, "i");
    strictEqual(re.test("this.orderRepository"), true);
    strictEqual(re.test("_db"), true);
    strictEqual(re.test("validator"), false);
  });
});

describe("measuredCost", () => {
  it("flags a blocking call or filter on an added line, exit 2, and counts the reads and writes", () => {
    const cost = measuredCost(report(), new Map([["/workspace/src/order.ts", new Set([14, 22])]]));
    if (cost.state !== "measured") throw new Error("not measured");
    strictEqual(cost.exit, 2);
    deepStrictEqual(cost.flagged, [
      "src/order.ts::OrderService::place L14 this.repository.save in a loop",
      "src/order.ts::OrderService::place L22 Where memory filter",
    ]);
    strictEqual(cost.costLine, "Cost: 1 read + 0 writes through ports outside loops; in a loop, a lambda or a memory filter: 2 - back to design");
    strictEqual(cost.detail, [
      "[src/order.ts::OrderService::place]",
      "Ports outside loops (1): this.repository.findById L10",
      "Ports in a loop (1): this.repository.save L14",
      "Ports in a lambda (1): this.bus.publish L20 (pre-existing)",
      "Memory filter on an awaited result (1): L22 Where",
      "",
    ].join("\n"));
  });

  it("lists pre-existing blocking items without exit 2", () => {
    const cost = measuredCost(report(), new Map([["/workspace/src/order.ts", new Set<number>()]]));
    if (cost.state !== "measured") throw new Error("not measured");
    strictEqual(cost.exit, 0);
    deepStrictEqual(cost.flagged, []);
    strictEqual(cost.costLine.endsWith("memory filter: none"), true);
  });

  it("counts every line of a file whose diff is not known as added", () => {
    const unknown = measuredCost(report(), new Map([["/workspace/src/order.ts", null]]));
    const absent = measuredCost(report(), new Map());
    strictEqual(unknown.state === "measured" && unknown.flagged.length, 3);
    strictEqual(absent.state === "measured" && absent.flagged.length, 3);
  });

  it("says when no member awaits a port, or when the index has none", () => {
    const quiet = measuredCost({ members: [{ member: "m", portCalls: [], memoryFilters: [], cost: { reads: 0, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 } }], cost: { reads: 0, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 } }, new Map());
    strictEqual(quiet.state === "measured" && quiet.detail, "1 member, none awaits a port or filters in memory\n");
    const none = measuredCost({ members: [], cost: { reads: 0, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 } }, new Map());
    strictEqual(none.state === "measured" && none.detail, "no member of the changed files in the code index\n");
  });

  it("cuts a list after 12 items", () => {
    const calls = Array.from({ length: 14 }, (_, i) => ({ receiver: "store", method: "get", line: i + 1, in_loop: false, in_lambda: false }));
    const r = readAccessCostReport({ members: [{ member: "/workspace/a.ts::f", port_calls: calls, in_memory_filters: [], cost: { ...ZERO, reads: 14 } }], cost: { ...ZERO, reads: 14 } });
    const cost = measuredCost(r!, new Map());
    strictEqual(cost.state === "measured" && cost.detail.split("\n")[1].endsWith("store.get L12 / … +2"), true);
  });
});

describe("the cost texts", () => {
  it("writes the Cost line of access-cost.py, singular and plural", () => {
    strictEqual(costLineOf(2, 1, 0), "Cost: 2 reads + 1 write through ports outside loops; in a loop, a lambda or a memory filter: none");
  });

  it("says not indexed, with what the index holds", () => {
    const empty = notIndexed([]);
    strictEqual(empty.state === "not-computed" && empty.reason.startsWith("not indexed — the code index is empty: run /analyze"), true);
    const other = notIndexed(["/src"]);
    strictEqual(other.state === "not-computed" && other.reason.includes("holds /src, not /workspace"), true);
  });

  it("measures a batch without a file under the roots as nothing", () => {
    deepStrictEqual(nothingChanged(["src"]), {
      state: "measured", exit: 0, flagged: [], costLine: costLineOf(0, 0, 0), detail: "no changed file under src\n",
    });
  });

  it("prints the Cost line, or why it is not computed", () => {
    strictEqual(costSummary(nothingChanged([])), costLineOf(0, 0, 0));
    strictEqual(costSummary(COST_NOT_WIRED), "Cost: not computed — the crew wires no code index; judge the Cost axis from the diff");
  });
});

describe("costSection", () => {
  it("says the cost is not computed, with the reason", () => {
    strictEqual(costSection(COST_NOT_WIRED), "not computed: the crew wires no code index; judge the Cost axis from the diff\n");
  });

  it("renders a measured cost: exit, detail, cost line", () => {
    const text = costSection({ state: "measured", exit: 0, flagged: [], costLine: "cost: 3 calls", detail: "a\nb\n" });
    strictEqual(text, "exit: 0\na\nb\ncost: 3 calls\n");
  });

  it("cuts a measured detail at 60 lines", () => {
    const detail = Array.from({ length: 61 }, (_, i) => `line ${i + 1}`).join("\n");
    const lines = costSection({ state: "measured", exit: 2, flagged: ["x"], costLine: "cost: 9", detail }).split("\n");
    strictEqual(lines[0], "exit: 2");
    strictEqual(lines[60], "line 60");
    strictEqual(lines[61], "[cut at 60 lines]");
    strictEqual(lines[62], "cost: 9");
  });

  it("does not add the cut line at exactly 60 lines", () => {
    const detail = Array.from({ length: 60 }, (_, i) => `l${i}`).join("\n");
    const text = costSection({ state: "measured", exit: 0, flagged: [], costLine: "c", detail });
    strictEqual(text.includes("[cut at 60 lines]"), false);
  });
});
