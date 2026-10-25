// Parity of the gate with the harness's: on each scenario of tests/fixtures/dev/verify,
// runGate over the recorded git outputs prints the very lines the harness gate printed.
//   node --test src/crews/dev-verify/application/gate-parity.test.ts
//
// Recorded 2026-10-22 (git 2.39.5, GNU bash), again the same day once the trait ERE took its `-e`
// and the untracked-build-output and named-outside-roots scenarios were added; per scenario of scenarios.json:
//   T=$(mktemp -d <scratch>/top-<name>-XXXX); cd "$T"; git init -q
//   cp -r tests/fixtures/dev/verify/base/. "$T"
//   git add -A && git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm base
//   cp -r tests/fixtures/dev/verify/batch/. "$T"; then the scenario's edits (first occurrence of `find`, or `create`)
//   bash /workspace/temp/_sources/orkeon-workshop/.devcontainer/harness/packs/dev/claude/skills/dev-verify/scripts/audit-capture.sh \
//     F1 workbench/vdemo/VDEMO-PLAN-F1.md <scratch>/cap-<name>.txt --roots "src tests" --trait BR --build-outputs "bin obj"
// harness-gate.txt keeps its stdout from `GATE — batch F1 — sheet` through `GATE — batch F1:`, "$T" replaced by
// /workspace. git-outputs.json holds the stdout and exit code of each command runGate issued, run with
// `bash -c "<command>"` in "$T", with the pack of pack.yaml (the same roots, trait and build outputs).
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";

import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { runGate } from "./run-gate.ts";
import { TARGET, filesOf, gitOutputs, harnessBlocks, scenarios } from "./gate-parity.fixtures.ts";

describe("gate parity with the harness", () => {
  it("covers every scenario in the harness gate's recording", () => {
    // Arrange
    const names = scenarios.map((s) => s.name);

    // Act
    const blocks = harnessBlocks();

    // Assert
    deepStrictEqual([...blocks.keys()], names);
  });

  it("covers every scenario in the git outputs' recording", () => {
    // Arrange
    const names = scenarios.map((s) => s.name);

    // Act
    const recorded = Object.keys(gitOutputs);

    // Assert
    deepStrictEqual(recorded, names);
  });

  for (const scenario of scenarios) {
    it(`prints the harness's lines on ${scenario.name}`, async () => {
      // Arrange
      const files = filesOf(scenario.edits);
      const shell = new FakeShell();
      const recorded = gitOutputs[scenario.name];
      for (const [command, result] of Object.entries(recorded)) shell.results[command] = result;

      // Act
      const out = await runGate({ files, shell }, TARGET);

      // Assert
      ok(out.ok, out.ok ? "" : out.error);
      deepStrictEqual(shell.commands, Object.keys(recorded));
      deepStrictEqual(out.run.report.lines, harnessBlocks().get(scenario.name));
      deepStrictEqual(files.writes, []);
    });
  }
});
