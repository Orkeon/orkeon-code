// Checks on what the evidence step sent the model.
import { ok } from "node:assert";

/** The prompt of a second extract holds `part`. */
export function assertSecondPromptMentions(prompts: readonly { prompt: string }[], part: string): void {
  const second = prompts[1]?.prompt;
  ok(second !== undefined, "no second extract");
  ok(second.includes(part), `no ${JSON.stringify(part)} in the second prompt:\n${second}`);
}
