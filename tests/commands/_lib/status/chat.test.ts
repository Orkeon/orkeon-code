// /chat: the chat accounts of the session over a FakeToolCatalogue, one line per account, or the one line that says
// why none. Run:
//   node --test tests/commands/_lib/status/chat.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { runChat } from "../../../../src/commands/_lib/status/chat.ts";
import {
  CHAT_TOOLS_OFFERED, CHAT_USAGE, NO_CHAT_ACCOUNT, NO_CHAT_TOOLS,
} from "../../../../src/commands/_lib/status/messages.ts";
import { MAX_CHAT_FIELD_CHARS } from "../../../../src/shared/domain/agent-policy/chat-accounts.ts";
import { ACCOUNT_LINE_CASES, LONG_PROBLEM, THREE_ACCOUNTS, THREE_ACCOUNT_LINES, chatHost } from "./chat.fixtures.ts";

describe("runChat", () => {
  it("says this runtime has no chat tools when the host registers no chat_accounts", async () => {
    // Arrange
    const catalogue = chatHost();

    // Act
    const view = await runChat([], { catalogue });

    // Assert
    deepStrictEqual(view, { text: NO_CHAT_TOOLS });
  });

  it("says no account is declared when chat_accounts lists none", async () => {
    // Arrange
    const catalogue = chatHost({ accounts: [] });

    // Act
    const view = await runChat([], { catalogue });

    // Assert
    deepStrictEqual(view, { text: NO_CHAT_ACCOUNT });
  });

  it("lists every account with its state, then where the chat tools are offered", async () => {
    // Arrange
    const catalogue = chatHost(THREE_ACCOUNTS);

    // Act
    const view = await runChat([], { catalogue });

    // Assert
    deepStrictEqual(view, { lines: THREE_ACCOUNT_LINES, text: CHAT_TOOLS_OFFERED });
  });

  it("reads the accounts of a result given as JSON text", async () => {
    // Arrange
    const catalogue = chatHost(JSON.stringify(THREE_ACCOUNTS));

    // Act
    const view = await runChat([], { catalogue });

    // Assert
    deepStrictEqual(view.lines, THREE_ACCOUNT_LINES);
  });

  for (const c of ACCOUNT_LINE_CASES) {
    it(c.name, async () => {
      // Arrange
      const catalogue = chatHost({ accounts: [c.account] });

      // Act
      const view = await runChat([], { catalogue });

      // Assert
      deepStrictEqual(view.lines, c.lines);
    });
  }

  it(`cuts a problem at ${MAX_CHAT_FIELD_CHARS} characters`, async () => {
    // Arrange
    const catalogue = chatHost({ accounts: [{ name: "hook", provider: "TeamsWebhook", rights: "Send", ready: false, problem: LONG_PROBLEM }] });

    // Act
    const view = await runChat([], { catalogue });

    // Assert
    deepStrictEqual(view.lines, [`  hook: TeamsWebhook, Send; not ready: ${"p".repeat(MAX_CHAT_FIELD_CHARS - 1)}…`]);
  });

  it("says the call failed, plainly, when chat_accounts fails", async () => {
    // Arrange
    const catalogue = chatHost(new Error("the chat section does not bind:\n  Accounts is not an object"));

    // Act
    const view = await runChat([], { catalogue });

    // Assert
    deepStrictEqual(view, { text: "chat_accounts failed: the chat section does not bind: Accounts is not an object" });
  });

  it("calls chat_accounts with no argument", async () => {
    // Arrange
    const catalogue = chatHost({ accounts: [] });

    // Act
    await runChat([], { catalogue });

    // Assert
    deepStrictEqual(catalogue.calls, [{ name: "chat_accounts", args: {} }]);
  });

  it("answers an argument with the usage line", async () => {
    // Arrange
    const catalogue = chatHost(THREE_ACCOUNTS);

    // Act
    const view = await runChat(["login"], { catalogue });

    // Assert
    deepStrictEqual(view, { text: CHAT_USAGE });
  });

  it("calls no tool for an argument", async () => {
    // Arrange
    const catalogue = chatHost(THREE_ACCOUNTS);

    // Act
    await runChat(["login"], { catalogue });

    // Assert
    strictEqual(catalogue.calls.length, 0);
  });
});
