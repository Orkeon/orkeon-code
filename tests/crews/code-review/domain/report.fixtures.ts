// Findings the review report is rendered from, for the renderReport tests.
import type { Finding } from "../../../../src/shared/domain/types.ts";

/** A style nit and a security blocker with a suggestion, grouped by lens. */
export const NIT_AND_BLOCKER: readonly { lens: string; findings: Finding[] }[] = [
  { lens: "style", findings: [{ severity: "nit", file: "a.ts", line: 2, finding: "naming" }] },
  { lens: "security", findings: [{ severity: "blocker", file: "b.ts", line: 9, finding: "sqli", suggestion: "use params" }] },
];

/** A finding with neither category nor line. */
export const BARE_FINDING: Finding = { severity: "low", file: "c.ts", finding: "x", lens: "correctness" };
