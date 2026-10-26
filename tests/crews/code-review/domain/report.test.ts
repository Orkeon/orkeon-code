// Run: node --test tests/crews/code-review/domain/report.test.ts
// Covers the dedup→rank→render path end-to-end (rank via shared/severity).
import { describe, it } from "node:test";
import { ok } from "node:assert";

import { renderReport } from "../../../../src/crews/code-review/domain/report.ts";
import { dedupAndRank } from "../../../../src/shared/domain/severity.ts";
import { BARE_FINDING, NIT_AND_BLOCKER } from "./report.fixtures.ts";
import { assertBefore, assertMentions } from "../../../support/assertions/text.ts";

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
