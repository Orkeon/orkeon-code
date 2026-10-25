// Findings and rank pairs for the severity tests.
import type { Finding } from "./types.ts";

/** A finding with defaults, `over` replacing any of them. */
export const f = (over: Partial<Finding>): Finding => ({
  severity: "low", file: "a.ts", line: 1, finding: "x", ...over,
});

/** Pairs of severities, the first ranked before the second. */
export const RANK_ORDER: readonly { readonly first: string; readonly second: string }[] = [
  { first: "blocker", second: "high" },
  { first: "low", second: "nit" },
];

/** Three lenses, the third surfacing the very finding of the first. */
export const LENSES_WITH_DUPLICATE = [
  { lens: "style", findings: [f({ severity: "nit", finding: "naming" })] },
  { lens: "security", findings: [f({ severity: "blocker", file: "b.ts", finding: "sqli" })] },
  { lens: "correctness", findings: [f({ severity: "nit", finding: "naming" })] }, // dup of #1
];
