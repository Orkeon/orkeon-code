// Checks on what runDevPlan writes and answers.
import { ok, strictEqual } from "node:assert";

import type { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { CODE, GOLDEN, fixture } from "./run-dev-plan.fixtures.ts";

/** Every case: nothing written under .claude/, nothing outside the code folder. */
export function assertGuarded(files: FakeFiles): void {
  for (const w of files.writes) {
    ok(!w.path.startsWith("/workspace/.claude/"), w.path);
    ok(w.path.startsWith(`${CODE}/`), w.path);
  }
}

/** The plan and its sheets hold the golden renders, byte for byte. */
export function assertGoldenRenders(files: FakeFiles): void {
  for (const [path, name] of GOLDEN) strictEqual(files.files.get(path), fixture(`expected/${name}`), name);
}

/** `text` holds every part of `parts`, word for word. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `lacks ${JSON.stringify(part)} in:\n${text}`);
}

/** Each folder of `folders` was listed once exactly. */
export function assertListedOnce(listed: readonly string[], folders: readonly string[]): void {
  for (const folder of folders) strictEqual(listed.filter((p) => p === folder).length, 1, folder);
}
