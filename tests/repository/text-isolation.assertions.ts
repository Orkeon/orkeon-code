// The checks of the text-isolation guard over the whole of src/.
import { deepStrictEqual } from "node:assert";
import type { TextException } from "./text-isolation.ts";

/** Every file holds no more prose literals than its baseline allows, and a file absent from the baseline none. */
export function assertWithinBaseline(counts: Readonly<Record<string, number>>, baseline: Readonly<Record<string, number>>): void {
  const over = Object.entries(counts)
    .filter(([file, n]) => n > (baseline[file] ?? 0))
    .map(([file, n]) => `${file}: ${n} prose literal(s), baseline ${baseline[file] ?? 0}: move the text to prompts.ts, messages.ts or markers.ts`);
  deepStrictEqual(over, []);
}

/** No exception is left that matches nothing: one that does must be removed. */
export function assertNoStaleException(unused: readonly TextException[]): void {
  deepStrictEqual(unused.map((e) => `${e.file} ${e.name}: matches no literal any more, remove it`), []);
}
