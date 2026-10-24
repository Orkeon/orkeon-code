// What /dev-implement reads off a batch sheet. Run:
//   node --test src/crews/dev-implement/domain/step-section.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { anchorRefs, openSteps, parseImplementSheet } from "./step-section.ts";

const SHEET = readFileSync(new URL("../../../../tests/fixtures/dev/plan/expected/PRUNE-PLAN-F1.md", import.meta.url), "utf8");

describe("parseImplementSheet", () => {
  const sheet = parseImplementSheet(SHEET);

  it("reads the batch, its steps and their tests", () => {
    strictEqual(sheet.batch, "F1");
    strictEqual(sheet.prefix, "PRUNE");
    deepStrictEqual(sheet.steps.map((s) => s.number), [1, 2, 3, 4]);
    deepStrictEqual(sheet.steps[0].tests, [
      { name: "removes the entries saved before the cut-off", level: "unit", project: "src/shared/domain", ids: ["BR-01", "UC-01"] },
      { name: "refuses a cut-off in the future", level: "unit", project: "src/shared/domain", ids: ["BR-01"] },
    ]);
    strictEqual(sheet.steps[3].tdd, null);
    deepStrictEqual(sheet.problems, []);
  });

  it("reads each step's Anchors row", () => {
    deepStrictEqual(sheet.steps[1].anchor, {
      testFiles: [{ path: "src/shared/domain/memory-prune.test.ts", state: "to create" }],
      doubles: "",
      production: [
        { path: "src/shared/domain/memory-prune.ts", state: "to create" },
        { path: "src/shared/domain/memory.ts", line: 18, state: "member", member: "MemoryEntry" },
      ],
    });
    deepStrictEqual(sheet.steps[2].anchor?.testFiles, [{ path: "tests/commands-memory.test.ts", line: 12, state: "existing" }]);
    strictEqual(sheet.steps[2].anchor?.doubles, "`tests/support/fake-memory-store.ts:9` (`writes` to add)");
  });

  it("reads the batch's design rows, code elements and test policy", () => {
    strictEqual(sheet.accessCost, "1 read + 1 write, whatever the number of entries");
    strictEqual(sheet.appliedRules.startsWith("DDD-01, DDD-02"), true);
    strictEqual(sheet.codeElements[0], "**Domain**");
    strictEqual(sheet.testPolicy.startsWith("**Fast suite**"), true);
  });

  it("says when a behaviour step names no test file", () => {
    const broken = SHEET.replace("| 1 — An entry older than the cut-off is removed | `src/shared/domain/memory-prune.test.ts` — to create |", "| 1 — An entry older than the cut-off is removed | — |");
    deepStrictEqual(parseImplementSheet(broken).problems, ["step 1 names no test file in ## Anchors"]);
  });
});

describe("openSteps", () => {
  it("keeps the behaviour steps with a box open, and skips the done ones", () => {
    const text = SHEET.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [x] GREEN [x] COST [x]");
    deepStrictEqual(openSteps(parseImplementSheet(text)).map((s) => s.number), [2, 3]);
  });
});

describe("anchorRefs", () => {
  it("reads nothing from a dash, and a path with a member", () => {
    deepStrictEqual(anchorRefs("—"), []);
    deepStrictEqual(anchorRefs("`src/commands/_lib/memory.ts:40` — `runMemory`"), [
      { path: "src/commands/_lib/memory.ts", line: 40, state: "member", member: "runMemory" },
    ]);
  });
});
