// runAudit and shellValidationRunner over FakeLlm, FakeShell and FakeFiles: one round
// without validations, two with them, refused and late validations as Not run lines,
// the replies kept when the answer never parses, and the runs the auditor made through
// run_validation cited without a second round. Run:
//   node --test tests/crews/dev-verify/application/audit.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { recordingRunner, runAudit, shellValidationRunner } from "../../../../src/crews/dev-verify/application/audit.ts";
import {
  COMMANDS, FOLDER, OTHER_VALIDATION, PASSED_12, SHOWN, VALIDATION, answer, brief, fakes, toolCalling,
} from "./audit.fixtures.ts";
import { assertValidationsLog } from "./audit.assertions.ts";
import { budgetExhaustedAnswer } from "../../../../src/shared/domain/llm-failure.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("runAudit", () => {
  it("makes one act and one extract when no validation is named", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = ["the batch reads well"];
    f.llm.extractions = [answer([], [{ check: "Conventions", reason: "no layer rule in the pack" }])];

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
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
    // Arrange
    const f = fakes();
    f.llm.answers = ["I doubt LineTests", "now I am sure"];
    f.llm.extractions = [answer([VALIDATION]), answer()];
    f.shell.results[VALIDATION] = { exitCode: 0, stdout: "Passed!  - Failed: 0, Passed: 12\nRAN-LINE-TESTS\n" };

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    ok(out.ok);
    strictEqual(out.rounds, 2);
    deepStrictEqual(f.shell.calls, [{ command: VALIDATION, options: { timeoutSeconds: 300 } }]);
    strictEqual(f.llm.acts.length, 2);
    assertMentions(f.llm.acts[1].prompt, ["RAN-LINE-TESTS", "this answer is final"]);
    ok(!f.llm.acts[1].prompt.includes(brief.table.trimEnd()), "the follow-up leaves the table out");
    deepStrictEqual(out.validations, [`\`${VALIDATION}\` — exit 0, scope LineTests, 12 tests`]);
    deepStrictEqual(out.notRun, []);
    assertValidationsLog(f.files, `$ ${VALIDATION}\nexit 0\n`);
  });

  it("never runs a refused validation and lists it under Not run", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = ["run the whole suite", "final"];
    f.llm.extractions = [answer(["dotnet test"]), answer()];

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    ok(out.ok);
    deepStrictEqual(f.shell.commands, []);
    deepStrictEqual(out.validations, []);
    strictEqual(out.notRun.length, 1);
    ok(out.notRun[0].startsWith("`dotnet test` — refused: "), out.notRun[0]);
  });

  it("ignores the validations of the second answer: each becomes a Not run line", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = ["doubt", "more doubt"];
    f.llm.extractions = [answer([VALIDATION]), answer([OTHER_VALIDATION])];

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    ok(out.ok);
    strictEqual(f.shell.commands.length, 1);
    deepStrictEqual(out.notRun, [`\`${OTHER_VALIDATION}\` — named after the validations had run`]);
  });

  it("gives a Blocking Test row for a validation that ran red, even under a VALID answer", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = ["I doubt LineTests", "fine after all"];
    f.llm.extractions = [answer([VALIDATION]), { verdict: "VALID", rows: [], validations: [], undecided: [] }];
    f.shell.results[VALIDATION] = { exitCode: 1, stdout: "Failed!  - Failed: 2, Passed: 10\n" };

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    ok(out.ok);
    deepStrictEqual(out.redRows, [{
      severity: "Blocking", axis: "Test", gap: "a validation is red: exit 1, 2 failed",
      evidence: `\`${VALIDATION}\` exit 1, 2 failed, run by the audit`, fix: "make the validation pass",
    }]);
  });

  it("gives no red row for a green run, and none for a run that was refused", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = ["I doubt LineTests", "fine"];
    f.llm.extractions = [answer([VALIDATION, "rm -rf /"]), answer()];
    f.shell.results[VALIDATION] = PASSED_12;

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    ok(out.ok);
    deepStrictEqual(out.redRows, []);
  });

  it("marks a timed out or throwing validation as not run", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = ["doubt", "final"];
    f.llm.extractions = [answer([VALIDATION, OTHER_VALIDATION]), answer()];
    f.shell.results[VALIDATION] = { timedOut: true, exitCode: -1 };
    f.shell.errors[OTHER_VALIDATION] = new Error("refused by the host\nsecond line");

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    ok(out.ok);
    deepStrictEqual(out.notRun, [
      `\`${VALIDATION}\` — timed out after 300 s`,
      `\`${OTHER_VALIDATION}\` — not run: refused by the host`,
    ]);
  });

  it("writes the replies and returns the BLOCKED line when the answer does not parse twice", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = ["a rambling reply"];
    f.llm.extractions = [{ verdict: "MAYBE", rows: [], validations: [] }];

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
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
    // Arrange
    const f = fakes();
    f.llm.answers = [new Error("provider down")];

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    strictEqual(out.ok, false);
    if (!out.ok) {
      strictEqual(out.text, `dev-verify: BLOCKED — the model call failed (provider down): the capture stays in ${SHOWN}/; no verdict written`);
    }
  });

  it("returns the cancelled line when the act is cancelled", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = [new Error("The operation was canceled.")];

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    strictEqual(out.ok, false);
    if (!out.ok) {
      strictEqual(out.text,
        `dev-verify: BLOCKED — the audit was cancelled (The operation was canceled.): the capture stays in ${SHOWN}/; no verdict written`);
    }
  });
});

describe("recordingRunner and run_validation", () => {
  it("answers a command already run with the same run", async () => {
    // Arrange
    const shell = new FakeShell();
    const runner = recordingRunner(shellValidationRunner(shell, COMMANDS));
    const first = await runner.run(VALIDATION);

    // Act
    const again = await runner.run(` ${VALIDATION} `);

    // Assert
    strictEqual(again, first);
  });

  it("refuses a fourth validation once three ran, a repeat not counted", async () => {
    // Arrange
    const shell = new FakeShell();
    const runner = recordingRunner(shellValidationRunner(shell, COMMANDS));
    await runner.run(VALIDATION);
    await runner.run(` ${VALIDATION} `);
    await runner.run("dotnet test --filter FullyQualifiedName~A");
    await runner.run("dotnet test --filter FullyQualifiedName~B");

    // Act
    const fourth = await runner.run("dotnet test --filter FullyQualifiedName~C");

    // Assert
    strictEqual(shell.commands.length, 3);
    strictEqual(fourth.line, null);
    ok(fourth.report.outcome.startsWith("refused: 3 validations already ran"), fourth.report.outcome);
    strictEqual(runner.runs().length, 4);
  });

  it("does not count a refused command against the three runs", async () => {
    // Arrange
    const shell = new FakeShell();
    const runner = recordingRunner(shellValidationRunner(shell, COMMANDS));
    for (const bad of ["dotnet test", "rm -rf /", "dotnet build"]) await runner.run(bad);
    await runner.run("dotnet test --filter FullyQualifiedName~A");
    await runner.run("dotnet test --filter FullyQualifiedName~B");

    // Act
    const third = await runner.run("dotnet test --filter FullyQualifiedName~C");

    // Assert
    strictEqual(shell.commands.length, 3);
    ok(!third.report.outcome.startsWith("refused"), third.report.outcome);
  });

  it("refuses a validation a rule denies or asks for, without running it", async () => {
    // Arrange
    const shell = new FakeShell();
    const rules = [{ effect: "deny" as const, tool: "shell_command", argument: "command", pattern: "*~Secret*" }];
    const runner = recordingRunner(shellValidationRunner(shell, COMMANDS, rules));

    // Act
    const run = await runner.run("dotnet test --filter FullyQualifiedName~SecretTests");

    // Assert
    strictEqual(run.line, null);
    ok(run.report.outcome.startsWith("refused: the rules of this step deny"), run.report.outcome);
    strictEqual(shell.commands.length, 0);
  });

  it("cites a run the auditor made through the tool, in one round, and keeps its log", async () => {
    // Arrange
    const f = fakes();
    const runner = recordingRunner(shellValidationRunner(f.shell, COMMANDS));
    toolCalling(f.llm, runner, [[VALIDATION]]);
    f.llm.answers = ["LineTests ran green"];
    f.llm.extractions = [answer([VALIDATION])];
    f.shell.results[VALIDATION] = PASSED_12;

    // Act
    const out = await runAudit({ ...f.deps, runner }, brief, FOLDER, SHOWN);

    // Assert
    ok(out.ok);
    strictEqual(out.rounds, 1);
    strictEqual(f.llm.acts.length, 1);
    deepStrictEqual(f.shell.commands, [VALIDATION]);
    deepStrictEqual(out.validations, [`\`${VALIDATION}\` — exit 0, scope LineTests, 12 tests`]);
    assertValidationsLog(f.files, `$ ${VALIDATION}\nexit 0`);
  });

  it("runs by code only what the answer names and the tool did not run, then cites both", async () => {
    // Arrange
    const f = fakes();
    const runner = recordingRunner(shellValidationRunner(f.shell, COMMANDS));
    toolCalling(f.llm, runner, [[VALIDATION], [OTHER_VALIDATION]]);
    f.llm.answers = ["one ran, one more to run", "final"];
    f.llm.extractions = [answer([VALIDATION, OTHER_VALIDATION]), answer([OTHER_VALIDATION])];

    // Act
    const out = await runAudit({ ...f.deps, runner }, brief, FOLDER, SHOWN);

    // Assert
    ok(out.ok);
    strictEqual(out.rounds, 2);
    deepStrictEqual(f.shell.commands, [VALIDATION, OTHER_VALIDATION]);
    strictEqual(out.validations.length, 2);
    deepStrictEqual(out.notRun, [], "a command already run is not a late one");
  });

  it("names a spent budget in the BLOCKED line", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = [new Error("Agent exceeded 200 tool calls.")];

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    ok(!out.ok);
    strictEqual(out.text, `dev-verify: BLOCKED — the step's budget is spent (toolCalls: Agent exceeded 200 tool calls.): ` +
      `the capture stays in ${SHOWN}/`);
    deepStrictEqual(out.unfinished, { reason: "toolCalls: Agent exceeded 200 tool calls.", validations: [], notRun: [] });
  });

  it("keeps the validations run before the budget ran out, for the verdict, and writes them down", async () => {
    // Arrange
    const f = fakes();
    const runner = recordingRunner(shellValidationRunner(f.shell, COMMANDS));
    toolCalling(f.llm, runner, [[VALIDATION, "rm -rf /"]]);
    f.shell.results[VALIDATION] = PASSED_12;
    f.llm.answers = [new Error("Token budget exhausted (307528/300000).")];

    // Act
    const out = await runAudit({ ...f.deps, runner }, brief, FOLDER, SHOWN);

    // Assert
    ok(!out.ok);
    strictEqual(out.unfinished?.reason, "tokens: Token budget exhausted (307528/300000).");
    deepStrictEqual(out.unfinished?.validations, [`\`${VALIDATION}\` — exit 0, scope LineTests, 12 tests`]);
    strictEqual(out.unfinished?.notRun.length, 1);
    assertValidationsLog(f.files, `$ ${VALIDATION}\nexit 0`);
  });

  it("treats the wrap-up of a spent token budget as the tokens dimension, never as an answer to parse (Orkeon #218)", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = [budgetExhaustedAnswer('{"verdict":"VALID","rows":[]}')];

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    ok(!out.ok);
    deepStrictEqual([out.unfinished?.reason.split(":")[0], f.llm.extracts.length], ["tokens", 0]);
  });

  it("gives no unfinished audit for a failure other than a spent budget", async () => {
    // Arrange
    const f = fakes();
    f.llm.answers = [new Error("connection reset")];

    // Act
    const out = await runAudit(f.deps, brief, FOLDER, SHOWN);

    // Assert
    ok(!out.ok);
    strictEqual(out.unfinished, undefined);
    ok(out.text.endsWith("no verdict written"), out.text);
  });

  it("runs once a validation the answer wraps in the tool's name after the tool ran it", async () => {
    // Arrange
    const f = fakes();
    const runner = recordingRunner(shellValidationRunner(f.shell, COMMANDS));
    toolCalling(f.llm, runner, [[VALIDATION]]);
    f.shell.results[VALIDATION] = PASSED_12;
    f.llm.answers = ["ran it"];
    f.llm.extractions = [answer([`run_validation "${VALIDATION}"`])];

    // Act
    const out = await runAudit({ ...f.deps, runner }, brief, FOLDER, SHOWN);

    // Assert
    ok(out.ok);
    strictEqual(out.rounds, 1);
    deepStrictEqual(f.shell.commands, [VALIDATION]);
    deepStrictEqual(out.notRun, []);
  });
});
