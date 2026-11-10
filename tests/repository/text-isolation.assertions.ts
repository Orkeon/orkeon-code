// The checks of the text-isolation guard over the whole of src/.
import { deepStrictEqual } from "node:assert";
import type { TextException } from "./text-isolation.ts";

/** No logic file holds prose that no exception allows: each line names a literal to move. */
export function assertNoProse(problems: readonly string[]): void {
  deepStrictEqual(problems.map((p) => `${p}: move the text to prompts.ts, messages.ts or markers.ts`), []);
}

/** No text file holds logic that no exception allows: each line names a construct to move to a logic module. */
export function assertNoLogic(problems: readonly string[]): void {
  deepStrictEqual(problems.map((p) => `${p}: a text file holds constants and template functions only, move it to a logic module`), []);
}

/** No exception is left that matches nothing: one that does must be removed. */
export function assertNoStaleException(unused: readonly TextException[]): void {
  deepStrictEqual(unused.map((e) => `${e.file} ${e.name}: matches no literal any more, remove it`), []);
}
