// The brief, answers and fakes runAudit and the validation runners are tested on.
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import type { RepoPackCommands } from "../../../shared/domain/dev/repo-pack.ts";
import type { AuditBriefInput } from "./auditor-prompt.ts";
import { shellValidationRunner } from "./audit.ts";
import type { RecordingRunner, ValidationRunner } from "./audit.ts";

export const FOLDER = "/workspace/workbench/demo/capture-F2";
export const SHOWN = "workbench/demo/capture-F2";
export const COMMANDS: RepoPackCommands = { testClass: "dotnet test --filter FullyQualifiedName~<class>", test: "dotnet test" };
export const VALIDATION = "dotnet test --filter FullyQualifiedName~LineTests";
export const OTHER_VALIDATION = "dotnet test --filter FullyQualifiedName~OrderTests";

/** A green run of twelve tests. */
export const PASSED_12 = { exitCode: 0, stdout: "Passed!  - Failed: 0, Passed: 12\n" };

export const brief: AuditBriefInput = {
  mode: "fast", batch: "F2", sheetPath: "workbench/demo/DEMO-PLAN-F2.md",
  captureFiles: [`${FOLDER}/index.txt`, `${FOLDER}/table.md`],
  table: "| Axis | Check | Result | Evidence |\n|---|---|---|---|\n", appliedRules: "DDD-01",
  commands: { testClass: COMMANDS.testClass }, previousGaps: null,
};

const row = { severity: "Minor", axis: "Simplification", gap: "A loop could be a map", evidence: "src/Order.cs:4", fix: "Use map" };

/** A VALID answer of one Minor row, naming `validations` and `undecided`. */
export function answer(validations: string[] = [], undecided: Array<{ check: string; reason: string }> = []): object {
  return { verdict: "VALID", rows: [row], validations, undecided };
}

export interface AuditFakes {
  llm: FakeLlm;
  shell: FakeShell;
  files: FakeFiles;
  deps: { llm: FakeLlm; files: FakeFiles; runner: ValidationRunner };
}

/** A model, a shell and files, and runAudit's ports over them, the validations run through the shell. */
export function fakes(): AuditFakes {
  const llm = new FakeLlm();
  const shell = new FakeShell();
  const files = new FakeFiles();
  return { llm, shell, files, deps: { llm, files, runner: shellValidationRunner(shell, COMMANDS) } };
}

/** An act that runs `commands` through the runner first, as the model calling run_validation would. */
export function toolCalling(llm: FakeLlm, runner: RecordingRunner, perAct: string[][]): void {
  const act = llm.act.bind(llm);
  llm.act = async (prompt, request) => {
    for (const command of perAct[llm.acts.length] ?? []) await runner.run(command);
    return act(prompt, request);
  };
}
