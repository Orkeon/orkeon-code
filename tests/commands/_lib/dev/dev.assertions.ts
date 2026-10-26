// Checks on what /dev-status prints, the argument refusals of the dev commands and the paths /dev-learn writes.
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** The parse refused the line with `text`. */
export function assertRefusedWith(parsed: { ok: true } | { ok: false; text: string }, text: string): void {
  strictEqual(parsed.ok ? "(accepted)" : parsed.text, text, "the line was not refused with its own text");
}

/** No path written lies under the harness's .claude/ folder. */
export function assertNoHarnessWrite(paths: readonly string[]): void {
  ok(paths.every((p) => !p.startsWith(`${WORKSPACE}/.claude/`)), `a harness file was written: ${paths.join(", ")}`);
}

/** Every line is at most `max` characters long. */
export function assertLinesWithin(lines: readonly string[], max: number): void {
  for (const line of lines) ok(line.length <= max, `a line of ${line.length} characters, over ${max}: ${line}`);
}

/**
 * `line` is the codes line of 30 codes kept within `maxChars`: the first codes, each with its spec and plan, then how
 * many it left out, the two adding up to 30.
 */
export function assertCappedCodesLine(line: string, codes: readonly string[], maxChars: number): void {
  ok(line.length <= maxChars, `${line.length} characters`);
  const m = /^codes \(30\): (.*) · … (\d+) more$/.exec(line);
  ok(m !== null, `not a capped codes line: ${line}`);
  const shown = m[1].split(" · ");
  deepStrictEqual(shown, codes.slice(0, shown.length).map((c) => `${c} — spec, plan`), "the codes shown are not the first ones");
  strictEqual(shown.length + Number(m[2]), 30, "the codes shown and left out do not add up to 30");
}
