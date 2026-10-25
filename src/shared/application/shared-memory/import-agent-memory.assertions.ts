// Checks on the candidate files and the report importAgentMemory leaves.
import { ok, strictEqual } from "node:assert";
import { parseEntry } from "../../domain/shared-memory/front-matter.ts";
import type { MemoryEntry } from "../../domain/shared-memory/entry.ts";

/** `text` parses as an entry whose fields hold the `expected` values. */
export function assertEntry(text: string | undefined, expected: Partial<MemoryEntry>, label = "the entry"): void {
  const parsed = parseEntry(text ?? "");
  ok(parsed.ok, `${label} is not an entry: ${parsed.ok ? "" : parsed.problems.join("; ")}`);
  for (const [key, value] of Object.entries(expected)) strictEqual(parsed.entry[key as keyof MemoryEntry], value, `${label}: ${key}`);
}
