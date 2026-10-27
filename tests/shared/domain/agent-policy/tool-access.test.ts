// The access Orkeon declares for one call of github, http_api and the tools that read whatever the call (Orkeon #219). Run:
//   node --test tests/shared/domain/agent-policy/tool-access.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { declaredAccess } from "../../../../src/shared/domain/agent-policy/tool-access.ts";
import { ACCESS_CASES } from "./tool-access.fixtures.ts";

describe("declaredAccess", () => {
  for (const c of ACCESS_CASES) {
    it(c.name, () => {
      // Arrange
      const { tool, input } = c;

      // Act
      const access = declaredAccess(tool, input);

      // Assert
      strictEqual(access, c.access);
    });
  }
});
