// The code-review use case over the fakes of its ports. Run:
//   node --test tests/crews/code-review/application/run-code-review.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  MAX_REPORT_FINDINGS, MAX_REVIEW_DIFF_CHARS, REVIEW_PROGRESS_LABEL, runCodeReview,
} from "../../../../src/crews/code-review/application/run-code-review.ts";
import { buildLensPrompt } from "../../../../src/crews/code-review/application/prompts.ts";
import { LENSES, describeReviewPlan } from "../../../../src/crews/code-review/domain/lenses.ts";
import { CONFIG_MAP_STATE_KEY, PASSES_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import {
  DIFF, FUNCTION_CONTEXT_DIFF, HIGH, LOW, REPORT, diffOf, findingsOnLines, lens, reviewHarness, twoPassLog, twoPassReview,
} from "./run-code-review.fixtures.ts";
import { assertMentions, assertOmits } from "../../../support/assertions/text.ts";

describe("runCodeReview — nothing to review", () => {
  it("reports an empty staged diff without reviewing", async () => {
    // Arrange
    const { shell, llm, progress, log, deps } = reviewHarness();

    // Act
    const out = await runCodeReview({}, deps);

    // Assert
    strictEqual(out, "No changes to review (empty diff).");
    deepStrictEqual(shell.commands, ["git diff --staged"]);
    deepStrictEqual(llm.extracts, []);
    deepStrictEqual(progress.reports, []);
    deepStrictEqual(log.lines, ["info: reviewing staged changes"]);
  });

  it("names the paths whose diff is empty", async () => {
    // Arrange
    const { deps } = reviewHarness();

    // Act
    const out = await runCodeReview({ files: ["src/a.ts"] }, deps);

    // Assert
    strictEqual(out, "No changes to review in the named path(s): src/a.ts.");
  });

  it("refuses an implausible commit and reviews the staged changes instead", async () => {
    // Arrange
    const { shell, log, deps } = reviewHarness();

    // Act
    await runCodeReview({ commit: "abc; rm -rf /" }, deps);

    // Assert
    deepStrictEqual(shell.commands, ["git diff --staged"]);
    ok(log.lines[0].startsWith("warn: review input refused: 'abc; rm -rf /' — "), log.lines[0]);
    strictEqual(log.lines[1], "info: reviewing staged changes");
  });
});

describe("runCodeReview — a review", () => {
  it("runs each pass over the input's lenses, ranks the findings and writes the report", async () => {
    // Arrange
    const { shell, files, progress, session, llm, log, deps } = reviewHarness();
    shell.results["git diff abc123~1..abc123"] = { stdout: DIFF };
    shell.results["git diff abc123~1..abc123 --name-only"] = { stdout: "x.ts\ny.ts\n" };
    session.state.set(PASSES_STATE_KEY, "2");
    // Pass 1: security finds HIGH, style fails; pass 2: security finds LOW, style answers nothing.
    llm.extractions = [{ findings: [HIGH] }, new Error("not JSON"), { findings: [LOW] }, null];
    const expected = twoPassReview();
    const plan = describeReviewPlan(expected.lenses, expected.passes, expected.source);

    // Act
    const out = await runCodeReview({ commit: "abc123", lenses: ["security", "nonsense", "style"] }, deps);

    // Assert
    strictEqual(out, `${REPORT} (${expected.findings.length} findings across 2 files, ${plan})`);
    deepStrictEqual(llm.extracts, expected.extracts);
    deepStrictEqual(files.writes.map((w) => w.path), [REPORT]);
    ok(files.writes[0].content.includes("bad call"), files.writes[0].content);
    deepStrictEqual(progress.reports.map((r) => [r.label, r.step, r.total, r.message]), expected.progress);
    deepStrictEqual(progress.released, [REVIEW_PROGRESS_LABEL]);
    deepStrictEqual(log.lines, twoPassLog(plan));
  });

  it("takes the lenses from review.lenses when the input names none", async () => {
    // Arrange
    const { shell, session, llm, deps } = reviewHarness();
    shell.results["git diff --staged"] = { stdout: DIFF };
    session.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ "review.lenses": "correctness" }));

    // Act
    const out = await runCodeReview({}, deps);

    // Assert
    strictEqual(llm.extracts.length, 1);
    ok(out.endsWith(`, ${describeReviewPlan([lens("correctness")], 1, "config")})`), out);
  });

  it("runs the input's pass count over the session's", async () => {
    // Arrange
    const { shell, session, llm, deps } = reviewHarness();
    shell.results["git diff --staged"] = { stdout: DIFF };
    session.state.set(PASSES_STATE_KEY, "4");

    // Act
    const out = await runCodeReview({ lenses: "correctness", passes: 2 }, deps);

    // Assert
    strictEqual(llm.extracts.length, 2);
    ok(out.endsWith(`, ${describeReviewPlan([lens("correctness")], 2, "input")})`), out);
  });

  it("runs one pass of every lens when the settings cannot be read", async () => {
    // Arrange
    const { shell, session, llm, deps } = reviewHarness();
    shell.results["git diff --staged"] = { stdout: DIFF };
    session.failure = new Error("no session tools");

    // Act
    await runCodeReview({}, deps);

    // Assert
    deepStrictEqual(llm.extracts.map((e) => e.prompt), LENSES.map((l) => buildLensPrompt(l, DIFF, 1, [])));
  });
});

describe("runCodeReview — the diff the lenses read (F3-1, F3-7)", () => {
  it("gives the lenses the diff with function context when it fits the cap", async () => {
    // Arrange
    const { shell, llm, deps } = reviewHarness();
    shell.results["git diff --staged"] = { stdout: DIFF };
    shell.results["git diff --function-context --staged"] = { stdout: FUNCTION_CONTEXT_DIFF };

    // Act
    await runCodeReview({ lenses: "correctness" }, deps);

    // Assert
    deepStrictEqual(llm.extracts.map((e) => e.prompt), [buildLensPrompt(lens("correctness"), FUNCTION_CONTEXT_DIFF, 1, [])]);
  });

  it("gives the lenses the plain diff when the one with function context exceeds the cap", async () => {
    // Arrange
    const { shell, llm, deps } = reviewHarness();
    shell.results["git diff --staged"] = { stdout: DIFF };
    shell.results["git diff --function-context --staged"] = { stdout: diffOf(MAX_REVIEW_DIFF_CHARS + 1) };

    // Act
    await runCodeReview({ lenses: "correctness" }, deps);

    // Assert
    deepStrictEqual(llm.extracts.map((e) => e.prompt), [buildLensPrompt(lens("correctness"), DIFF, 1, [])]);
  });

  it("falls back to the plain diff when the function-context diff is empty", async () => {
    // Arrange
    const { shell, llm, deps } = reviewHarness();
    shell.results["git diff --staged"] = { stdout: DIFF };
    shell.results["git diff --function-context --staged"] = { stdout: "  \n" };

    // Act
    await runCodeReview({ lenses: "correctness" }, deps);

    // Assert
    deepStrictEqual(llm.extracts.map((e) => e.prompt), [buildLensPrompt(lens("correctness"), DIFF, 1, [])]);
  });

  it("says in the report how much of a long diff was not reviewed", async () => {
    // Arrange
    const { shell, files, deps } = reviewHarness();
    shell.results["git diff --staged"] = { stdout: diffOf(MAX_REVIEW_DIFF_CHARS + 500) };

    // Act
    await runCodeReview({ lenses: "correctness" }, deps);

    // Assert
    assertMentions(files.writes[0].content, [
      `- Diff: cut after ${MAX_REVIEW_DIFF_CHARS} characters, 500 characters not reviewed`,
      "No issues found in the part reviewed.",
    ]);
  });
});

describe("runCodeReview — the report cap (F3-12)", () => {
  it("keeps the most severe findings up to the cap and says how many were left out", async () => {
    // Arrange
    const { shell, files, llm, deps } = reviewHarness();
    shell.results["git diff --staged"] = { stdout: DIFF };
    llm.extractions = [{ findings: findingsOnLines(MAX_REPORT_FINDINGS + 2) }];

    // Act
    await runCodeReview({ lenses: "correctness" }, deps);

    // Assert
    assertMentions(files.writes[0].content, [`- Findings: ${MAX_REPORT_FINDINGS} (2 less severe left out)`, "fault 30"]);
    assertOmits(files.writes[0].content, ["fault 31", "fault 32"]);
  });
});
