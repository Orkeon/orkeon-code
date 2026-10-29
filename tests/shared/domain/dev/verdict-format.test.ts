// Verdict file parser, over the demo work folder, and the next-step lines a verdict hands on. Run:
//   node --test tests/shared/domain/dev/verdict-format.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  auditCommand, closeCommand, correctionCommand, gapsFinding, gapsRoundsOf, isNextStepLine, isUnfinishedSection, lastFinishedVerdict,
  parseCorrectionLine, parseVerdictFile, lastVerdict, severityCounts,
} from "../../../../src/shared/domain/dev/verdict-format.ts";
import {
  CORRECTION_LINE_CASES, NEXT_COMMAND_CASES, NEXT_STEP_LINE_CASES, demoFile, F2_PARITY_ROWS, FINISHED_THEN_UNFINISHED, GAPS_ROUNDS, NO_FINDING, NO_HEADING, THREE_SEVERITIES, THREE_SEVERITIES_FINDING,
  UNFINISHED_ONLY,
} from "./verdict-format.fixtures.ts";

describe("parseVerdictFile over DEMO-VERIFY-F1.md", () => {
  it("reads one VALID section with its minor and its lines", () => {
    // Arrange
    const text = demoFile("DEMO-VERIFY-F1.md");

    // Act
    const file = parseVerdictFile(text);

    // Assert
    strictEqual(file.sections.length, 1);
    const s = file.sections[0];
    deepStrictEqual([s.prefix, s.batch, s.when, s.mode, s.verdict, s.none, s.line],
      ["DEMO", "F1", "2026-10-20 14:02", "fast", "VALID", false, 1]);
    strictEqual(s.rows[0].axis, "Naming");
    strictEqual(s.rows[0].evidence, "`plan-format.ts:40`");
    deepStrictEqual(s.validations, ["`npm test` — exit 0, whole suite, 812 tests"]);
    deepStrictEqual(s.notRun, ["smoke runtime — no runtime in the container"]);
    strictEqual(s.measure, undefined);
    deepStrictEqual(file.problems, []);
  });

  it("counts the section's one minor", () => {
    // Arrange
    const s = parseVerdictFile(demoFile("DEMO-VERIFY-F1.md")).sections[0];

    // Act
    const counts = severityCounts(s);

    // Assert
    deepStrictEqual(counts, { Blocking: 0, Major: 0, Minor: 1 });
  });
});

describe("parseVerdictFile over DEMO-VERIFY-F2.md", () => {
  it("reads both sections", () => {
    // Arrange
    const text = demoFile("DEMO-VERIFY-F2.md");

    // Act
    const file = parseVerdictFile(text);

    // Assert
    deepStrictEqual(file.sections.map((s) => [s.when, s.mode, s.verdict]),
      [["2026-10-21 09:10", "fast", "GAPS"], ["2026-10-21 09:40", "resume", "GAPS"]]);
    deepStrictEqual(file.problems, []);
  });

  it("takes the resume as the last verdict", () => {
    // Arrange
    const file = parseVerdictFile(demoFile("DEMO-VERIFY-F2.md"));

    // Act
    const last = lastVerdict(file);

    // Assert
    strictEqual(last?.mode, "resume");
    strictEqual(last?.measure, "duration 00:34, turns 41, subagents 3");
  });

  for (const [index, counts] of [
    [0, { Blocking: 1, Major: 1, Minor: 0 }],
    [1, { Blocking: 0, Major: 1, Minor: 0 }],
  ] as const) {
    it(`counts the severities of section ${index + 1}`, () => {
      // Arrange
      const section = parseVerdictFile(demoFile("DEMO-VERIFY-F2.md")).sections[index];

      // Act
      const result = severityCounts(section);

      // Assert
      deepStrictEqual(result, counts);
    });
  }

  it("joins a gap cell that holds ' | ' as the learning script does", () => {
    // Arrange
    const text = demoFile("DEMO-VERIFY-F2.md");

    // Act
    const row = parseVerdictFile(text).sections[0].rows[1];

    // Assert
    strictEqual(row.gap, "The table shows `open | done` for one batch");
    strictEqual(row.evidence, "`dev.ts:88`");
    strictEqual(row.expectedFix, "print the state the plan line holds");
  });

  it("parity: the Blocking and Major rows equal what the learning script would yield", () => {
    // Arrange
    const text = demoFile("DEMO-VERIFY-F2.md");

    // Act
    const file = parseVerdictFile(text);

    // Assert
    const got = file.sections.filter((s) => s.verdict === "GAPS").flatMap((s) => s.rows)
      .filter((r) => r.severity !== "Minor").map((r) => [r.severity, r.axis, r.gap, r.evidence, r.expectedFix]);
    deepStrictEqual(got, F2_PARITY_ROWS);
  });
});

describe("parseVerdictFile inline", () => {
  it("reads None. under a VALID heading", () => {
    // Arrange
    const text = "# X-VERIFY-F1 — 2026-01-02 03:04 — fast\n\n## Verdict — VALID\n\nNone.\n";

    // Act
    const s = parseVerdictFile(text).sections[0];

    // Assert
    deepStrictEqual([s.verdict, s.none, s.rows], ["VALID", true, []]);
  });

  it("opens an untitled section for a heading before any title", () => {
    // Arrange
    const text = "## Verdict — GAPS\n| Major | A | g | e | f |\n";

    // Act
    const f = parseVerdictFile(text);

    // Assert
    deepStrictEqual(f.sections.map((s) => [s.prefix, s.verdict, s.line, s.rows.length]), [[undefined, "GAPS", 1, 1]]);
  });

  for (const c of NO_HEADING) {
    it(`has no last verdict without a heading: ${c.name}`, () => {
      // Arrange
      const file = parseVerdictFile(c.text);

      // Act
      const last = lastVerdict(file);

      // Assert
      strictEqual(last, null);
    });
  }

  it("reads the section of an audit the budget stopped as unfinished", () => {
    // Arrange
    const last = lastVerdict(parseVerdictFile(FINISHED_THEN_UNFINISHED))!;

    // Act
    const unfinished = isUnfinishedSection(last);

    // Assert
    strictEqual(unfinished, true);
  });

  it("skips the sections of audits the budget stopped for the last finished verdict", () => {
    // Arrange
    const f = parseVerdictFile(FINISHED_THEN_UNFINISHED);

    // Act
    const finished = lastFinishedVerdict(f);

    // Assert
    strictEqual(finished?.when, "2026-01-02 03:04");
  });

  it("has no last finished verdict when every audit was stopped", () => {
    // Arrange
    const f = parseVerdictFile(UNFINISHED_ONLY);

    // Act
    const finished = lastFinishedVerdict(f);

    // Assert
    strictEqual(finished, null);
  });

  it("reports an unknown severity and a short row", () => {
    // Arrange
    const text = "## Verdict — GAPS\n| Severe | a | b | c | d |\n| Major | a | b |\n";

    // Act
    const f = parseVerdictFile(text);

    // Assert
    deepStrictEqual(f.problems, [
      { line: 2, message: "unknown severity 'Severe'" },
      { line: 3, message: "malformed gap row '| Major | a | b |'" },
    ]);
  });

  it("reads a row written without edge pipes", () => {
    // Arrange
    const text = "## Verdict — GAPS\nMajor | Test | a | b | c\n";

    // Act
    const f = parseVerdictFile(text);

    // Assert
    deepStrictEqual(f.sections[0].rows.map((r) => [r.severity, r.axis, r.gap, r.evidence, r.expectedFix, r.line]),
      [["Major", "Test", "a", "b", "c", 2]]);
    deepStrictEqual(f.problems, []);
  });

  it("ignores prose holding a pipe without a problem", () => {
    // Arrange
    const text = "## Verdict — GAPS\nSome prose | with a pipe\n";

    // Act
    const f = parseVerdictFile(text);

    // Assert
    deepStrictEqual([f.sections[0].rows, f.problems], [[], []]);
  });

  it("still parses a row under a VALID heading", () => {
    // Arrange
    const text = "# X-VERIFY-F1 — 2026-01-02 03:04 — fast\n\n## Verdict — VALID\n\n| Major | Scope | g | e | f |\n";

    // Act
    const f = parseVerdictFile(text);

    // Assert
    deepStrictEqual(f.sections.map((s) => [s.verdict, s.rows.map((r) => r.gap)]), [["VALID", ["g"]]]);
  });
});

describe("gapsRoundsOf", () => {
  for (const c of GAPS_ROUNDS) {
    it(c.name, () => {
      // Arrange
      const text = c.text;

      // Act
      const rounds = gapsRoundsOf(text);

      // Assert
      strictEqual(rounds, c.expected);
    });
  }
});

describe("gapsFinding", () => {
  it("hands the Blocking and Major rows of the last GAPS verdict, one clause each, the Minor left out", () => {
    // Arrange
    const text = THREE_SEVERITIES;

    // Act
    const finding = gapsFinding(text);

    // Assert
    strictEqual(finding, THREE_SEVERITIES_FINDING);
  });

  for (const c of NO_FINDING) {
    it(c.name, () => {
      // Arrange
      const text = c.text;

      // Act
      const finding = gapsFinding(text);

      // Assert
      strictEqual(finding, undefined);
    });
  }
});

describe("the next-step commands", () => {
  for (const c of NEXT_COMMAND_CASES) {
    it(c.name, () => {
      // Arrange
      const build = { correction: () => correctionCommand("demo", "F2", "Major Test: x"), close: () => closeCommand("demo", "F2"), audit: () => auditCommand("demo", "F2", c.mode) }[c.build];

      // Act
      const command = build();

      // Assert
      strictEqual(command, c.expected);
    });
  }
});

describe("parseCorrectionLine", () => {
  for (const c of CORRECTION_LINE_CASES) {
    it(c.name, () => {
      // Arrange
      const { text } = c;

      // Act
      const read = parseCorrectionLine(text);

      // Assert
      deepStrictEqual(read, c.expected);
    });
  }
});

describe("isNextStepLine", () => {
  for (const c of NEXT_STEP_LINE_CASES) {
    it(c.name, () => {
      // Arrange
      const { line } = c;

      // Act
      const next = isNextStepLine(line);

      // Assert
      strictEqual(next, c.expected);
    });
  }
});
