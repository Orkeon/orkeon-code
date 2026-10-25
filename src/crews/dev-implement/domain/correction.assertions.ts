// Checks on a correction appended to a batch sheet.
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import type { CorrectionEdit } from "./correction.ts";
import { openSteps, parseImplementSheet } from "./step-section.ts";

/** `edit` appended the step `step` titled `title`. */
export function assertAppended(edit: CorrectionEdit, step: number, title: string): asserts edit is Extract<CorrectionEdit, { ok: true }> {
  ok(edit.ok, edit.ok ? "" : `the correction was refused: ${edit.reason}`);
  strictEqual(edit.step, step, `the correction is step ${edit.step}, not ${step}`);
  strictEqual(edit.title, title, "the correction's title");
}

/** `text` parses clean, its one open step is `step`, anchored on `testFiles` and testing `ids` first. */
export function assertOneOpenStep(text: string, step: number, testFiles: string[], ids: string[]): void {
  const sheet = parseImplementSheet(text);
  deepStrictEqual(sheet.problems, [], "the sheet has problems");
  const open = openSteps(sheet);
  deepStrictEqual(open.map((s) => s.number), [step], "the open steps");
  deepStrictEqual(open[0].anchor?.testFiles.map((r) => r.path), testFiles, "the open step's test files");
  deepStrictEqual(open[0].tests[0].ids, ids, "the open step's first test's ids");
}
