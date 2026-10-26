// Data of the contract tests: the sheet, the input a contract is made from, steps whose anchors the tests set, and
// the texts a brief carries.
import { readFileSync } from "node:fs";
import type { CarriedText } from "../../../../src/shared/domain/dev/carried-text.ts";
import { CARRIED_CONTRACT_CHARS, type ContractInput } from "../../../../src/crews/dev-implement/domain/contracts.ts";
import { type AnchorRef, type ImplementStep, parseImplementSheet } from "../../../../src/crews/dev-implement/domain/step-section.ts";

export const SHEET = parseImplementSheet(
  readFileSync(new URL("../../../fixtures/dev/plan/expected/PRUNE-PLAN-F1.md", import.meta.url), "utf8"),
);
export const LAYOUT = { tests: "tests", domain: "src/shared/domain", shared: [], buildOutputs: [] };

/** The input of the contracts of the sheet's step 2, `overrides` laid over it. */
export function contractInput(overrides: Partial<ContractInput> = {}): ContractInput {
  return {
    code: "prune", sheetPath: "workbench/prune/PRUNE-PLAN-F1.md", sheet: SHEET, step: SHEET.steps[1], layout: LAYOUT,
    testCommand: "node --test x", ...overrides,
  };
}

/** `step` anchored on the one test file `path`, in the state `state`, with no double nor production file. */
export function stepWithTestFile(step: ImplementStep, path: string, state: AnchorRef["state"]): ImplementStep {
  return { ...step, anchor: { testFiles: [{ path, state }], doubles: "", production: [] } };
}

/** `step` with one test file and one production file, both to create in the sheet. */
export function stepCreating(step: ImplementStep, test: string, production: string): ImplementStep {
  return {
    ...step,
    anchor: { testFiles: [{ path: test, state: "to create" }], doubles: "", production: [{ path: production, state: "to create" }] },
  };
}

/** Step 2 with a test file to create, a production file to create and one existing. */
export function stepWithStubs(): ImplementStep {
  return {
    ...SHEET.steps[1],
    anchor: { testFiles: [{ path: "tests/a.test.ts", state: "to create" }], doubles: "", production: [
      { path: "src/a.ts", state: "to create" }, { path: "src/b.ts", state: "existing" }] },
  };
}

/** The stub a RED wrote in `src/prune.ts`, carried whole. */
export const STUB_CARRIED: readonly CarriedText[] = [
  { title: "src/prune.ts", path: "src/prune.ts", text: "export function prune(): never {\n  throw new Error(\"not implemented\");\n}\n" },
];

/** A text of `path` twice the room a contract carries: cut, never whole. */
export function pastTheRoom(path: string): CarriedText[] {
  return [{ title: path, path, text: "x".repeat(CARRIED_CONTRACT_CHARS * 2) }];
}

/** The sheet and the test file, both carried whole. */
export const SHEET_AND_TEST_CARRIED: readonly CarriedText[] = [
  { title: "workbench/prune/PRUNE-PLAN-F1.md", path: "workbench/prune/PRUNE-PLAN-F1.md", text: "# PRUNE-PLAN-F1 — Prune\n## Design\n| Rounding | none |\n" },
  { title: "tests/prune.test.ts", path: "tests/prune.test.ts", text: "test('keeps', () => {});\n" },
];

/** A later step: the sheet still says the file is to create, the first step wrote it, the brief carries it. */
export function laterStep(): ImplementStep {
  return stepWithTestFile(SHEET.steps[1], "tests/prune.test.ts", "to create");
}

/** The section of a brief carrying the sheet and the test file. */
export const CARRIED_SECTION = "## In this brief (do not open these files again)\n### workbench/prune/PRUNE-PLAN-F1.md\n```text\n"
  + "# PRUNE-PLAN-F1 — Prune\n## Design\n| Rounding | none |\n```\n### tests/prune.test.ts\n```text\ntest('keeps', () => {});\n```";

/** What a RED contract says of the test file it carries. */
export const RED_CARRIED_SAYS: readonly string[] = [
  CARRIED_SECTION,
  "- test file: `tests/prune.test.ts` — existing — its text is in this brief (node_outline for the anchor at most): add the tests with node_insert inside its suite, never rewrite it whole",
  "every new test must fail; the result lists the failed tests, so the log stays closed.",
];

/** What a GREEN contract says of the test file it carries. */
export const GREEN_CARRIED_SAYS: readonly string[] = [
  "### tests/prune.test.ts\n```text\ntest('keeps', () => {});\n```",
  "Test file (read only, in this brief): `tests/prune.test.ts`.",
];

/** What the RED contract of step 2 says of the ids, the tests, the files and the rules. */
export const RED_SAYS: readonly string[] = [
  "Ids: BR-02.",
  "`keeps feedback entries older than the cut-off`",
  "`src/shared/domain/memory.ts:18` — `MemoryEntry` (read that member with node_read, never the file whole)",
  "Write test files only (under `tests`)",
  "file_read with offset and limit",
];

/** What both contracts say of an assumption. */
export const ASSUMPTION_SAYS: readonly string[] = [
  "only for a behaviour the plan leaves open",
  "A test value, a stub's wording or a file's state is your choice or a fact",
  "already holds, in any wording",
];

/** What the GREEN contract says of the red run, the cost and the tests. */
export const GREEN_SAYS: readonly string[] = [
  "not ok 1",
  "Expected access cost: 1 read + 1 write",
  "Never write a test file (under `tests`)",
  "`Cost: <reads> reads",
];

/** What a RED contract with stubs says of them. */
export const STUBS_SAY: readonly string[] = [
  "hold no logic, in `src/a.ts` (to create), `src/b.ts` (existing: only a declaration the new tests import and it lacks).",
  "- production it will drive (a signature stub at most): `src/b.ts` — existing",
  "A test whose import of a missing declaration fails the whole test file is not the red asked",
];
