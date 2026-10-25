// The host provider's name read from the command context's llm service. Run:
//   node --test src/shared/infrastructure/orkeon/host-provider.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { readHostProvider } from "./host-provider.ts";
import { PROVIDER_CASES } from "./host-provider.fixtures.ts";

describe("readHostProvider", () => {
  for (const c of PROVIDER_CASES) {
    it(c.name, () => {
      // Arrange
      const { services } = c;

      // Act
      const provider = readHostProvider(services);

      // Assert
      strictEqual(provider, c.expected);
    });
  }
});
