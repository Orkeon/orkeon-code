// What /dev-implement reads off a batch sheet. Run:
//   node --test tests/crews/dev-implement/domain/step-section.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { anchorRefs, openSteps, parseImplementSheet } from "../../../../src/crews/dev-implement/domain/step-section.ts";
import { SHEET, SHEET_STEP_1_DONE, SHEET_STEP_1_WITHOUT_TEST_FILE, STEP_1_TESTS, STEP_2_ANCHOR } from "./step-section.fixtures.ts";

describe("parseImplementSheet", () => {
  it("reads the batch, its steps and their tests", () => {
    // Arrange
    const text = SHEET;

    // Act
    const sheet = parseImplementSheet(text);

    // Assert
    strictEqual(sheet.batch, "F1");
    strictEqual(sheet.prefix, "PRUNE");
    deepStrictEqual(sheet.steps.map((s) => s.number), [1, 2, 3, 4]);
    deepStrictEqual(sheet.steps[0].tests, STEP_1_TESTS);
    strictEqual(sheet.steps[3].tdd, null);
    deepStrictEqual(sheet.problems, []);
  });

  it("reads each step's Anchors row", () => {
    // Arrange
    const text = SHEET;

    // Act
    const sheet = parseImplementSheet(text);

    // Assert
    deepStrictEqual(sheet.steps[1].anchor, STEP_2_ANCHOR);
    deepStrictEqual(sheet.steps[2].anchor?.testFiles, [{ path: "tests/commands-memory.test.ts", line: 12, state: "existing" }]);
    strictEqual(sheet.steps[2].anchor?.doubles, "`tests/support/fake-memory-store.ts:9` (`writes` to add)");
  });

  it("reads the batch's design rows, code elements and test policy", () => {
    // Arrange
    const text = SHEET;

    // Act
    const sheet = parseImplementSheet(text);

    // Assert
    strictEqual(sheet.accessCost, "1 read + 1 write, whatever the number of entries");
    strictEqual(sheet.appliedRules.startsWith("DDD-01, DDD-02"), true);
    strictEqual(sheet.codeElements[0], "**Domain**");
    strictEqual(sheet.testPolicy.startsWith("**Fast suite**"), true);
  });

  it("says when a behaviour step names no test file", () => {
    // Arrange
    const broken = SHEET_STEP_1_WITHOUT_TEST_FILE;

    // Act
    const sheet = parseImplementSheet(broken);

    // Assert
    deepStrictEqual(sheet.problems, ["step 1 names no test file in ## Anchors"]);
  });
});

describe("openSteps", () => {
  it("keeps the behaviour steps with a box open, and skips the done ones", () => {
    // Arrange
    const sheet = parseImplementSheet(SHEET_STEP_1_DONE);

    // Act
    const open = openSteps(sheet);

    // Assert
    deepStrictEqual(open.map((s) => s.number), [2, 3]);
  });
});

describe("anchorRefs", () => {
  it("reads nothing from a dash", () => {
    // Arrange
    const cell = "—";

    // Act
    const refs = anchorRefs(cell);

    // Assert
    deepStrictEqual(refs, []);
  });

  it("reads a path with a member", () => {
    // Arrange
    const cell = "`src/commands/_lib/memory.ts:40` — `runMemory`";

    // Act
    const refs = anchorRefs(cell);

    // Assert
    deepStrictEqual(refs, [{ path: "src/commands/_lib/memory.ts", line: 40, state: "member", member: "runMemory" }]);
  });
});
