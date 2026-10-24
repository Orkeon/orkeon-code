// runAudit and shellValidationRunner over FakeLlm, FakeShell and FakeFiles: one round
// without validations, two with them, refused and late validations as Not run lines,
// the replies kept when the answer never parses, and the runs the auditor made through
// run_validation cited without a second round. Run:
//   node --test src/crews/dev-verify/application/audit.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import type { RepoPackCommands } from "../../../shared/domain/dev/repo-pack.ts";
import type { AuditBriefInput } from "./auditor-prompt.ts";
import { recordingRunner, runAudit, shellValidationRunner } from "./audit.ts";
import type { RecordingRunner } from "./audit.ts";

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

describe("recordingRunner and run_validation", () => {
  /** An act that runs `commands` through the runner first, as the model calling run_validation would. */
  function toolCalling(llm: FakeLlm, runner: RecordingRunner, perAct: string[][]): void {
    const act = llm.act.bind(llm);
    llm.act = async (prompt, request) => {
      for (const command of perAct[llm.acts.length] ?? []) await runner.run(command);
      return act(prompt, request);
    };
  }

  it("answers a command already run with the same run, and refuses a fourth", async () => {
    const shell = new FakeShell();
    const runner = recordingRunner(shellValidationRunner(shell, COMMANDS));
    const first = await runner.run(VALIDATION);
    strictEqual(await runner.run(` ${VALIDATION} `), first);
    await runner.run("dotnet test --filter FullyQualifiedName~A");
    await runner.run("dotnet test --filter FullyQualifiedName~B");
    const fourth = await runner.run("dotnet test --filter FullyQualifiedName~C");
    strictEqual(shell.commands.length, 3);
    strictEqual(fourth.line, null);
    ok(fourth.report.outcome.startsWith("refused: 3 validations already ran"), fourth.report.outcome);
    strictEqual(runner.runs().length, 4);
  });

  it("does not count a refused command against the three runs", async () => {
    const shell = new FakeShell();
    const runner = recordingRunner(shellValidationRunner(shell, COMMANDS));
    for (const bad of ["dotnet test", "rm -rf /", "dotnet build"]) await runner.run(bad);
    await runner.run("dotnet test --filter FullyQualifiedName~A");
    await runner.run("dotnet test --filter FullyQualifiedName~B");
    const third = await runner.run("dotnet test --filter FullyQualifiedName~C");
    strictEqual(shell.commands.length, 3);
    ok(!third.report.outcome.startsWith("refused"), third.report.outcome);
  });

  it("refuses a validation a rule denies or asks for, without running it", async () => {
    const shell = new FakeShell();
    const rules = [{ effect: "deny" as const, tool: "shell_command", argument: "command", pattern: "*~Secret*" }];
    const run = await recordingRunner(shellValidationRunner(shell, COMMANDS, rules)).run("dotnet test --filter FullyQualifiedName~SecretTests");
    strictEqual(run.line, null);
    ok(run.report.outcome.startsWith("refused: the rules of this step deny"), run.report.outcome);
    strictEqual(shell.commands.length, 0);
  });

  it("cites a run the auditor made through the tool, in one round, and keeps its log", async () => {
    const f = fakes();
    const runner = recordingRunner(shellValidationRunner(f.shell, COMMANDS));
    toolCalling(f.llm, runner, [[VALIDATION]]);
    f.llm.answers = ["LineTests ran green"];
    f.llm.extractions = [answer([VALIDATION])];
    f.shell.results[VALIDATION] = { exitCode: 0, stdout: "Passed!  - Failed: 0, Passed: 12\n" };
    const out = await runAudit({ ...f.deps, runner }, brief, FOLDER, SHOWN);
    ok(out.ok);
    strictEqual(out.rounds, 1);
    strictEqual(f.llm.acts.length, 1);
    deepStrictEqual(f.shell.commands, [VALIDATION]);
    deepStrictEqual(out.validations, [`\`${VALIDATION}\` — exit 0, scope LineTests, 12 tests`]);
    ok((f.files.files.get(`${FOLDER}/validations.txt`) ?? "").startsWith(`$ ${VALIDATION}\nexit 0`));
  });

  it("runs by code only what the answer names and the tool did not run, then cites both", async () => {
    const f = fakes();
    const runner = recordingRunner(shellValidationRunner(f.shell, COMMANDS));
    const other = "dotnet test --filter FullyQualifiedName~OrderTests";
    toolCalling(f.llm, runner, [[VALIDATION], [other]]);
    f.llm.answers = ["one ran, one more to run", "final"];
    f.llm.extractions = [answer([VALIDATION, other]), answer([other])];
    const out = await runAudit({ ...f.deps, runner }, brief, FOLDER, SHOWN);
    ok(out.ok);
    strictEqual(out.rounds, 2);
    deepStrictEqual(f.shell.commands, [VALIDATION, other]);
    strictEqual(out.validations.length, 2);
    deepStrictEqual(out.notRun, [], "a command already run is not a late one");
  });

  it("names a spent budget in the BLOCKED line", async () => {
    const f = fakes();
    f.llm.answers = [new Error("Agent exceeded 200 tool calls.")];
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);
    ok(!out.ok);
    strictEqual(out.text, `dev-verify: BLOCKED — the step's budget is spent (toolCalls: Agent exceeded 200 tool calls.): ` +
      `the capture stays in ${SHOWN}/`);
    deepStrictEqual(out.unfinished, { reason: "toolCalls: Agent exceeded 200 tool calls.", validations: [], notRun: [] });
  });

  it("keeps the validations run before the budget ran out, for the verdict, and writes them down", async () => {
    const f = fakes();
    const runner = recordingRunner(shellValidationRunner(f.shell, COMMANDS));
    toolCalling(f.llm, runner, [[VALIDATION, "rm -rf /"]]);
    f.shell.results[VALIDATION] = { exitCode: 0, stdout: "Passed!  - Failed: 0, Passed: 12\n" };
    f.llm.answers = [new Error("Token budget exhausted (307528/300000).")];
    const out = await runAudit({ ...f.deps, runner }, brief, FOLDER, SHOWN);
    ok(!out.ok);
    strictEqual(out.unfinished?.reason, "tokens: Token budget exhausted (307528/300000).");
    deepStrictEqual(out.unfinished?.validations, [`\`${VALIDATION}\` — exit 0, scope LineTests, 12 tests`]);
    strictEqual(out.unfinished?.notRun.length, 1);
    ok((f.files.files.get(`${FOLDER}/validations.txt`) ?? "").startsWith(`$ ${VALIDATION}\nexit 0`));
  });

  it("gives no unfinished audit for a failure other than a spent budget", async () => {
    const f = fakes();
    f.llm.answers = [new Error("connection reset")];
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);
    ok(!out.ok);
    strictEqual(out.unfinished, undefined);
    ok(out.text.endsWith("no verdict written"), out.text);
  });

  it("runs once a validation the answer wraps in the tool's name after the tool ran it", async () => {
    const f = fakes();
    const runner = recordingRunner(shellValidationRunner(f.shell, COMMANDS));
    toolCalling(f.llm, runner, [[VALIDATION]]);
    f.shell.results[VALIDATION] = { exitCode: 0, stdout: "Passed!  - Failed: 0, Passed: 12\n" };
    f.llm.answers = ["ran it"];
    f.llm.extractions = [answer([`run_validation "${VALIDATION}"`])];
    const out = await runAudit({ ...f.deps, runner }, brief, FOLDER, SHOWN);
    ok(out.ok);
    strictEqual(out.rounds, 1);
    deepStrictEqual(f.shell.commands, [VALIDATION]);
    deepStrictEqual(out.notRun, []);
  });
});
