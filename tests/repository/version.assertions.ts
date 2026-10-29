// Checks on the script directive of the crews.
import { ok, strictEqual } from "node:assert";

/** At least one script, and each opens with `directive`. */
export function assertEveryScriptOpensWith(firstLines: ReadonlyMap<string, string>, directive: string): void {
  ok(firstLines.size > 0, "no .ork.ts under src/crews");
  for (const [file, line] of firstLines) strictEqual(line, directive, file);
}
