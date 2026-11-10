// Findings and texts the review lenses are shown, bounded, for the lens-material tests.
import type { Finding } from "../../../../src/shared/domain/types.ts";

/** `count` prior findings, file `f<i>.ts` at line `i`. */
export function manyPriorFindings(count: number): Finding[] {
  return Array.from({ length: count }, (_, i) => ({ severity: "low", file: `f${i}.ts`, line: i, finding: `x${i}` }));
}
