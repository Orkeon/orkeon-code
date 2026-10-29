// Checks on the versions and the script directive of the crews.
import { deepStrictEqual, ok, strictEqual } from "node:assert";

/** At least one script, and each opens with `directive`. */
export function assertEveryScriptOpensWith(firstLines: ReadonlyMap<string, string>, directive: string): void {
  ok(firstLines.size > 0, "no .ork.ts under src/crews");
  for (const [file, line] of firstLines) strictEqual(line, directive, file);
}

/** No file calls any of the members: each entry of `calls` is empty. */
export function assertNoCall(calls: ReadonlyMap<string, readonly string[]>): void {
  for (const [member, files] of calls) deepStrictEqual(files, [], `.${member}( is called, which the pinned runtime does not ship`);
}
