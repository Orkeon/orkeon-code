// Checks on what pushCandidate writes and answers.
import { deepStrictEqual, ok } from "node:assert";
import { parseEntry } from "../../../../src/shared/domain/shared-memory/front-matter.ts";
import type { MemoryEntry } from "../../../../src/shared/domain/shared-memory/entry.ts";
import type { PushOutcome } from "../../../../src/shared/application/shared-memory/push-candidate.ts";

/** `text` parses as an entry whose fields hold the `expected` values. */
export function assertEntry(text: string | undefined, expected: Partial<MemoryEntry>): void {
  const parsed = parseEntry(text ?? "");
  ok(parsed.ok, `not an entry: ${parsed.ok ? "" : parsed.problems.join("; ")}`);
  for (const [key, value] of Object.entries(expected)) deepStrictEqual(parsed.entry[key as keyof MemoryEntry], value, `the entry's ${key}`);
}

/** The push was refused with a reason that says `says`. */
export function assertRefused(out: PushOutcome, says: string): void {
  ok(!out.ok, `pushed, not refused: ${JSON.stringify(out)}`);
  ok(out.refused.includes(says), `the refusal does not say "${says}": ${out.refused}`);
}
