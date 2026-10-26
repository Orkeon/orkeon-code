// The checks of the /commit use case tests: where the run stopped, and what it committed.
import { ok, strictEqual } from "node:assert";

import type { World } from "./run-git-commit.fixtures.ts";
import { COMMIT } from "./run-git-commit.fixtures.ts";

/** The answer starts with `start`, and the model was never asked for a draft. */
export function assertStoppedBeforeDraft(answer: string, w: World, start: string): void {
  ok(answer.startsWith(start), `the answer does not start with ${JSON.stringify(start)}:\n${answer}`);
  strictEqual(w.llm.completes.length, 0, "the model was asked for a draft before the stop");
}

/** The answer is `expected`, and no git commit ran. */
export function assertNotCommitted(answer: string, w: World, expected: string): void {
  strictEqual(answer, expected);
  ok(!w.shell.commands.includes(COMMIT), `a commit ran:\n${w.shell.commands.join("\n")}`);
}

/** The answer is `expected`, the commit ran, and the drafted message was kept in the crew's memory. */
export function assertCommitted(answer: string, w: World, expected: string): void {
  strictEqual(answer, expected);
  ok(w.shell.commands.includes(COMMIT), `no commit ran:\n${w.shell.commands.join("\n")}`);
  strictEqual(w.memory.stored.get("commit_message"), expected.split("\n").pop(), "the drafted message was not kept");
}
