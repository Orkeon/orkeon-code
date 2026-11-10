// What the review lenses are shown, bounded: the diff cut to a cap with a note of what was left out, the findings
// of the earlier passes and the project's conventions cut to theirs, so a prompt cannot grow without limit.
import type { Finding } from "../../../shared/domain/types.ts";
import { diffCutNote } from "./prompts.ts";

/** How many already-found items a later pass is shown, so the prompt stays bounded. */
export const MAX_PRIOR_FINDINGS_IN_PROMPT = 25;

/** Characters of the project's instructions file shown to the style lens. */
export const MAX_CONVENTIONS_CHARS = 3_000;

/** The diff as the lenses read it: at most `max` characters, and a note saying how
 *  much was left out when it was cut, so a lens does not review what it cannot see. */
export function cutDiff(diff: string, max: number): string {
  if (diff.length <= max) return diff;
  return diff.slice(0, max) + diffCutNote(max, diff.length - max);
}

/** The findings of the earlier passes a later pass is shown: the first MAX_PRIOR_FINDINGS_IN_PROMPT. */
export const priorFindingsShown = (findings: readonly Finding[]): readonly Finding[] =>
  findings.slice(0, MAX_PRIOR_FINDINGS_IN_PROMPT);

/** The project's conventions as the style lens reads them: trimmed, at most MAX_CONVENTIONS_CHARS. */
export const conventionsShown = (conventions: string): string => conventions.trim().slice(0, MAX_CONVENTIONS_CHARS);
