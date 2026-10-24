// Verdict file parser, over the demo work folder. Run:
//   node --test src/shared/domain/dev/verdict-format.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { AUDIT_UNFINISHED_GAP, isUnfinishedSection, lastFinishedVerdict, parseVerdictFile, lastVerdict, severityCounts } from "./verdict-format.ts";

const fixture = (name: string): string =>
  readFileSync(new URL(`../../../../tests/fixtures/dev/workbench/demo/${name}`, import.meta.url), "utf8");

describe("parseVerdictFile over DEMO-VERIFY-F1.md", () => {
  const file = parseVerdictFile(fixture("DEMO-VERIFY-F1.md"));

  it("reads one VALID section with its minor and its lines", () => {
    strictEqual(file.sections.length, 1);
    const s = file.sections[0];
    deepStrictEqual([s.prefix, s.batch, s.when, s.mode, s.verdict, s.none, s.line],
      ["DEMO", "F1", "2026-10-20 14:02", "fast", "VALID", false, 1]);
    deepStrictEqual(severityCounts(s), { Blocking: 0, Major: 0, Minor: 1 });
    strictEqual(s.rows[0].axis, "Naming");
    strictEqual(s.rows[0].evidence, "`plan-format.ts:40`");
    deepStrictEqual(s.validations, ["`npm test` — exit 0, whole suite, 812 tests"]);
    deepStrictEqual(s.notRun, ["smoke runtime — no runtime in the container"]);
    strictEqual(s.measure, undefined);
    deepStrictEqual(file.problems, []);
  });
});

describe("parseVerdictFile over DEMO-VERIFY-F2.md", () => {
  const file = parseVerdictFile(fixture("DEMO-VERIFY-F2.md"));

  it("reads both sections, the resume being the last verdict", () => {
    deepStrictEqual(file.sections.map((s) => [s.when, s.mode, s.verdict]),
      [["2026-10-21 09:10", "fast", "GAPS"], ["2026-10-21 09:40", "resume", "GAPS"]]);
    const last = lastVerdict(file);
    strictEqual(last?.mode, "resume");
    strictEqual(last?.measure, "duration 00:34, turns 41, subagents 3");
    deepStrictEqual(severityCounts(file.sections[0]), { Blocking: 1, Major: 1, Minor: 0 });
    deepStrictEqual(severityCounts(file.sections[1]), { Blocking: 0, Major: 1, Minor: 0 });
    deepStrictEqual(file.problems, []);
  });

  it("joins a gap cell that holds ' | ' as the learning script does", () => {
    const row = file.sections[0].rows[1];
    strictEqual(row.gap, "The table shows `open | done` for one batch");
    strictEqual(row.evidence, "`dev.ts:88`");
    strictEqual(row.expectedFix, "print the state the plan line holds");
  });

  it("parity: the Blocking and Major rows equal what the learning script would yield", () => {
    // Written by hand from the fixture: (severity, axis, gap, evidence, fix) per GAPS row.
    const expected = [
      ["Blocking", "Test", "The refusal of `a/b` is never exercised", "`tests/commands-dev.test.ts` has no such case",
        "add the case and see it fail first"],
      ["Major", "Scope", "The table shows `open | done` for one batch", "`dev.ts:88`", "print the state the plan line holds"],
      ["Major", "Scope", "The state column still merges two states", "`dev.ts:91`", "print the state the plan line holds"],
    ];
    const got = file.sections.filter((s) => s.verdict === "GAPS").flatMap((s) => s.rows)
      .filter((r) => r.severity !== "Minor").map((r) => [r.severity, r.axis, r.gap, r.evidence, r.expectedFix]);
    deepStrictEqual(got, expected);
  });
});

describe("parseVerdictFile inline", () => {
  it("reads None. under a VALID heading", () => {
    const s = parseVerdictFile("# X-VERIFY-F1 — 2026-01-02 03:04 — fast\n\n## Verdict — VALID\n\nNone.\n").sections[0];
    deepStrictEqual([s.verdict, s.none, s.rows], ["VALID", true, []]);
  });

  it("opens an untitled section for a heading before any title", () => {
    const f = parseVerdictFile("## Verdict — GAPS\n| Major | A | g | e | f |\n");
    deepStrictEqual(f.sections.map((s) => [s.prefix, s.verdict, s.line, s.rows.length]), [[undefined, "GAPS", 1, 1]]);
  });

  it("has no last verdict without a heading", () => {
    strictEqual(lastVerdict(parseVerdictFile("# X-VERIFY-F1 — 2026-01-02 03:04 — fast\n")), null);
    strictEqual(lastVerdict(parseVerdictFile("")), null);
  });

  it("skips the sections of audits the budget stopped for the last finished verdict", () => {
    const f = parseVerdictFile("# X-VERIFY-F1 — 2026-01-02 03:04 — fast\n## Verdict — GAPS\n| Major | A | g | e | f |\n" +
      `# X-VERIFY-F1 — 2026-01-02 04:04 — resume\n## Verdict — GAPS\n| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | e | f |\n`);
    strictEqual(isUnfinishedSection(lastVerdict(f)!), true);
    strictEqual(lastFinishedVerdict(f)?.when, "2026-01-02 03:04");
    strictEqual(lastFinishedVerdict(parseVerdictFile(`## Verdict — GAPS\n| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | e | f |\n`)), null);
  });

  it("reports an unknown severity and a short row", () => {
    const f = parseVerdictFile("## Verdict — GAPS\n| Severe | a | b | c | d |\n| Major | a | b |\n");
    deepStrictEqual(f.problems, [
      { line: 2, message: "unknown severity 'Severe'" },
      { line: 3, message: "malformed gap row '| Major | a | b |'" },
    ]);
  });
  it("reads a row written without edge pipes", () => {
    const f = parseVerdictFile("## Verdict — GAPS\nMajor | Test | a | b | c\n");
    deepStrictEqual(f.sections[0].rows.map((r) => [r.severity, r.axis, r.gap, r.evidence, r.expectedFix, r.line]),
      [["Major", "Test", "a", "b", "c", 2]]);
    deepStrictEqual(f.problems, []);
  });

  it("ignores prose holding a pipe without a problem", () => {
    const f = parseVerdictFile("## Verdict — GAPS\nSome prose | with a pipe\n");
    deepStrictEqual([f.sections[0].rows, f.problems], [[], []]);
  });

  it("still parses a row under a VALID heading", () => {
    const f = parseVerdictFile("# X-VERIFY-F1 — 2026-01-02 03:04 — fast\n\n## Verdict — VALID\n\n| Major | Scope | g | e | f |\n");
    deepStrictEqual(f.sections.map((s) => [s.verdict, s.rows.map((r) => r.gap)]), [["VALID", ["g"]]]);
  });
});
