// Findings the review report is rendered from, for the renderReport tests.
import type { Finding } from "../../../../src/shared/domain/types.ts";

/** A style nit and a security blocker with a suggestion, grouped by lens. */
export const NIT_AND_BLOCKER: readonly { lens: string; findings: Finding[] }[] = [
  { lens: "style", findings: [{ severity: "nit", file: "a.ts", line: 2, finding: "naming" }] },
  { lens: "security", findings: [{ severity: "blocker", file: "b.ts", line: 9, finding: "sqli", suggestion: "use params" }] },
];

/** A finding with neither category nor line. */
export const BARE_FINDING: Finding = { severity: "low", file: "c.ts", finding: "x", lens: "correctness" };

/** A finding whose trigger lies outside the text the lens read. */
export const PLAUSIBLE_FINDING: Finding = {
  severity: "high", file: "d.ts", line: 4, category: "null-check", finding: "x may be null", confidence: "plausible",
};

/** A diff cut after 12 000 characters, 3 400 more not reviewed. */
export const CUT = { shown: 12_000, leftOut: 3_400 };
