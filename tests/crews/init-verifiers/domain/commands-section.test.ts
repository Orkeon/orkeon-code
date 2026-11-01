// Run: node --test tests/crews/init-verifiers/domain/commands-section.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { commandsSection } from "../../../../src/crews/init-verifiers/domain/commands-section.ts";
import { COMMANDS_SECTIONS } from "./commands-section.fixtures.ts";

describe("commandsSection", () => {
  for (const c of COMMANDS_SECTIONS) {
    it(c.name, () => {
      // Arrange
      const { markdown } = c;

      // Act
      const section = commandsSection(markdown);

      // Assert
      strictEqual(section, c.section);
    });
  }
});
