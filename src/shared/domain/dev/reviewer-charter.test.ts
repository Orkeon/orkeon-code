// The reviewer's charter runs, offers its seven read tools and nothing that writes,
// runs a command or builds the index. Run:
//   node --test src/shared/domain/dev/reviewer-charter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { REVIEWER_CHARTER, REVIEWER_TOOLS } from "./reviewer-charter.ts";
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

  it("offers exactly the seven read tools", () => {
    deepStrictEqual(REVIEWER_TOOLS, [
      "file_read", "node_read", "directory_read", "codebase_search", "symbol_source", "symbol_detail", "impact_analysis",
    ]);
    deepStrictEqual(charterCatalogue(REVIEWER_CHARTER), [...REVIEWER_TOOLS]);
  });

  it("offers no shell, no write, no ingest, no index build", () => {
    const catalogue = charterCatalogue(REVIEWER_CHARTER);
    for (const tool of ["shell_command", "file_write", "rag_ingest", "index_codebase"]) ok(!catalogue.includes(tool), tool);
  });
});
