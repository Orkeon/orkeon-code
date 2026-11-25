// How many chat accounts a `chat_accounts` result declares. Run:
//   node --test tests/shared/domain/agent-policy/chat-accounts.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { declaredChatAccounts } from "../../../../src/shared/domain/agent-policy/chat-accounts.ts";
import { DECLARED_ACCOUNTS_CASES } from "./chat-accounts.fixtures.ts";

describe("declaredChatAccounts", () => {
  for (const c of DECLARED_ACCOUNTS_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const declared = declaredChatAccounts(raw);

      // Assert
      strictEqual(declared, c.declared);
    });
  }
});
