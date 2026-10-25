// The reviewer's charter runs, offers its nine read tools and nothing that writes,
// runs a command or builds the index. Run:
//   node --test src/shared/domain/dev/reviewer-charter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { NEXT_BATCH_REVIEWER_CHARTER, REVIEWER_CHARTER, REVIEWER_TOOLS } from "./reviewer-charter.ts";
import { charterCatalogue, charterProblems } from "../agents/charter.ts";

describe("REVIEWER_CHARTER", () => {
  it("can run", () => {
    deepStrictEqual(charterProblems(REVIEWER_CHARTER), []);
  });

  it("is named dev-reviewer, acts in plan, 20 iterations", () => {
    strictEqual(REVIEWER_CHARTER.name, "dev-reviewer");
    strictEqual(REVIEWER_CHARTER.mode, "plan");
    strictEqual(REVIEWER_CHARTER.maxIterations, 20);
  });

  it("offers exactly the nine read tools", () => {
    deepStrictEqual(REVIEWER_TOOLS, [
      "file_read", "node_outline", "node_read", "directory_read", "codebase_search", "structural_search", "symbol_source",
      "symbol_detail", "impact_analysis",
    ]);
    deepStrictEqual(charterCatalogue(REVIEWER_CHARTER), [...REVIEWER_TOOLS]);
  });

  it("offers no shell, no write, no ingest, no index build", () => {
    const catalogue = charterCatalogue(REVIEWER_CHARTER);
    for (const tool of ["shell_command", "file_write", "rag_ingest", "index_codebase"]) ok(!catalogue.includes(tool), tool);
  });
});

describe("NEXT_BATCH_REVIEWER_CHARTER", () => {
  it("is the reviewer's charter with four read tools and eight iterations", () => {
    deepStrictEqual(charterProblems(NEXT_BATCH_REVIEWER_CHARTER), []);
    strictEqual(NEXT_BATCH_REVIEWER_CHARTER.name, REVIEWER_CHARTER.name);
    strictEqual(NEXT_BATCH_REVIEWER_CHARTER.mode, "plan");
    strictEqual(NEXT_BATCH_REVIEWER_CHARTER.maxIterations, 8);
    deepStrictEqual(charterCatalogue(NEXT_BATCH_REVIEWER_CHARTER), ["file_read", "node_outline", "node_read", "codebase_search"]);
    deepStrictEqual(NEXT_BATCH_REVIEWER_CHARTER.disallowed, REVIEWER_CHARTER.disallowed);
  });
});
