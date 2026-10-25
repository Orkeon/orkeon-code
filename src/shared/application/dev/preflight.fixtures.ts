// The scripted shell and the inputs the preflight of /dev-batches is tested on.
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { GIT_COMMITTER_IDENT_COMMAND, GIT_CURRENT_BRANCH_COMMAND, GIT_IDENT_COMMAND, GIT_STATUS_COMMAND } from "../../domain/git/close.ts";
import type { PreflightInput } from "./preflight.ts";

const IDENT = { stdout: "Ada <ada@example.org> 1761300000 +0000\n" };

/** A shell where git knows Ada as author and committer, on the branch feat/demo, with a clean tree. */
export function gitShell(): FakeShell {
  const shell = new FakeShell();
  shell.results[GIT_IDENT_COMMAND] = IDENT;
  shell.results[GIT_COMMITTER_IDENT_COMMAND] = IDENT;
  shell.results[GIT_CURRENT_BRANCH_COMMAND] = { stdout: "feat/demo\n" };
  return shell;
}

/** gitShell, but git has no author identity and HEAD is detached. */
export function noIdentityDetachedShell(): FakeShell {
  const shell = gitShell();
  shell.results[GIT_IDENT_COMMAND] = { exitCode: 128, stderr: "fatal: no email\n" };
  shell.results[GIT_CURRENT_BRANCH_COMMAND] = { stdout: "" };
  return shell;
}

/** gitShell, its tree changed in src/, in the work folder and in .orkeon/. */
export function changedTreeShell(): FakeShell {
  const shell = gitShell();
  shell.results[GIT_STATUS_COMMAND] = { stdout: " M src/a.ts\n?? workbench/demo/notes.md\n M .orkeon/dev/demo/batches-state.md\n" };
  return shell;
}

/** A readable plan of three batches, every sheet there, ordered F1 → F2 → F3. */
export const INPUT: PreflightInput = {
  planShown: "workbench/demo/DEMO-PLAN.md", problems: [], batches: 3, missingSheets: [],
  order: { ok: true, order: ["F1", "F2", "F3"] }, workFolder: "workbench",
};

export const PASSED_LINES: readonly string[] = [
  "preflight ✓ plan: workbench/demo/DEMO-PLAN.md (3 batch(es))",
  "preflight ✓ sheets: one for every batch not done",
  "preflight ✓ order: F1 → F2 → F3",
  "preflight ✓ git identity: Ada <ada@example.org>",
  "preflight ✓ branch: feat/demo",
];

/** INPUT without the sheet of F3 and with a cycle for an order. */
export const MISSING_SHEET_AND_CYCLE: PreflightInput = {
  ...INPUT, missingSheets: ["F3"], order: { ok: false, problem: "a cycle: F1 → F2 → F1" },
};

/** Plans the preflight fails on their own. */
export const UNREADABLE_PLANS: ReadonlyArray<{ name: string; input: PreflightInput }> = [
  { name: "a plan with format problems", input: { ...INPUT, problems: ["x"] } },
  { name: "no plan", input: { ...INPUT, planShown: null } },
];
