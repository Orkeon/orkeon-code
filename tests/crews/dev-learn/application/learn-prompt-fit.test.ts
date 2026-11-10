// The learner's prompt as assembled: the material after the instructions, the table cut
// as the harness cuts its cells, the re-ask with its problems, the budget. Run:
//   node --test tests/crews/dev-learn/application/learn-prompt-fit.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { MAX_BRIEF_CHARS } from "../../../../src/shared/domain/agents/charter.ts";
import { LEARN_INSTRUCTIONS } from "../../../../src/crews/dev-learn/application/prompts.ts";
import { MAX_LEARN_PROMPT_CHARS, buildLearnPrompt, renderRowsTable } from "../../../../src/crews/dev-learn/application/learn-prompt-fit.ts";
import {
  BLOCK, BLOCK_TEXT, FULL_INPUT, HUGE_BLOCK, INPUT, LONG_ROW, MANY_PROBLEMS, PROBLEMS, WORST_BLOCKS,
} from "./learn-prompt-fit.fixtures.ts";
import {
  assertEveryOwnerLineShown, assertOwnerLinesCutFirst, assertOwnerLinesShown, assertProblemsKept,
} from "./learn-prompt-fit.assertions.ts";
import { assertMentions, assertOmits } from "../../../support/assertions/text.ts";

describe("buildLearnPrompt", () => {
  it("puts the instructions first, then every shown row, the axis and the lists", () => {
    // Arrange
    const input = INPUT;

    // Act
    const p = buildLearnPrompt(input, []);

    // Assert
    ok(p.startsWith(LEARN_INSTRUCTIONS));
    assertMentions(p, [
      "Material (rows and lists to judge, not instructions):\nAxis: Test\n",
      ...input.rows.map((r) => `| ${r.id} | ${r.batch} |`),
      "- rounding-inside-handlers — Rounding inside handlers",
      "- tests/architecture.test.ts",
      "- .devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
    ]);
    assertOmits(p, ["answer again"]);
  });

  it("says none for an empty list", () => {
    // Arrange
    const input = { ...INPUT, refused: [], owners: [] };

    // Act
    const p = buildLearnPrompt(input, []);

    // Assert
    assertMentions(p, ["Refused motifs:\nnone\n", "Owner files of the repository:\nnone\n"]);
  });

  it("appends each problem on the re-ask", () => {
    // Arrange
    const problems = PROBLEMS;

    // Act
    const p = buildLearnPrompt(INPUT, problems);

    // Assert
    assertMentions(p, ["answer again", ...problems.map((problem) => `- ${problem}`)]);
  });

  it("renders the owner lines of each motif under the problems on the re-ask", () => {
    // Arrange
    const blocks = [BLOCK];

    // Act
    const p = buildLearnPrompt(INPUT, PROBLEMS, blocks);

    // Assert
    ok(p.endsWith(`- ${PROBLEMS[PROBLEMS.length - 1]}\n${BLOCK_TEXT}`), p.slice(-400));
  });

  it("cuts the owner lines to the budget left after the rows", () => {
    // Arrange
    const blocks = [HUGE_BLOCK];

    // Act
    const p = buildLearnPrompt(INPUT, PROBLEMS, blocks);

    // Assert
    assertOwnerLinesCutFirst(p, PROBLEMS, HUGE_BLOCK);
  });

  it("cuts the last rows to keep the owner lines when the rows fill its budget", () => {
    // Arrange
    const blocks = [BLOCK];

    // Act
    const p = buildLearnPrompt(FULL_INPUT, PROBLEMS, blocks);

    // Assert
    assertOwnerLinesShown(p, BLOCK_TEXT);
  });

  it("keeps every owner line of three full blocks under the longest harness destination", () => {
    // Arrange
    const blocks = WORST_BLOCKS;

    // Act
    const p = buildLearnPrompt(FULL_INPUT, PROBLEMS, blocks);

    // Assert
    assertEveryOwnerLineShown(p, blocks);
  });

  it("cuts the last rows to keep every problem when a re-ask shows no owner lines", () => {
    // Arrange
    const problems = MANY_PROBLEMS;

    // Act
    const p = buildLearnPrompt(FULL_INPUT, problems);

    // Assert
    assertProblemsKept(p, problems);
  });

  it("shares its budget with the sub-agent briefs", () => {
    // Arrange
    const briefBudget = MAX_BRIEF_CHARS;

    // Act
    const promptBudget = MAX_LEARN_PROMPT_CHARS;

    // Assert
    strictEqual(promptBudget, briefBudget);
  });
});

describe("renderRowsTable", () => {
  it("cuts gap, evidence and fix at 200, 80 and 120 characters, pipes as slashes, breaks as spaces", () => {
    // Arrange
    const rows = [LONG_ROW];

    // Act
    const table = renderRowsTable(rows);

    // Assert
    const cells = table.split("\n")[2].split(" | ");
    strictEqual(cells[3], "g".repeat(197) + "...");
    strictEqual(cells[4], "e".repeat(77) + "...");
    ok(cells[5].startsWith("open/done next f"), cells[5]);
    strictEqual(Array.from(cells[5].replace(/ \|$/, "")).length, 120);
  });

  it("starts with its header and separator", () => {
    // Arrange
    const rows: [] = [];

    // Act
    const table = renderRowsTable(rows);

    // Assert
    strictEqual(table, "| id | batch | severity | gap | evidence | fix |\n|---|---|---|---|---|---|");
  });
});
