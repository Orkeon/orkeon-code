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

/** Stable dedup key: file + line + the first 40 chars of the finding text. */
export function findingDedupKey(f: Finding): string {
  return `${f.file}:${f.line}:${(f.finding ?? "").slice(0, 40)}`;
}

/**
 * Merge lens results, drop duplicates (by {@link findingDedupKey}), and sort by
 * severity. Each input group carries its lens so the kept finding records which
 * lens surfaced it. Order-stable for equal severities (sort is stable in V8).
 */
export function dedupAndRank(
  groups: ReadonlyArray<{ lens: string; findings: Finding[] }>,
): Finding[] {
  const seen = new Set<string>();
  const all: Finding[] = [];
  for (const g of groups) {
    for (const f of g.findings) {
      const key = findingDedupKey(f);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ ...f, lens: f.lens ?? g.lens });
    }
  }
  all.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return all;
}
