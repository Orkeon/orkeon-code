// Checks on what one main-loop turn sent the model, logged and answered.
import { ok } from "node:assert";

/** The prompt the model read ends with `tail`. */
export function assertPromptEndsWith(prompt: string, tail: string): void {
  ok(prompt.endsWith(tail), `the prompt does not end with the act prompt expected:\n${prompt}`);
}

/** `lines` hold `line` exactly. */
export function assertLogged(lines: readonly string[], line: string): void {
  ok(lines.includes(line), `no log line '${line}' in:\n${lines.join("\n")}`);
}

/** One of `lines` holds `fragment`. */
export function assertLoggedLike(lines: readonly string[], fragment: string): void {
  ok(lines.some((l) => l.includes(fragment)), `no log line holds '${fragment}': ${JSON.stringify(lines)}`);
}

/** The answer opens with the warning that the host's gate is off, and ends with `answer` after a blank line. */
export function assertGateWarningBefore(text: string, answer: string): void {
  ok(text.startsWith("⚠ the host's permission gate is off"), `no gate warning first: ${text}`);
  ok(text.endsWith(`\n\n${answer}`), `the answer does not follow the warning: ${text}`);
}
