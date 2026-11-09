// scripts/smoke-crew.sh over a fake runner (SMOKE_CREW_RUNNER): each case scripts how the runner
// ends and what it commits. No orkeon, no network. Run:
//   node --test tests/scripts/smoke-crew.test.ts
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { strictEqual } from "node:assert";
import { EXITS, MOCK_SUBJECT, run, SCRIPT } from "./smoke-crew.fixtures.ts";
import { assertExit, assertKeylessSettings, assertReports, assertRunnerCall } from "./smoke-crew.assertions.ts";

describe("scripts/smoke-crew.sh", () => {
  it("parses as bash", () => {
    // Arrange
    const script = SCRIPT;

    // Act
    const r = spawnSync("bash", ["-n", script]);

    // Assert
    strictEqual(r.status, 0);
  });

  for (const c of EXITS) {
    it(c.name, () => {
      // Arrange
      const plan = c.plan;

      // Act
      const r = run(plan);

      // Assert
      assertExit(r, c);
    });
  }

  it("runs git-commit under the mock answers, in bypass mode, on a trusted workspace", () => {
    // Arrange
    const plan = `0|${MOCK_SUBJECT}`;

    // Act
    const r = run(plan);

    // Assert
    assertRunnerCall(r);
  });

  it("gives the runner a fresh fixture whose one change is the README", () => {
    // Arrange
    const plan = `0|${MOCK_SUBJECT}`;

    // Act
    const r = run(plan);

    // Assert
    strictEqual(r.workspaceStatus, "M README.md", "the seed commit plus one unstaged change");
  });

  it("gives the runner the example settings made keyless", () => {
    // Arrange
    const plan = `0|${MOCK_SUBJECT}`;

    // Act
    const r = run(plan);

    // Assert
    assertKeylessSettings(r);
  });

  it("names the subject HEAD carries when it is not the mock's", () => {
    // Arrange
    const plan = "0|chore: something else";

    // Act
    const r = run(plan);

    // Assert
    assertReports(r, "HEAD is 'chore: something else', the mock answered 'chore(sample): note the smoke in the readme'");
  });
});
