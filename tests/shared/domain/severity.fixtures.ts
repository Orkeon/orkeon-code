// Findings and rank pairs for the severity tests.
import type { Finding } from "../../../src/shared/domain/types.ts";

/** A finding with defaults, `over` replacing any of them. */
export const f = (over: Partial<Finding>): Finding => ({
  severity: "low", file: "a.ts", line: 1, finding: "x", ...over,
});

/** Pairs of severities, the first ranked before the second. */
export const RANK_ORDER: readonly { readonly first: string; readonly second: string }[] = [
  { first: "blocker", second: "high" },
  { first: "low", second: "nit" },
];

/** Three lenses, the third giving the category and claim of the first. */
export const LENSES_WITH_DUPLICATE = [
  { lens: "style", findings: [f({ severity: "nit", category: "naming", finding: "naming" })] },
  { lens: "security", findings: [f({ severity: "blocker", category: "injection", file: "b.ts", finding: "sqli" })] },
  { lens: "correctness", findings: [f({ severity: "nit", category: "Naming", finding: "naming" })] }, // dup of #1
];

/** The opening a claim shares with another, longer than the dedup key keeps of it. */
const SHARED_OPENING = "`q(x)` builds its SQL from the request body";

/** A low then a blocker on one file, line, category and claim opening: the blocker must be the one kept. */
export const LOW_THEN_BLOCKER_ON_ONE_KEY = [
  { lens: "correctness", findings: [f({ severity: "low", category: "injection", finding: `${SHARED_OPENING}, which reads oddly` })] },
  { lens: "security", findings: [f({ severity: "blocker", category: "Injection", finding: `${SHARED_OPENING} and runs user SQL` })] },
];

/** Two findings of one severity on one key, from two lenses: the first must be the one kept. */
export const TIE_ON_ONE_KEY = [
  { lens: "correctness", findings: [f({ severity: "high", category: "injection", finding: `${SHARED_OPENING}, first` })] },
  { lens: "security", findings: [f({ severity: "high", category: "injection", finding: `${SHARED_OPENING}, second` })] },
];

/** A plausible then a shown finding of one severity on one key: the shown one must be kept. */
export const PLAUSIBLE_THEN_SHOWN_ON_ONE_KEY = [
  { lens: "correctness", findings: [f({ severity: "high", category: "injection", confidence: "plausible", finding: `${SHARED_OPENING}, first` })] },
  { lens: "correctness", findings: [f({ severity: "high", category: "injection", confidence: "shown", finding: `${SHARED_OPENING}, second` })] },
];

/** Two findings of one lens and one category on one line, with two different claims. */
export const TWO_CLAIMS_ON_ONE_LINE = [
  { lens: "correctness", findings: [
    f({ category: "null-check", finding: "`user` is read before the guard on line 3" }),
    f({ category: "null-check", finding: "`order.items` may be undefined when empty" }),
  ] },
];

/** Two findings on one file and line, of two categories. */
export const TWO_CATEGORIES_ON_ONE_LINE = [
  { lens: "correctness", findings: [f({ category: "null-check" })] },
  { lens: "security", findings: [f({ category: "injection" })] },
];
