// How many chat accounts a `chat_accounts` result declares, the records /chat lists, and how it shows a field. Run:
//   node --test tests/shared/domain/agent-policy/chat-accounts.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  MAX_CHAT_FIELD_CHARS, chatAccounts, chatField, declaredChatAccounts,
} from "../../../../src/shared/domain/agent-policy/chat-accounts.ts";
import { ACCOUNT_RECORDS_CASES, DECLARED_ACCOUNTS_CASES } from "./chat-accounts.fixtures.ts";

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

describe("chatAccounts", () => {
  for (const c of ACCOUNT_RECORDS_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const records = chatAccounts(raw);

      // Assert
      deepStrictEqual(records, c.records);
    });
  }
});

describe("chatField", () => {
  it("puts a field on one line", () => {
    // Arrange
    const text = "  token\n expired\tat noon ";

    // Act
    const shown = chatField(text);

    // Assert
    strictEqual(shown, "token expired at noon");
  });

  it(`cuts a field at ${MAX_CHAT_FIELD_CHARS} characters, the last an ellipsis`, () => {
    // Arrange
    const text = "x".repeat(MAX_CHAT_FIELD_CHARS + 40);

    // Act
    const shown = chatField(text);

    // Assert
    strictEqual(shown, `${"x".repeat(MAX_CHAT_FIELD_CHARS - 1)}…`);
  });
});
