// Diffs and findings for the review-step tests.
import type { Finding } from "../../../../src/shared/domain/types.ts";

/** The cap the diff choice is tested at. */
export const CAP = 20;

/** The plain diff, under the cap. */
export const PLAIN = "diff --git a/x.ts\n+x";

/** A diff of `length` characters. */
const diffOf = (length: number): string => "diff --git a/x.ts\n".padEnd(length, "+");

/** Which diff the lenses read for each function-context diff: it wins when it is there and holds within the cap. */
export const DIFF_CHOICES: readonly { name: string; withFunctionContext: string; diff: string; functionContext: boolean }[] = [
  { name: "takes the plain diff when the function-context diff is empty", withFunctionContext: "", diff: PLAIN, functionContext: false },
  { name: "takes the function-context diff at exactly the cap", withFunctionContext: diffOf(CAP), diff: diffOf(CAP), functionContext: true },
  { name: "takes the plain diff when the function-context diff is one character over the cap", withFunctionContext: diffOf(CAP + 1), diff: PLAIN, functionContext: false },
];

/** A style finding ranked high, above the style lens's ceiling. */
export const STYLE_HIGH: Finding = { severity: "high", file: "x.ts", line: 2, finding: "misleading name" };
