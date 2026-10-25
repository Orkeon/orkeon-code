// Checks on the roles' tools and prompts.
import { ok } from "node:assert";

/** `text` holds every one of `parts`. */
export function assertMentions(text: string, parts: readonly string[], what: string): void {
  for (const part of parts) ok(text.includes(part), `${what} does not mention ${JSON.stringify(part)}`);
}

/** `tools` holds every one of `expected`. */
export function assertHoldsTools(tools: readonly string[], expected: readonly string[], what: string): void {
  for (const tool of expected) ok(tools.includes(tool), `${what}: ${tool} missing`);
}
