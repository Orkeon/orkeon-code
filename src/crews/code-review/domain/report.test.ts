// Run: node --test src/crews/code-review/domain/report.test.ts
// Covers the dedup→rank→render path end-to-end (rank via shared/severity).
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import { renderReport } from "./report.ts";
import { dedupAndRank } from "../../../shared/domain/severity.ts";
import type { Finding } from "../../../shared/domain/types.ts";

describe("renderReport", () => {
  it("renders the empty-findings report", () => {
    const md = renderReport("--staged", 0, []);
    ok(md.startsWith("# Code Review Report"));
    ok(md.includes("- Findings: 0"));
    ok(md.includes("No issues found. ✅"));
  });

  it("renders ranked findings with severity headers + suggestion", () => {
    const groups = [
      { lens: "style", findings: [{ severity: "nit", file: "a.ts", line: 2, finding: "naming" } as Finding] },
      { lens: "security", findings: [{ severity: "blocker", file: "b.ts", line: 9, finding: "sqli", suggestion: "use params" } as Finding] },
    ];
    const ranked = dedupAndRank(groups);
    const md = renderReport("HEAD~1..HEAD", 2, ranked);
    // blocker ranked above nit
    ok(md.indexOf("[BLOCKER] b.ts:9") < md.indexOf("[NIT] a.ts:2"));
    ok(md.includes("**Suggestion:** use params"));
    ok(md.includes("- Findings: 2"));
  });

  it("falls back to lens/'?' for missing category/line", () => {
    const md = renderReport("--staged", 1, [{ severity: "low", file: "c.ts", finding: "x", lens: "correctness" } as Finding]);
    ok(md.includes("c.ts:? — correctness"));
  });
});

describe("renderReport scope header (B-3)", () => {
  it("prints the scope description verbatim, path restriction included", () => {
    const out = renderReport("staged changes, restricted to 2 path(s): a.ts, b.ts", 2, []);
    ok(out.includes("- Scope: `staged changes, restricted to 2 path(s): a.ts, b.ts`"), out);
  });

  it("no longer calls a path restriction a 'Range'", () => {
    // The header said "Range" while the value could be a path list — a label that
    // is wrong for half its inputs.
    ok(!renderReport("staged changes", 0, []).includes("Range:"));
  });
});
