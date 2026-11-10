// Findings the review-lens prompt is built with, for the buildLensPrompt tests.
import type { Finding } from "../../../../src/shared/domain/types.ts";

/** Two findings of earlier passes: one with a line, one without. */
export const PRIOR_FINDINGS: readonly Finding[] = [
  { lens: "correctness", severity: "high", file: "a.ts", line: 12, finding: "off-by-one" },
  { lens: "security", severity: "low", file: "b.ts", finding: "unvalidated input" },
];

/** The lenses held to a bar of their own, not the correctness lens's input-or-state one. */
export const OWN_BAR_LENSES: readonly string[] = ["security", "style"];

/** Where a later pass is pointed: each must appear in a pass-2 prompt. */
export const LATER_PASS_MARKERS: readonly string[] = [
  "A first pass tends to skip",
  "the deleted lines",
  "the error and early-return paths",
  "the boundaries",
  "the later hunks of a long file",
];

/** The rule that keeps a finding whose trigger the diff does not show, marked plausible. */
export const PLAUSIBLE_RULE_MARKERS: readonly string[] = [
  "When what that asks for (the input, the caller) lies outside the shown text",
  "still report the finding as plausible",
  "name the file, caller or check that would confirm it",
  "it is shown when the diff itself shows it",
  "A suspicion with neither a shown trigger nor a check that would confirm it is not a finding",
];

/** The style lens's rule: a finding quotes what it breaks, or there is none. */
export const NEVER_PLAUSIBLE_MARKERS: readonly string[] = [
  "Such a finding is never plausible",
  "when the convention or the neighbouring code it breaks is not in the text shown to you, there is no finding",
  "- confidence: shown;",
];

/** What the style lens's prompt must not carry: the plausible way out of its bar. */
export const PLAUSIBLE_WAY_OUT: readonly string[] = ["still report the finding as plausible", "shown or plausible"];
