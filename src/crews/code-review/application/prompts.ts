// Review-lens prompts + findings schema for code-review. Pure — no IO.

import type { Finding } from "../../../shared/domain/types.ts";
import type { ReviewLens } from "../domain/lenses.ts";

// The lens list and its `review.lenses` selection moved to ../domain/lenses.ts
// with B-9; re-exported so existing importers keep working.
export { LENSES, selectLenses, lensKeys, describeReviewPlan } from "../domain/lenses.ts";
export type { ReviewLens, LensSelection } from "../domain/lenses.ts";

/** JSON schema for the per-lens findings extraction. */
export const FINDINGS_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string" },   // blocker | high | medium | low | nit
          file: { type: "string" },
          line: { type: "number" },
          category: { type: "string" },
          finding: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
  },
};

/** How many already-found items a later pass is shown, so the prompt stays bounded. */
export const MAX_PRIOR_FINDINGS_IN_PROMPT = 25;

/**
 * Prompt for one review lens over the (truncated) diff.
 *
 * From pass 2 on (B-9 `/passes`), the prompt carries what the earlier passes
 * already found and asks for what they MISSED. Re-running the identical prompt
 * would mostly re-report the same items — dedup would collapse them and the
 * operator would have paid for three more LLM calls to change nothing.
 */
export function buildLensPrompt(
  lens: ReviewLens,
  diffSlice: string,
  pass = 1,
  priorFindings: readonly Finding[] = [],
): string {
  const head =
    `Review this diff through the ${lens.key} lens (${lens.instruction}). ` +
    "Return JSON findings with severity, file, line, category, finding, suggestion. " +
    "Be precise; no false positives.";

  if (pass <= 1 || priorFindings.length === 0) return `${head}\n\n${diffSlice}`;

  const already = priorFindings
    .slice(0, MAX_PRIOR_FINDINGS_IN_PROMPT)
    .map((f) => `- ${f.file}:${f.line ?? "?"} — ${f.finding ?? ""}`)
    .join("\n");

  return (
    `${head}\n\nThis is review pass ${pass}. These issues were already reported; do NOT repeat them, ` +
    `find what they missed. Returning an empty list is a valid answer.\n${already}\n\n${diffSlice}`
  );
}
