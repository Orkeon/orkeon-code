// Findings the review-lens prompt is built with, for the buildLensPrompt tests.
import type { Finding } from "../../../../src/shared/domain/types.ts";

/** Two findings of earlier passes: one with a line, one without. */
export const PRIOR_FINDINGS: readonly Finding[] = [
  { lens: "correctness", severity: "high", file: "a.ts", line: 12, finding: "off-by-one" },
  { lens: "security", severity: "low", file: "b.ts", finding: "unvalidated input" },
];

/** `count` prior findings, file `f<i>.ts` at line `i`. */
export function manyPriorFindings(count: number): Finding[] {
  return Array.from({ length: count }, (_, i) => ({ severity: "low", file: `f${i}.ts`, line: i, finding: `x${i}` }));
}
