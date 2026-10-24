// A correction appended to a batch sheet. Run:
//   node --test src/crews/dev-implement/domain/correction.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { addCorrection, cleanFinding, targetStep } from "./correction.ts";
import { openSteps, parseImplementSheet } from "./step-section.ts";

const TABLE = (name: string, id: string) =>
  ["| # | Test | Level | Project | Ids |", "|---|------|-------|---------|-----|", `| 1 | \`${name}\` | unit | \`tests\` | ${id} |`, ""];
const SHEET = [
  "# DEMO-PLAN-F1 — Demo", "",
  "## TDD sequence",
  "### Step 1 — One", ...TABLE("does one", "BR-01"), "TDD: RED [x] GREEN [x] COST [x]", "",
  "### Step 2 — Two", ...TABLE("does two", "BR-02"), "TDD: RED [x] GREEN [x] COST [x]", "",
  "### Step 3 — Build and tests", "No test of its own.", "",
  "## Anchors",
  "| Step | Test class / fixture | Shared doubles and builders | Production filled or created |",
  "|------|----------------------|-----------------------------|------------------------------|",
  "| 1 — One | `tests/a.test.ts` — to create | — | `src/a.ts` — to create |",
  "| 2 — Two | `tests/b.test.ts` — to create | `FakeClock` | `src/b.ts:12` — to create |",
  "| 3 — Build and tests | — | — | — |", "",
].join("\n");

describe("addCorrection", () => {
  it("appends a step after the last one, with the target's anchor row and an open TDD line", () => {
    const edit = addCorrection(SHEET, "Major Tests: src/a.ts ignores an empty list");
    ok(edit.ok);
    if (!edit.ok) return;
    strictEqual(edit.step, 4);
    strictEqual(edit.title, "Correction C1 — Major Tests: src/a.ts ignores an empty list");
    const sheet = parseImplementSheet(edit.text);
    deepStrictEqual(sheet.problems, []);
    const open = openSteps(sheet);
    deepStrictEqual(open.map((s) => s.number), [4]);
    deepStrictEqual(open[0].anchor?.testFiles.map((r) => r.path), ["tests/a.test.ts"]);
    deepStrictEqual(open[0].tests[0].ids, ["BR-01"]);
  });
  it("targets the step the finding names, keeps an open one, and numbers the next", () => {
    const first = addCorrection(SHEET, "step 2: the clock is read twice");
    ok(first.ok);
    if (!first.ok) return;
    const sheet = parseImplementSheet(first.text);
    strictEqual(sheet.steps.find((s) => s.number === 4)?.anchor?.doubles, "`FakeClock`");
    const again = addCorrection(first.text, "step 2: the clock is read twice");
    ok(again.ok && !again.appended && again.text === first.text);
    const ticked = first.text.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [x] GREEN [x] COST [x]");
    const second = addCorrection(ticked, "another gap");
    ok(second.ok && second.title === "Correction C2 — another gap" && second.step === 5);
  });
  it("refuses a finding naming an id the sheet does not carry, and an empty one", () => {
    const refused = addCorrection(SHEET, "BR-07 is not covered");
    strictEqual(refused.ok, false);
    ok(!refused.ok && refused.reason.includes("BR-07, which the sheet does not carry"));
    strictEqual(addCorrection(SHEET, "  ").ok, false);
  });
});

describe("targetStep / cleanFinding", () => {
  it("falls back on the last step with a test file", () => {
    strictEqual(targetStep(parseImplementSheet(SHEET), "something")?.number, 2);
    strictEqual(cleanFinding("a |\n b"), "a / b");
  });
});
