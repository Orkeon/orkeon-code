// Checks on what runInitVerifiers sent to the model.
import { ok } from "node:assert";

import { assertMentions } from "../../../support/assertions/text.ts";

/** At least one skill was asked for, and every skill prompt carries each of `parts`. */
export function assertEverySkillMentions(completes: readonly { prompt: string }[], parts: readonly string[]): void {
  ok(completes.length > 0, "no skill prompt was sent");
  for (const c of completes) assertMentions(c.prompt, parts);
}
