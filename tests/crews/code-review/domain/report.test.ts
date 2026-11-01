// Run: node --test tests/crews/code-review/domain/report.test.ts
// Covers the dedup→rank→render path end-to-end (rank via shared/severity).
import { describe, it } from "node:test";
import { ok } from "node:assert";

import { renderReport } from "../../../../src/crews/code-review/domain/report.ts";
import { dedupAndRank } from "../../../../src/shared/domain/severity.ts";
import { BARE_FINDING, CUT, NIT_AND_BLOCKER, PLAUSIBLE_FINDING } from "./report.fixtures.ts";
import { assertBefore, assertMentions, assertOmits } from "../../../support/assertions/text.ts";

describe("renderReport", () => {
  it("renders the empty-findings report", () => {
    // Arrange
    const findings: [] = [];

    // Act
    const md = renderReport("--staged", 0, findings);

    // Assert
    ok(md.startsWith("# Code Review Report"));
    assertMentions(md, ["- Findings: 0", "No issues found. ✅"]);
  });

  it("renders ranked findings with severity headers + suggestion", () => {
    // Arrange
    const ranked = dedupAndRank(NIT_AND_BLOCKER);

    // Act
    const md = renderReport("HEAD~1..HEAD", 2, ranked);

    // Assert
    // blocker ranked above nit
    assertBefore(md, "[BLOCKER] b.ts:9", "[NIT] a.ts:2");
    assertMentions(md, ["**Suggestion:** use params", "- Findings: 2"]);
  });

  it("falls back to lens/'?' for missing category/line", () => {
    // Arrange
    const findings = [BARE_FINDING];

    // Act
    const md = renderReport("--staged", 1, findings);

    // Assert
    ok(md.includes("c.ts:? — correctness"));
  });
});

describe("renderReport scope header (B-3)", () => {
  it("prints the scope description verbatim, path restriction included", () => {
    // Arrange
    const scope = "staged changes, restricted to 2 path(s): a.ts, b.ts";

    // Act
    const out = renderReport(scope, 2, []);

    // Assert
    ok(out.includes("- Scope: `staged changes, restricted to 2 path(s): a.ts, b.ts`"), out);
  });

  it("no longer calls a path restriction a 'Range'", () => {
    // The header said "Range" while the value could be a path list — a label that
    // is wrong for half its inputs.
    // Arrange
    const scope = "staged changes";

    // Act
    const out = renderReport(scope, 0, []);

    // Assert
    ok(!out.includes("Range:"));
  });
});

describe("renderReport — a plausible finding (F3-1)", () => {
  it("marks a plausible finding's heading after its severity", () => {
    // Arrange
    const findings = [PLAUSIBLE_FINDING];

    // Act
    const md = renderReport("--staged", 1, findings);

    // Assert
    assertMentions(md, ["### [HIGH] (plausible) d.ts:4 — null-check"]);
  });

  it("leaves the heading of a shown finding unmarked", () => {
    // Arrange
    const findings = [{ ...PLAUSIBLE_FINDING, confidence: "shown" as const }];

    // Act
    const md = renderReport("--staged", 1, findings);

    // Assert
    assertMentions(md, ["### [HIGH] d.ts:4 — null-check"]);
  });
});

describe("renderReport — a cut diff (F3-7)", () => {
  it("says in the header how much of the diff was not reviewed", () => {
    // Arrange
    const findings = [BARE_FINDING];

    // Act
    const md = renderReport("--staged", 1, findings, undefined, CUT);

    // Assert
    assertMentions(md, ["- Diff: cut after 12000 characters, 3400 characters not reviewed"]);
  });

  it("limits an empty review of a cut diff to the part reviewed", () => {
    // Arrange
    const findings: [] = [];

    // Act
    const md = renderReport("--staged", 1, findings, undefined, CUT);

    // Assert
    assertMentions(md, ["No issues found in the part reviewed."]);
    assertOmits(md, ["No issues found. ✅"]);
  });

  it("prints no diff line when the diff was not cut", () => {
    // Arrange
    const findings: [] = [];

    // Act
    const md = renderReport("--staged", 1, findings);

    // Assert
    assertOmits(md, ["- Diff:"]);
  });
});

describe("renderReport — a capped report (F3-12)", () => {
  it("says how many less severe findings the cap left out", () => {
    // Arrange
    const findings = [BARE_FINDING];

    // Act
    const md = renderReport("--staged", 1, findings, undefined, undefined, 4);

    // Assert
    assertMentions(md, ["- Findings: 1 (4 less severe left out)"]);
  });
});
