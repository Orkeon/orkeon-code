// The preflight of /dev-batches over a scripted shell: each check's line, the ✗ that stops a run and
// the ⚠ that does not. Run:
//   node --test src/shared/application/dev/preflight.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { GIT_COMMITTER_IDENT_COMMAND, GIT_CURRENT_BRANCH_COMMAND, GIT_IDENT_COMMAND, GIT_STATUS_COMMAND } from "../../domain/git/close.ts";
import { preflight } from "./preflight.ts";
import type { PreflightInput } from "./preflight.ts";

const IDENT = { stdout: "Ada <ada@example.org> 1761300000 +0000\n" };
function gitShell(): FakeShell {
  const shell = new FakeShell();
  shell.results[GIT_IDENT_COMMAND] = IDENT;
  shell.results[GIT_COMMITTER_IDENT_COMMAND] = IDENT;
  shell.results[GIT_CURRENT_BRANCH_COMMAND] = { stdout: "feat/demo\n" };
  return shell;
}
const INPUT: PreflightInput = {
  planShown: "workbench/demo/DEMO-PLAN.md", problems: [], batches: 3, missingSheets: [],
  order: { ok: true, order: ["F1", "F2", "F3"] }, workFolder: "workbench",
};

describe("preflight", () => {
  it("passes a readable plan, its sheets, an order, an identity and a branch", async () => {
    const r = await preflight({ shell: gitShell() }, INPUT);
    strictEqual(r.ok, true);
    deepStrictEqual(r.lines, [
      "preflight ✓ plan: workbench/demo/DEMO-PLAN.md (3 batch(es))",
      "preflight ✓ sheets: one for every batch not done",
      "preflight ✓ order: F1 → F2 → F3",
      "preflight ✓ git identity: Ada <ada@example.org>",
      "preflight ✓ branch: feat/demo",
    ]);
  });

  it("fails on a missing sheet, a cycle, no identity and a detached HEAD", async () => {
    const shell = gitShell();
    shell.results[GIT_IDENT_COMMAND] = { exitCode: 128, stderr: "fatal: no email\n" };
    shell.results[GIT_CURRENT_BRANCH_COMMAND] = { stdout: "" };
    const r = await preflight({ shell }, { ...INPUT, missingSheets: ["F3"], order: { ok: false, problem: "a cycle: F1 → F2 → F1" } });
    strictEqual(r.ok, false);
    deepStrictEqual(r.lines.filter((l) => l.startsWith("preflight ✗")).length, 4);
    ok(r.lines.includes("preflight ✗ sheets: no sheet for F3"));
  });

  it("warns, without failing, on changes outside the work folder and .orkeon/", async () => {
    const shell = gitShell();
    shell.results[GIT_STATUS_COMMAND] = { stdout: " M src/a.ts\n?? workbench/demo/notes.md\n M .orkeon/dev/demo/batches-state.md\n" };
    const r = await preflight({ shell }, INPUT);
    strictEqual(r.ok, true);
    ok(r.lines.some((l) => l.startsWith("preflight ⚠ tree: 1 change(s) outside the work folder (src/a.ts)")), r.lines.join("\n"));
  });

  it("fails a plan with format problems, or none", async () => {
    strictEqual((await preflight({ shell: gitShell() }, { ...INPUT, problems: ["x"] })).ok, false);
    strictEqual((await preflight({ shell: gitShell() }, { ...INPUT, planShown: null })).ok, false);
  });
});
