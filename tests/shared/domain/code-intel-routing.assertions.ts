// Checks of the code-intel routing text.
import { ok } from "node:assert";

/** `text` names, among `known` tools, only those of `given`. */
export function assertNamesOnlyGivenTools(text: string, given: readonly string[], known: readonly string[]): void {
  const foreign = known.filter((tool) => !given.includes(tool) && text.includes(`\`${tool}`));
  ok(foreign.length === 0, `the text names tools the agent lacks: ${foreign.join(", ")}\n${text}`);
}

/** `text` holds every one of `mentions` and none of `omits`. */
export function assertWording(text: string, mentions: readonly string[], omits: readonly string[]): void {
  for (const part of mentions) ok(text.includes(part), `the routing lacks ${JSON.stringify(part)}:\n${text}`);
  for (const part of omits) ok(!text.includes(part), `the routing holds ${JSON.stringify(part)}:\n${text}`);
}
