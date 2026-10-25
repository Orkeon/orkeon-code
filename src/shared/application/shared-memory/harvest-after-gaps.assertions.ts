// Checks on what harvestAfterGaps says and writes.
import { ok } from "node:assert";

/** `line` names the one mistake candidate harvested and hands the decision to /memory-admit. */
export function assertOneCandidateLine(line: string): void {
  ok(line.startsWith("shared memory: 1 mistake candidate harvested from the audits ("), line);
  ok(line.endsWith("→ /memory-admit decides each one."), line);
}

/** Every write landed under `folder`. */
export function assertWritesUnder(writes: ReadonlyArray<{ path: string }>, folder: string): void {
  for (const w of writes) ok(w.path.startsWith(`${folder}/`), `written outside ${folder}: ${w.path}`);
}
