// Finding severity ordering + dedup/rank — pure, no IO. Extracted verbatim in
// behaviour from code-review/crew.ork.ts:68-77 so it can be unit-tested
// without a live LLM run.

import type { Finding } from "./types.ts";

/** Canonical severity ladder, most→least severe. */
export const SEVERITY_ORDER: Record<string, number> = {
  blocker: 0,
  high: 1,
  medium: 2,
  low: 3,
  nit: 4,
};

/** Rank a severity for sorting; unknown severities sort last (9). */
export function severityRank(severity: string | undefined): number {
  return SEVERITY_ORDER[String(severity ?? "").toLowerCase()] ?? 9;
}

/** How many characters of the claim the dedup key keeps. */
export const DEDUP_CLAIM_CHARS = 40;

/** Stable dedup key: file + line + category (lower-cased, empty when absent) + the
 *  start of the claim (the first {@link DEDUP_CLAIM_CHARS} characters of `finding`,
 *  trimmed and lower-cased). The claim opens a finding, so two faults of one lens on
 *  one line stay apart, while two lenses stating the same claim on it collapse. */
export function findingDedupKey(f: Finding): string {
  const claim = String(f.finding ?? "").trim().toLowerCase().slice(0, DEDUP_CLAIM_CHARS);
  return `${f.file}:${f.line}:${(f.category ?? "").toLowerCase()}:${claim}`;
}

/**
 * Merge lens results, drop duplicates (by {@link findingDedupKey}), and sort by
 * severity. On a collision the most severe finding is kept (the first on a tie),
 * so a blocker is never dropped behind a low on the same key. Each input group
 * carries its lens so the kept finding records which lens surfaced it.
 * Order-stable for equal severities (sort is stable in V8).
 */
export function dedupAndRank(
  groups: ReadonlyArray<{ lens: string; findings: Finding[] }>,
): Finding[] {
  const at = new Map<string, number>();
  const all: Finding[] = [];
  for (const g of groups) {
    for (const f of g.findings) {
      const key = findingDedupKey(f);
      const kept = { ...f, lens: f.lens ?? g.lens };
      const index = at.get(key);
      if (index === undefined) {
        at.set(key, all.length);
        all.push(kept);
      } else if (severityRank(kept.severity) < severityRank(all[index].severity)) {
        all[index] = kept;
      }
    }
  }
  all.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return all;
}
