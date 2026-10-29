// Checks on what runDevChange wrote and sent.
import { ok, strictEqual } from "node:assert";

/** At least one prompt, each ending with the precedents block `block`. */
export function assertEndWithPrecedents(prompts: readonly string[], block: string): void {
  ok(prompts.length >= 1, "no brief prompt");
  for (const p of prompts) ok(p.trimEnd().endsWith(block), p.slice(-300));
}

/** No prompt holds `part`. */
export function assertNoPromptMentions(prompts: readonly string[], part: string): void {
  for (const p of prompts) ok(!p.includes(part), `unexpected ${JSON.stringify(part)} in: ${p}`);
}

/** The run said the route on its first line, went on as a spec - `spec` written - and wrote no change brief. */
export function assertContinuedAsSpec(text: string, files: ReadonlyMap<string, string>, routeLine: string, spec: string, brief: string): void {
  strictEqual(text.split("\n")[0], routeLine, `the route is not said first: ${text}`);
  ok((files.get(spec) ?? "").startsWith("# "), `no spec written at ${spec}: ${text}`);
  strictEqual(files.has(brief), false, `a change brief was written at ${brief}`);
}
