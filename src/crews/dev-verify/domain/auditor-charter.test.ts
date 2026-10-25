// The auditor's charter runs, offers its five read tools and nothing that writes. Run:
//   node --test src/crews/dev-verify/domain/auditor-charter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { AUDITOR_CHARTER, AUDITOR_TOOLS } from "./auditor-charter.ts";
import { charterCatalogue, charterProblems } from "../../../shared/domain/agents/charter.ts";

describe("AUDITOR_CHARTER", () => {
  it("can run", () => {
    // Arrange
    const charter = AUDITOR_CHARTER;

    // Act
    const problems = charterProblems(charter);

    // Assert
    deepStrictEqual(problems, []);
  });

  it("is named dev-auditor and acts in plan", () => {
    // Arrange
    const charter = AUDITOR_CHARTER;

    // Act
    const { name, mode } = charter;

    // Assert
    strictEqual(name, "dev-auditor");
    strictEqual(mode, "plan");
  });

  it("names exactly the five read tools", () => {
    // Arrange
    const expected = ["file_read", "node_read", "codebase_search", "symbol_detail", "symbol_source"];

    // Act
    const tools = AUDITOR_TOOLS;

    // Assert
    deepStrictEqual(tools, expected);
  });

  it("offers exactly the five read tools", () => {
    // Arrange
    const charter = AUDITOR_CHARTER;

    // Act
    const catalogue = charterCatalogue(charter);

    // Assert
    deepStrictEqual(catalogue, [...AUDITOR_TOOLS]);
  });

  it("offers no shell, no write, no ingest", () => {
    // Arrange
    const forbidden = ["shell_command", "file_write", "rag_ingest"];

    // Act
    const catalogue = charterCatalogue(AUDITOR_CHARTER);

    // Assert
    for (const tool of forbidden) ok(!catalogue.includes(tool), tool);
  });
});
