// The learner's prompt: each behaviour pinned by one marker, the material after the
// instructions, the table cut as the harness cuts its cells, the re-ask with its
// problems, and no host vocabulary. Run:
//   node --test tests/crews/dev-learn/application/learn-prompt.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { MAX_BRIEF_CHARS } from "../../../../src/shared/domain/agents/charter.ts";
import { LEARN_INSTRUCTIONS, MAX_LEARN_PROMPT_CHARS, buildLearnPrompt, renderRowsTable } from "../../../../src/crews/dev-learn/application/learn-prompt.ts";
import { HOST_WORDS, INPUT, LONG_ROW, MARKERS, PROBLEMS } from "./learn-prompt.fixtures.ts";
import { assertMentions, assertOmits } from "../../../support/assertions/text.ts";

describe("LEARN_INSTRUCTIONS — one marker per behaviour", () => {
  for (const { behaviour, marker } of MARKERS) {
    it(behaviour, () => {
      // Arrange
      const expected = marker;

      // Act
      const text = LEARN_INSTRUCTIONS;

      // Assert
      ok(text.includes(expected), expected);
    });
  }

  it("speaks no host vocabulary", () => {
    // Arrange
    const words = HOST_WORDS;

    // Act
    const text = LEARN_INSTRUCTIONS;

    // Assert
    assertOmits(text, words);
  });

  it("holds none of the material", () => {
    // Arrange
    const material = [...INPUT.rows.map((r) => r.id), "Axis: Test"];

    // Act
    const text = LEARN_INSTRUCTIONS;

    // Assert
    assertOmits(text, material);
  });
});

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
