// Whether the host offers the chat family, from its `chat_accounts`, over a FakeToolCatalogue. Run:
//   node --test tests/shared/application/tool-families.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { readToolFamilies } from "../../../src/shared/application/tool-families.ts";
import { chatHost, TOOL_FAMILIES_CASES } from "./tool-families.fixtures.ts";

describe("readToolFamilies", () => {
  for (const c of TOOL_FAMILIES_CASES) {
    it(c.name, async () => {
      // Arrange
      const catalogue = c.catalogue();

      // Act
      const families = await readToolFamilies(catalogue);

      // Assert
      strictEqual(families.chat, c.chat);
    });
  }

  it("calls chat_accounts with no argument", async () => {
    // Arrange
    const catalogue = chatHost({ accounts: [] });

    // Act
    await readToolFamilies(catalogue);

    // Assert
    deepStrictEqual(catalogue.calls, [{ name: "chat_accounts", args: {} }]);
  });
});
