// The auditor's charter runs, offers its five read tools and nothing that writes. Run:
//   node --test src/crews/dev-verify/domain/auditor-charter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { AUDITOR_CHARTER, AUDITOR_TOOLS } from "./auditor-charter.ts";
import { charterCatalogue, charterProblems } from "../../../shared/domain/agents/charter.ts";

describe("AUDITOR_CHARTER", () => {
  it("can run", () => {
    deepStrictEqual(charterProblems(AUDITOR_CHARTER), []);
  });

  it("is named dev-auditor and acts in plan", () => {
    strictEqual(AUDITOR_CHARTER.name, "dev-auditor");
    strictEqual(AUDITOR_CHARTER.mode, "plan");
  });

  it("offers exactly the five read tools", () => {
    deepStrictEqual(AUDITOR_TOOLS, ["file_read", "node_read", "codebase_search", "symbol_detail", "symbol_source"]);
    deepStrictEqual(charterCatalogue(AUDITOR_CHARTER), [...AUDITOR_TOOLS]);
  });

  it("offers no shell, no write, no ingest", () => {
    const catalogue = charterCatalogue(AUDITOR_CHARTER);
    for (const tool of ["shell_command", "file_write", "rag_ingest"]) ok(!catalogue.includes(tool), tool);
  });
});
