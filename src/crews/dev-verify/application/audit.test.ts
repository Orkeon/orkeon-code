// runAudit and shellValidationRunner over FakeLlm, FakeShell and FakeFiles: one round
// without validations, two with them, refused and late validations as Not run lines,
// and the replies kept when the answer never parses. Run:
//   node --test src/crews/dev-verify/application/audit.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import type { RepoPackCommands } from "../../../shared/domain/dev/repo-pack.ts";
import type { AuditBriefInput } from "./auditor-prompt.ts";
import { runAudit, shellValidationRunner } from "./audit.ts";

const FOLDER = "/workspace/workbench/demo/capture-F2";
const SHOWN = "workbench/demo/capture-F2";
const COMMANDS: RepoPackCommands = { testClass: "dotnet test --filter FullyQualifiedName~<class>", test: "dotnet test" };
const VALIDATION = "dotnet test --filter FullyQualifiedName~LineTests";

const brief: AuditBriefInput = {
  mode: "fast", batch: "F2", sheetPath: "workbench/demo/DEMO-PLAN-F2.md",
  captureFiles: [`${FOLDER}/index.txt`, `${FOLDER}/table.md`],
  table: "| Axis | Check | Result | Evidence |\n|---|---|---|---|\n", appliedRules: "DDD-01",
  commands: { testClass: COMMANDS.testClass }, previousGaps: null,
};

const row = { severity: "Minor", axis: "Simplification", gap: "A loop could be a map", evidence: "src/Order.cs:4", fix: "Use map" };
const answer = (validations: string[] = [], undecided: Array<{ check: string; reason: string }> = []) =>
  ({ verdict: "VALID", rows: [row], validations, undecided });

function fakes() {
  const llm = new FakeLlm();
  const shell = new FakeShell();
  const files = new FakeFiles();
  return { llm, shell, files, deps: { llm, files, runner: shellValidationRunner(shell, COMMANDS) } };
}

describe("runAudit", () => {
  it("makes one act and one extract when no validation is named", async () => {
    const f = fakes();
    f.llm.answers = ["the batch reads well"];
    f.llm.extractions = [answer([], [{ check: "Conventions", reason: "no layer rule in the pack" }])];
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);
    ok(out.ok);
    strictEqual(out.rounds, 1);
    deepStrictEqual(out.validations, []);
    deepStrictEqual(out.notRun, ["Conventions — no layer rule in the pack"]);
    strictEqual(f.llm.acts.length, 1);
    strictEqual(f.llm.extracts.length, 1);
    strictEqual(f.llm.acts[0].request.permissionMode, "plan");
    deepStrictEqual(f.shell.commands, []);
  });

  it("runs an accepted validation with 300 s, then asks once more with its output", async () => {
    const f = fakes();
    f.llm.answers = ["I doubt LineTests", "now I am sure"];
    f.llm.extractions = [answer([VALIDATION]), answer()];
    f.shell.results[VALIDATION] = { exitCode: 0, stdout: "Passed!  - Failed: 0, Passed: 12\nRAN-LINE-TESTS\n" };
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);
    ok(out.ok);
    strictEqual(out.rounds, 2);
    deepStrictEqual(f.shell.calls, [{ command: VALIDATION, options: { timeoutSeconds: 300 } }]);
    strictEqual(f.llm.acts.length, 2);
    ok(f.llm.acts[1].prompt.includes("RAN-LINE-TESTS"));
    ok(f.llm.acts[1].prompt.includes("this answer is final"));
    ok(!f.llm.acts[1].prompt.includes(brief.table.trimEnd()), "the follow-up leaves the table out");
    deepStrictEqual(out.validations, [`\`${VALIDATION}\` — exit 0, scope LineTests, 12 tests`]);
    deepStrictEqual(out.notRun, []);
    const log = f.files.files.get(`${FOLDER}/validations.txt`) ?? "";
    ok(log.startsWith(`$ ${VALIDATION}\nexit 0\n`), log);
  });

  it("never runs a refused validation and lists it under Not run", async () => {
    const f = fakes();
    f.llm.answers = ["run the whole suite", "final"];
    f.llm.extractions = [answer(["dotnet test"]), answer()];
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);
    ok(out.ok);
    deepStrictEqual(f.shell.commands, []);
    deepStrictEqual(out.validations, []);
    strictEqual(out.notRun.length, 1);
    ok(out.notRun[0].startsWith("`dotnet test` — refused: "), out.notRun[0]);
  });

  it("ignores the validations of the second answer: each becomes a Not run line", async () => {
    const f = fakes();
    f.llm.answers = ["doubt", "more doubt"];
    f.llm.extractions = [answer([VALIDATION]), answer(["dotnet test --filter FullyQualifiedName~OrderTests"])];
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);
    ok(out.ok);
    strictEqual(f.shell.commands.length, 1);
    deepStrictEqual(out.notRun, ["`dotnet test --filter FullyQualifiedName~OrderTests` — named after the validations had run"]);
  });

  it("marks a timed out or throwing validation as not run", async () => {
    const f = fakes();
    const other = "dotnet test --filter FullyQualifiedName~OrderTests";
    f.llm.answers = ["doubt", "final"];
    f.llm.extractions = [answer([VALIDATION, other]), answer()];
    f.shell.results[VALIDATION] = { timedOut: true, exitCode: -1 };
    f.shell.errors[other] = new Error("refused by the host\nsecond line");
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);
    ok(out.ok);
    deepStrictEqual(out.notRun, [
      `\`${VALIDATION}\` — timed out after 300 s`,
      `\`${other}\` — not run: refused by the host`,
    ]);
  });

  it("writes the replies and returns the BLOCKED line when the answer does not parse twice", async () => {
    const f = fakes();
    f.llm.answers = ["a rambling reply"];
    f.llm.extractions = [{ verdict: "MAYBE", rows: [], validations: [] }];
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);
    strictEqual(out.ok, false);
    strictEqual(f.llm.extracts.length, 2);
    const replies = f.files.files.get(`${FOLDER}/auditor-replies.txt`) ?? "";
    ok(replies.startsWith("a rambling reply\n--- problems\n"), replies);
    if (!out.ok) {
      strictEqual(out.text,
        "dev-verify: BLOCKED — the auditor's answer did not parse after one re-ask (verdict must be VALID or GAPS): " +
        `its replies are in ${SHOWN}/auditor-replies.txt; no verdict written`);
    }
  });

  it("returns the model-failed line when the act throws", async () => {
    const f = fakes();
    f.llm.answers = [new Error("provider down")];
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);
    strictEqual(out.ok, false);
    if (!out.ok) {
      strictEqual(out.text, `dev-verify: BLOCKED — the model call failed (provider down): the capture stays in ${SHOWN}/; no verdict written`);
    }
  });
});
