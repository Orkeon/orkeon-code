// Unit tests for the verdict. Run:
//   node --test tests/crews/dev-verify/domain/verdict.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { parseVerdictFile } from "../../../../src/shared/domain/dev/verdict-format.ts";
import {
  MAX_VERDICT_ROWS, capRows, carriedRows, decideVerdict, formatWhen, renderVerdictSection, undecidedNotRun,
  verdictFileName, writeVerdictFile,
} from "../../../../src/crews/dev-verify/domain/verdict.ts";
import {
  DECIDE_CASES, DROP_CASES, DROP_TABLE, GAPS_SECTION_TEXT, GAP_TABLE, GAP_TABLE_CARRIED, LEARNING_PASS_ROWS,
  MINOR_ON_RED_AXES, PARSED_BACK_ROWS, RED_BUILD_AND_SUITE, REPLACE_CASES, ROW_TO_ESCAPE, THIRTEEN_ROWS,
  gapRowsAsTheLearningPassReadsThem, major, minor, parseBackSection, sectionInput,
} from "./verdict.fixtures.ts";
import { assertHolds } from "./verdict.assertions.ts";

describe("formatWhen and names", () => {
  it("formats the local date", () => {
    // Arrange
    const date = new Date(2026, 9, 22, 14, 5);

    // Act
    const when = formatWhen(date);

    // Assert
    strictEqual(when, "2026-10-22 14:05");
  });

  it("names the file", () => {
    // Arrange
    const prefix = "DEMO";

    // Act
    const name = verdictFileName(prefix, "F2");

    // Assert
    strictEqual(name, "DEMO-VERIFY-F2.md");
  });

  it("names the not-run entries", () => {
    // Arrange
    const undecided = [{ check: "Placement", reason: "the folder rule is unclear" }];

    // Act
    const notRun = undecidedNotRun(undecided);

    // Assert
    deepStrictEqual(notRun, ["Placement — the folder rule is unclear"]);
  });
});

describe("decideVerdict", () => {
  for (const c of DECIDE_CASES) {
    it(`is GAPS on a Blocking or Major row, VALID otherwise: ${c.name}`, () => {
      // Arrange
      const { rows } = c;

      // Act
      const verdict = decideVerdict(rows);

      // Assert
      strictEqual(verdict, c.expected);
    });
  }
});

describe("carriedRows", () => {
  it("carries each gap with its severity", () => {
    // Arrange
    const table = GAP_TABLE;

    // Act
    const carried = carriedRows([], table);

    // Assert
    deepStrictEqual(carried.map((r) => [r.severity, r.axis, r.gap]), GAP_TABLE_CARRIED);
    strictEqual(carried[0].evidence, "`exit: 1` — error CS1002");
    strictEqual(carried[0].fix, "see table.md: capture `build`");
  });

  for (const c of DROP_CASES) {
    it(`drops a carried gap only for an answer row on its axis at least as severe: ${c.name}`, () => {
      // Arrange
      const { answer } = c;

      // Act
      const carried = carriedRows(answer, DROP_TABLE);

      // Assert
      deepStrictEqual(carried.map((r) => [r.severity, r.axis]), c.expected);
    });
  }

  it("carries a red build and a red suite past Minor rows on their axes", () => {
    // Arrange
    const answer = MINOR_ON_RED_AXES;

    // Act
    const carried = carriedRows(answer, RED_BUILD_AND_SUITE);

    // Assert
    deepStrictEqual(carried.map((r) => [r.severity, r.axis]), [["Blocking", "Correctness"], ["Blocking", "Test"]]);
  });

  it("gives GAPS once a red build and a red suite are carried past Minor rows on their axes", () => {
    // Arrange
    const carried = carriedRows(MINOR_ON_RED_AXES, RED_BUILD_AND_SUITE);

    // Act
    const verdict = decideVerdict([...MINOR_ON_RED_AXES, ...carried]);

    // Assert
    strictEqual(verdict, "GAPS");
  });
});

describe("capRows", () => {
  it("keeps 8 rows, worst first, and says what is left per severity", () => {
    // Arrange
    const rows = THIRTEEN_ROWS;

    // Act
    const capped = capRows(rows);

    // Assert
    strictEqual(capped.rows.length, MAX_VERDICT_ROWS);
    deepStrictEqual(capped.rows.map((r) => r.severity), ["Blocking", "Major", "Major", "Major", "Major", "Major", "Major", "Major"]);
    deepStrictEqual(capped.overflow, ["+5 more Minor on Simplification, Reuse"]);
  });

  it("adds nothing under the cap", () => {
    // Arrange
    const rows = [minor, major];

    // Act
    const capped = capRows(rows);

    // Assert
    deepStrictEqual(capped, { rows: [major, minor], overflow: [] });
  });
});

describe("renderVerdictSection", () => {
  it("writes the skeleton of a GAPS section", () => {
    // Arrange
    const input = sectionInput({
      rows: [minor, major], validations: ["`npm run t` — exit 0, scope a, 3 tests"],
      notRun: ["`npm test` — refused: not one of the pack's test_class, test_project or test_integration commands"],
    });

    // Act
    const { text, verdict, shown } = renderVerdictSection(input);

    // Assert
    strictEqual(verdict, "GAPS");
    deepStrictEqual(shown, [major, minor]);
    strictEqual(text, GAPS_SECTION_TEXT);
  });

  it("writes None. for a VALID section without rows, and the none line without validations", () => {
    // Arrange
    const input = sectionInput();

    // Act
    const { text, verdict } = renderVerdictSection(input);

    // Assert
    strictEqual(verdict, "VALID");
    assertHolds(text, "## Verdict — VALID\n\nNone.\n\nValidations: none — the capture's build and last test run stand\n");
  });

  it("joins several validations on one line with ' · '", () => {
    // Arrange
    const input = sectionInput({ validations: ["`a` — exit 0, scope x, 1 tests", "`b` — exit 1, scope y, 2 tests"] });

    // Act
    const { text } = renderVerdictSection(input);

    // Assert
    assertHolds(text, "\nValidations: `a` — exit 0, scope x, 1 tests · `b` — exit 1, scope y, 2 tests\n");
  });

  it("writes several validations as one line verdict-format reads back", () => {
    // Arrange
    const { text } = renderVerdictSection(sectionInput({
      validations: ["`a` — exit 0, scope x, 1 tests", "`b` — exit 1, scope y, 2 tests"],
    }));

    // Act
    const parsed = parseVerdictFile(text);

    // Assert
    strictEqual(parsed.sections[0].validations.length, 1);
  });

  it("applies the cell rules", () => {
    // Arrange
    const input = sectionInput({ rows: [ROW_TO_ESCAPE] });

    // Act
    const { text } = renderVerdictSection(input);

    // Assert
    const line = text.split("\n").find((l) => l.startsWith("| Major"));
    strictEqual(line, `| Major | Test | a | b | c · next | x / y | ${"z".repeat(299)}… |`);
  });

  it("puts the overflow lines after the table", () => {
    // Arrange
    const input = sectionInput({ rows: Array.from({ length: 9 }, () => minor) });

    // Act
    const lines = renderVerdictSection(input).text.split("\n");

    // Assert
    strictEqual(lines[14], "+1 more Minor on Simplification");
  });

  it("parses back with verdict-format", () => {
    // Arrange
    const { text } = renderVerdictSection(parseBackSection());

    // Act
    const parsed = parseVerdictFile(writeVerdictFile(null, text, "full"));

    // Assert
    deepStrictEqual(parsed.problems, []);
    strictEqual(parsed.sections.length, 1);
    const s = parsed.sections[0];
    deepStrictEqual([s.prefix, s.batch, s.when, s.mode, s.verdict], ["DEMO", "F2", "2026-10-22 14:05", "full", "GAPS"]);
    deepStrictEqual(s.rows.map((r) => [r.severity, r.axis, r.gap]), PARSED_BACK_ROWS);
    deepStrictEqual(s.validations, ["`v` — exit 0, scope s, 4 tests"]);
    deepStrictEqual(s.notRun, ["Placement — unclear"]);
  });

  it("parses back with the learning pass's reading", () => {
    // Arrange
    const { text } = renderVerdictSection(parseBackSection());

    // Act
    const rows = gapRowsAsTheLearningPassReadsThem(text);

    // Assert
    deepStrictEqual(rows, LEARNING_PASS_ROWS);
  });
});

describe("writeVerdictFile", () => {
  for (const c of REPLACE_CASES) {
    it(`replaces the file in ${c.mode}`, () => {
      // Arrange
      const { section, mode } = c;

      // Act
      const file = writeVerdictFile("old\n", section, mode);

      // Assert
      strictEqual(file, "new\n");
    });
  }

  it("appends on resume and keeps the earlier section byte for byte", () => {
    // Arrange
    const first = renderVerdictSection(sectionInput({ rows: [major] })).text;
    const second = renderVerdictSection(sectionInput({ when: "2026-10-22 15:00", mode: "resume" })).text;

    // Act
    const file = writeVerdictFile(`${first}\n\n`, second, "resume");

    // Assert
    ok(file.startsWith(first));
    strictEqual(file, `${first}\n${second}`);
  });

  it("appends on resume a section verdict-format reads after the earlier one", () => {
    // Arrange
    const first = renderVerdictSection(sectionInput({ rows: [major] })).text;
    const second = renderVerdictSection(sectionInput({ when: "2026-10-22 15:00", mode: "resume" })).text;
    const file = writeVerdictFile(`${first}\n\n`, second, "resume");

    // Act
    const parsed = parseVerdictFile(file);

    // Assert
    deepStrictEqual(parsed.sections.map((s) => s.verdict), ["GAPS", "VALID"]);
  });

  it("writes the section alone on resume without a previous file", () => {
    // Arrange
    const previous = null;

    // Act
    const file = writeVerdictFile(previous, "s\n", "resume");

    // Assert
    strictEqual(file, "s\n");
  });
});
