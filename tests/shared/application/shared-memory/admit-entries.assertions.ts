// Checks on the entry files and the failures admitEntries leaves.
import { ok, strictEqual } from "node:assert";
import { parseEntry } from "../../../../src/shared/domain/shared-memory/front-matter.ts";
import type { MemoryEntry } from "../../../../src/shared/domain/shared-memory/entry.ts";

/** `text` parses as an entry whose fields hold the `expected` values. */
export function assertEntry(text: string | undefined, expected: Partial<MemoryEntry>): void {
  ok(text !== undefined, "no entry file");
  const parsed = parseEntry(text);
  ok(parsed.ok, `not an entry: ${parsed.ok ? "" : parsed.problems.join("; ")}`);
  for (const [key, value] of Object.entries(expected)) {
    strictEqual(parsed.entry[key as keyof MemoryEntry], value, `the entry's ${key}`);
  }
}

/** Each failure at index i mentions `fragments[i]`. */
export function assertFailures(failed: readonly string[], fragments: readonly string[]): void {
  fragments.forEach((fragment, i) => ok(failed[i]?.includes(fragment), `failure ${i} does not say "${fragment}": ${failed[i]}`));
}
