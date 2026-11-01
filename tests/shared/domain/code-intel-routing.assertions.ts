// Checks of the code-intel routing text.
import { ok } from "node:assert";

/** `text` names, among `known` tools, only those of `given`. */
export function assertNamesOnlyGivenTools(text: string, given: readonly string[], known: readonly string[]): void {
  const foreign = known.filter((tool) => !given.includes(tool) && text.includes(`\`${tool}`));
  ok(foreign.length === 0, `the text names tools the agent lacks: ${foreign.join(", ")}\n${text}`);
}
