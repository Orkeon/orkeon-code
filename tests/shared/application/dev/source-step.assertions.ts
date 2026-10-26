// Checks on what codeFolder and readRequest return: a folder or a text where a refusal would be wrong.
import { deepStrictEqual, fail, strictEqual } from "node:assert";

import type { CodeFolder } from "../../../../src/shared/application/dev/source-step.ts";

/** `result` is a folder, not a refusal; the folder. */
export function folderOf(result: CodeFolder | { refused: string }): CodeFolder {
  if ("refused" in result) fail(`refused where a folder was expected: ${result.refused}`);
  return result;
}

/** `result` is a folder holding `names`, in order. */
export function assertNames(result: CodeFolder | { refused: string }, names: readonly string[]): void {
  deepStrictEqual(folderOf(result).names, names, "not the names expected");
}

/** `read` is a text of `length` characters, not a refusal. */
export function assertTextLength(read: { text: string; from: string } | { refused: string }, length: number): void {
  if ("refused" in read) fail(`refused where a text was expected: ${read.refused}`);
  strictEqual(read.text.length, length, "the text is not cut where expected");
}
