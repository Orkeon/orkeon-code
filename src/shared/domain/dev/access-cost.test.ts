// Unit tests for the access cost: the report reader, the added lines, the measured cost, the section. Run:
//   node --test src/shared/domain/dev/access-cost.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import type { AccessCost } from "./access-cost.ts";
import {
  COST_NOT_WIRED, DEFAULT_RECEIVERS, addedLines, costLineOf, costSection, costSummary, measuredCost, notIndexed,
  nothingChanged, readAccessCostReport, receiversArgument, underRoots,
} from "./access-cost.ts";
import { assertMeasured, assertNotComputed } from "./access-cost.assertions.ts";
import {
  DEFAULT_RECEIVER_CASES, EMPTY_REPORT, FILES, NEW_FILE_DIFF, NO_PACK_REGEX, PLACE_DETAIL, QUIET_REPORT, ROOT_CASES,
  TWO_HUNKS, UNREADABLE_REPORTS, detailOf, fourteenCalls, raw, report,
} from "./access-cost.fixtures.ts";

describe("readAccessCostReport", () => {
  it("reads the members, their calls and filters, and the totals", () => {
    // Arrange
    const input = raw();

    // Act
    const r = readAccessCostReport(input);

    // Assert
    strictEqual(r?.members.length, 2);
    deepStrictEqual(r!.members[0].portCalls[1], { receiver: "this.repository", method: "save", line: 14, inLoop: true, inLambda: false });
    deepStrictEqual(r!.members[0].memoryFilters, [{ line: 22, method: "Where" }]);
    deepStrictEqual(r!.cost, { reads: 1, writes: 0, loops: 1, lambdas: 1, memoryFilters: 1 });
  });

  for (const c of UNREADABLE_REPORTS) {
    it(`refuses a report whose fields are missing or mistyped: ${c.name}`, () => {
      // Arrange
      const input = c.raw;

      // Act
      const r = readAccessCostReport(input);

      // Assert
      strictEqual(r, null);
    });
  }
});

describe("addedLines", () => {
  it("numbers the added lines of each hunk in the new file", () => {
    // Arrange
    const diff = TWO_HUNKS;

    // Act
    const added = addedLines(diff);

    // Assert
    deepStrictEqual([...(added ?? [])], [2, 3, 11]);
  });

  it("reads a new file's diff (--no-index) as all lines added", () => {
    // Arrange
    const diff = NEW_FILE_DIFF;

    // Act
    const added = addedLines(diff);

    // Assert
    deepStrictEqual([...(added ?? [])], [1, 2]);
  });

  it("reads a text without a hunk as unknown", () => {
    // Arrange
    const diff = "Binary files differ\n";

    // Act
    const added = addedLines(diff);

    // Assert
    strictEqual(added, null);
  });
});

describe("underRoots", () => {
  for (const c of ROOT_CASES) {
    it(`keeps the files under a root, every file without a root or with '.': ${JSON.stringify(c.roots)}`, () => {
      // Arrange
      const { roots } = c;

      // Act
      const kept = underRoots(FILES, roots);

      // Assert
      deepStrictEqual(kept, c.kept);
    });
  }
});

describe("receiversArgument", () => {
  for (const pack of NO_PACK_REGEX) {
    it(`leaves the runtime's default without the pack's regex: ${JSON.stringify(pack)}`, () => {
      // Arrange
      const regex = pack;

      // Act
      const argument = receiversArgument(regex);

      // Assert
      strictEqual(argument, undefined);
    });
  }

  it("adds the pack's regex to the default, case-insensitive (access-cost.py's meaning)", () => {
    // Arrange
    const regex = "_fs|_llm";

    // Act
    const argument = receiversArgument(regex);

    // Assert
    strictEqual(argument, `(?i)(?:${DEFAULT_RECEIVERS})|(?:_fs|_llm)`);
  });

  for (const c of DEFAULT_RECEIVER_CASES) {
    it(`the default takes ${c.receiver} for a port: ${c.port}`, () => {
      // Arrange
      const re = new RegExp(DEFAULT_RECEIVERS, "i");

      // Act
      const port = re.test(c.receiver);

      // Assert
      strictEqual(port, c.port);
    });
  }
});

describe("measuredCost", () => {
  it("flags a blocking call or filter on an added line, exit 2, and counts the reads and writes", () => {
    // Arrange
    const added = new Map([["/workspace/src/order.ts", new Set([14, 22])]]);

    // Act
    const cost = measuredCost(report(), added);

    // Assert
    assertMeasured(cost);
    strictEqual(cost.exit, 2);
    deepStrictEqual(cost.flagged, [
      "src/order.ts::OrderService::place L14 this.repository.save in a loop",
      "src/order.ts::OrderService::place L22 Where memory filter",
    ]);
    strictEqual(cost.costLine, "Cost: 1 read + 0 writes through ports outside loops; in a loop, a lambda or a memory filter: 2 - back to design");
    strictEqual(cost.detail, PLACE_DETAIL);
  });

  it("lists pre-existing blocking items without exit 2", () => {
    // Arrange
    const added = new Map([["/workspace/src/order.ts", new Set<number>()]]);

    // Act
    const cost = measuredCost(report(), added);

    // Assert
    assertMeasured(cost);
    strictEqual(cost.exit, 0);
    deepStrictEqual(cost.flagged, []);
    strictEqual(cost.costLine.endsWith("memory filter: none"), true);
  });

  it("counts every line of a file whose diff is not known as added", () => {
    // Arrange
    const added = new Map([["/workspace/src/order.ts", null]]);

    // Act
    const cost = measuredCost(report(), added);

    // Assert
    assertMeasured(cost);
    strictEqual(cost.flagged.length, 3);
  });

  it("counts every line of a file absent from the diffs as added", () => {
    // Arrange
    const added = new Map<string, Set<number> | null>();

    // Act
    const cost = measuredCost(report(), added);

    // Assert
    assertMeasured(cost);
    strictEqual(cost.flagged.length, 3);
  });

  it("says when no member awaits a port", () => {
    // Arrange
    const quiet = QUIET_REPORT;

    // Act
    const cost = measuredCost(quiet, new Map());

    // Assert
    assertMeasured(cost);
    strictEqual(cost.detail, "1 member, none awaits a port or filters in memory\n");
  });

  it("says when the index has no member of the changed files", () => {
    // Arrange
    const none = EMPTY_REPORT;

    // Act
    const cost = measuredCost(none, new Map());

    // Assert
    assertMeasured(cost);
    strictEqual(cost.detail, "no member of the changed files in the code index\n");
  });

  it("cuts a list after 12 items", () => {
    // Arrange
    const r = readAccessCostReport(fourteenCalls());

    // Act
    const cost = measuredCost(r!, new Map());

    // Assert
    assertMeasured(cost);
    strictEqual(cost.detail.split("\n")[1].endsWith("store.get L12 / … +2"), true);
  });
});

describe("the cost texts", () => {
  it("writes the Cost line of access-cost.py, singular and plural", () => {
    // Arrange
    const [reads, writes, blocking] = [2, 1, 0];

    // Act
    const line = costLineOf(reads, writes, blocking);

    // Assert
    strictEqual(line, "Cost: 2 reads + 1 write through ports outside loops; in a loop, a lambda or a memory filter: none");
  });

  it("says not indexed, with an empty index", () => {
    // Arrange
    const roots: string[] = [];

    // Act
    const empty = notIndexed(roots);

    // Assert
    assertNotComputed(empty);
    strictEqual(empty.reason.startsWith("not indexed — the code index is empty: run /analyze"), true);
  });

  it("says not indexed, with what the index holds", () => {
    // Arrange
    const roots = ["/src"];

    // Act
    const other = notIndexed(roots);

    // Assert
    assertNotComputed(other);
    strictEqual(other.reason.includes("holds /src, not /workspace"), true);
  });

  it("measures a batch without a file under the roots as nothing", () => {
    // Arrange
    const roots = ["src"];

    // Act
    const cost = nothingChanged(roots);

    // Assert
    deepStrictEqual(cost, {
      state: "measured", exit: 0, flagged: [], costLine: costLineOf(0, 0, 0), detail: "no changed file under src\n",
    });
  });

  it("prints the Cost line of a measured cost", () => {
    // Arrange
    const cost = nothingChanged([]);

    // Act
    const line = costSummary(cost);

    // Assert
    strictEqual(line, costLineOf(0, 0, 0));
  });

  it("prints why the cost is not computed", () => {
    // Arrange
    const cost = COST_NOT_WIRED;

    // Act
    const line = costSummary(cost);

    // Assert
    strictEqual(line, "Cost: not computed — the crew wires no code index; judge the Cost axis from the diff");
  });
});

describe("costSection", () => {
  it("says the cost is not computed, with the reason", () => {
    // Arrange
    const cost = COST_NOT_WIRED;

    // Act
    const text = costSection(cost);

    // Assert
    strictEqual(text, "not computed: the crew wires no code index; judge the Cost axis from the diff\n");
  });

  it("renders a measured cost: exit, detail, cost line", () => {
    // Arrange
    const cost: AccessCost = { state: "measured", exit: 0, flagged: [], costLine: "cost: 3 calls", detail: "a\nb\n" };

    // Act
    const text = costSection(cost);

    // Assert
    strictEqual(text, "exit: 0\na\nb\ncost: 3 calls\n");
  });

  it("cuts a measured detail at 60 lines", () => {
    // Arrange
    const detail = detailOf(61, (i) => `line ${i + 1}`);

    // Act
    const text = costSection({ state: "measured", exit: 2, flagged: ["x"], costLine: "cost: 9", detail });

    // Assert
    const lines = text.split("\n");
    strictEqual(lines[0], "exit: 2");
    strictEqual(lines[60], "line 60");
    strictEqual(lines[61], "[cut at 60 lines]");
    strictEqual(lines[62], "cost: 9");
  });

  it("does not add the cut line at exactly 60 lines", () => {
    // Arrange
    const detail = detailOf(60, (i) => `l${i}`);

    // Act
    const text = costSection({ state: "measured", exit: 0, flagged: [], costLine: "c", detail });

    // Assert
    strictEqual(text.includes("[cut at 60 lines]"), false);
  });
});
