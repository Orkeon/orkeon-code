// /commit (commands/_lib/git/commit.ts): the mode check, the confirmation and its refusals, and the crew's input,
// over a scripted session and confirmation, FakeToolCatalogue, FakePermissionRules and FakeLogger. Run:
//   node --test src/commands/_lib/git/commit.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { CANNOT_PROMPT_REFUSAL, NO_ANSWER_REFUSAL, PUSH_PR_INPUT, commitHarness } from "./commit.fixtures.ts";
import { isCommitPermitted } from "../../../crews/git-commit/domain/commit.ts";

describe("runCommitCommand", () => {
  it("refuses when the confirmation cannot be asked, and names --yes as the remedy", async () => {
    // Arrange
    const { written, run } = commitHarness({ answer: new Error("no console") });

    // Act
    const outcome = await run();

    // Assert
    deepStrictEqual([outcome, written.at(-1)], [{ refused: CANNOT_PROMPT_REFUSAL }, `✗ ${CANNOT_PROMPT_REFUSAL}`]);
  });

  it("refuses a confirmation that answers no boolean", async () => {
    // Arrange
    const { run } = commitHarness({ answer: undefined });

    // Act
    const outcome = await run();

    // Assert
    deepStrictEqual(outcome, { refused: NO_ANSWER_REFUSAL });
  });

  it("cancels on a declined confirmation", async () => {
    // Arrange
    const { run } = commitHarness({ answer: false });

    // Act
    const outcome = await run();

    // Assert
    deepStrictEqual(outcome, { refused: "cancelled — nothing was staged and nothing was committed." });
  });

  it("asks nothing with --yes and launches with no pull request asked", async () => {
    // Arrange
    const { questions, run } = commitHarness();

    // Act
    const outcome = await run("--yes");

    // Assert
    deepStrictEqual([questions, outcome], [[], { input: { permissionMode: "acceptEdits", paths: [], push: false, pr: false, prAsked: false } }]);
  });

  it("refuses a read-only mode before asking anything", async () => {
    // Arrange
    const { questions, written, run } = commitHarness({ mode: "plan", answer: true });
    const reason = isCommitPermitted("plan").reason;

    // Act
    const outcome = await run();

    // Assert
    deepStrictEqual([outcome, written, questions], [{ refused: reason }, [`✗ refused: ${reason}`], []]);
  });

  it("hands the crew the mode, the flags and the pull-request context once --push --pr is confirmed", async () => {
    // Arrange
    const { log, run } = commitHarness({ answer: true });

    // Act
    const outcome = await run("--push", "--pr");

    // Assert
    deepStrictEqual([outcome, log.lines], [{ input: PUSH_PR_INPUT }, ["info: commit approved — permission mode 'acceptEdits' (test)"]]);
  });
});
