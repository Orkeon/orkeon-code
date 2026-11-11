// Checks on what one main-loop turn sent the model, logged and answered.
import { deepStrictEqual, ok } from "node:assert";

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

/** A stored message is a [tools] trace that lists `line` among its calls. */
export function assertToolTraceMessage(content: string, line: string): void {
  ok(content.startsWith("[tools]"), `the message is no [tools] trace:\n${content}`);
  ok(content.split("\n").slice(1).includes(line), `the trace has no line '${line}':\n${content}`);
}

/** The suggestion was asked once, with the request and the attached path; in the context, the attached skill sits under
 *  the operator's heading and the suggested one after it, under the heading that says the operator did not attach it. */
export function assertSuggestedApart(context: string, asked: ReadonlyArray<{ request: string; attached: readonly string[] }>): void {
  deepStrictEqual(
    asked.map((a) => a.attached), [["/workspace/docs/attached.md"]],
    "the suggestion was not asked once, with the attached path",
  );
  const marks = ["## Attached skills", "ATTACHED BODY", "## Suggested skills", "the operator did not attach them", "SUGGESTED BODY"];
  const at = marks.map((mark) => context.indexOf(mark));
  ok(at.every((position, i) => position >= 0 && (i === 0 || position > at[i - 1])), `the context does not hold, in order, ${marks.join(" | ")}:\n${context.slice(0, 900)}`);
}
