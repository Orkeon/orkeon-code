// Checks on what the dev crews' ports send the model under a working root.
import { ok } from "node:assert";

/** What the llm was asked, its prompts and system texts: they name no /workspace path outside the root prune-F2. */
export function assertRootPathsOnly(asked: ReadonlyArray<{ prompt: unknown; options?: { system?: unknown } }>): void {
  const text = JSON.stringify(asked.map((a) => [a.prompt, a.options?.system]));
  ok(!/\/workspace\/(?!\.orkeon\/worktrees\/prune-F2)/.test(text), `a /workspace path outside the root: ${text}`);
  ok(!/\/workspace["\s.]/.test(text), `the bare /workspace named: ${text}`);
}

/** What the llm was asked names `path`. */
export function assertAskedNames(asked: ReadonlyArray<{ prompt: unknown; options?: { system?: unknown } }>, path: string): void {
  const text = JSON.stringify(asked.map((a) => [a.prompt, a.options?.system]));
  ok(text.includes(path), `${path} is not named: ${text}`);
}
