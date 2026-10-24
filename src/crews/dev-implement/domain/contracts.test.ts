// The RED and GREEN briefs made by code. Run:
//   node --test src/crews/dev-implement/domain/contracts.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { classOf, greenContract, redContract, stubsOf, testCommandFor } from "./contracts.ts";
import { NODE_EDIT_RULE, NODE_READ_RULE } from "../../../shared/domain/dev/reading-rule.ts";
import { parseImplementSheet } from "./step-section.ts";

const SHEET = parseImplementSheet(
  readFileSync(new URL("../../../../tests/fixtures/dev/plan/expected/PRUNE-PLAN-F1.md", import.meta.url), "utf8"),
);
const LAYOUT = { tests: "tests", domain: "src/shared/domain", shared: [], buildOutputs: [] };

describe("testCommandFor", () => {
  it("fills test_class with the test file for a script, its base name for C#", () => {
    deepStrictEqual(testCommandFor({ testClass: "node --test <Class>" }, SHEET.steps[0]),
      { ok: true, command: "node --test src/shared/domain/memory-prune.test.ts" });
    strictEqual(classOf("tests/Unit/PruneTests.cs"), "PruneTests");
  });

  it("fills the project and the class of a .NET template", () => {
    const step = { ...SHEET.steps[0], anchor: { testFiles: [{ path: "tests/Unit/PruneTests.cs", state: "to create" as const }], doubles: "", production: [] } };
    deepStrictEqual(testCommandFor({ testClass: "dotnet test <test project> --no-build --filter FullyQualifiedName~<Class>" }, step),
      { ok: true, command: "dotnet test src/shared/domain --no-build --filter FullyQualifiedName~PruneTests" });
  });

  it("falls back on test_project, and refuses a pack with neither", () => {
    deepStrictEqual(testCommandFor({ testProject: "dotnet test <test project>" }, SHEET.steps[0]),
      { ok: true, command: "dotnet test src/shared/domain" });
    strictEqual(testCommandFor({ test: "npm test" }, SHEET.steps[0]).ok, false);
  });
});

describe("redContract / greenContract", () => {
  const input = { code: "prune", sheetPath: "workbench/prune/PRUNE-PLAN-F1.md", sheet: SHEET, step: SHEET.steps[1], layout: LAYOUT, testCommand: "node --test x" };

  it("names the ids, the tests, the files and the rules of the test author", () => {
    const red = redContract(input);
    ok(red.includes("Ids: BR-02."));
    ok(red.includes("`keeps feedback entries older than the cut-off`"));
    ok(red.includes("`src/shared/domain/memory.ts:18` — `MemoryEntry` (read that member with node_read, never the file whole)"));
    ok(red.includes("Write test files only (under `tests`)"));
    ok(red.includes("file_read with offset and limit"));
  });

  it("asks both roles to read and edit by node, file_write for a new file only", () => {
    const red = redContract(input);
    const green = greenContract(input, { tail: "", log: null });
    for (const text of [red, green]) {
      ok(text.includes(`- ${NODE_READ_RULE}`), "node read rule");
      ok(text.includes(`- ${NODE_EDIT_RULE}`), "node edit rule");
      ok(!text.includes("never by writing it whole with file_write"), "the old editing rule is gone");
    }
    const kept = { ...SHEET.steps[1], anchor: { testFiles: [{ path: "tests/old.test.ts", state: "existing" as const }], doubles: "", production: [] } };
    ok(redContract({ ...input, step: kept }).includes("add the tests with node_insert inside its suite, never rewrite it whole"));
    const fresh = { ...SHEET.steps[1], anchor: { testFiles: [{ path: "tests/new.test.ts", state: "to create" as const }], doubles: "", production: [] } };
    ok(redContract({ ...input, step: fresh }).includes("`tests/new.test.ts` — to create — create it with file_write; once it exists, add to it by node"));
  });

  it("gives the implementer the red run, the elements, the expected cost and the Cost line to answer", () => {
    const green = greenContract(input, { tail: "not ok 1", log: "/workspace/workbench/prune/logs/x.log" });
    ok(green.includes("not ok 1"));
    ok(green.includes("Expected access cost: 1 read + 1 write"));
    ok(green.includes("Never write a test file (under `tests`)"));
    ok(green.includes("`Cost: <reads> reads"));
  });

  it("lets the test author stub the files the step creates, and no other", () => {
    const step = {
      ...SHEET.steps[1],
      anchor: { testFiles: [{ path: "tests/a.test.ts", state: "to create" as const }], doubles: "", production: [
        { path: "src/a.ts", state: "to create" as const }, { path: "src/b.ts", state: "existing" as const }] },
    };
    deepStrictEqual(stubsOf(step), ["src/a.ts"]);
    const red = redContract({ ...input, step });
    ok(red.includes("signature stubs in `src/a.ts`"));
    ok(red.includes("- production it will drive (read only, never write): `src/b.ts` — existing"));
  });

  it("names the test files beside the code, a correction's finding, and every step of a cycle", () => {
    const layout = { ...LAYOUT, tests: undefined, testFiles: ["src/*.test.ts"] };
    ok(redContract({ ...input, layout }).includes("Write test files only (`src/*.test.ts`)"));
    const correction = { ...SHEET.steps[1], title: "Correction C1 — the cut-off is inclusive" };
    ok(redContract({ ...input, step: correction }).includes("A correction (C1) of an audit's finding: the cut-off is inclusive"));
    const green = greenContract({ ...input, step: SHEET.steps[0], cycle: [SHEET.steps[0], SHEET.steps[1]] }, { tail: "", log: null });
    ok(green.includes("steps 1, 2 (one behaviour)"));
    ok(green.includes(`Step 2 — ${SHEET.steps[1].title}:`));
  });
});
