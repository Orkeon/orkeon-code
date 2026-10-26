// A batch's spend of tool calls and the guard that refuses every call past it. Run:
//   node --test tests/shared/application/dev/spend.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { spendGuard } from "../../../../src/shared/application/dev/spend.ts";
import { FILE_READ_CALL, guardedAct } from "./spend.fixtures.ts";

describe("createSpend and spendGuard", () => {
  it("lets the first call through", async () => {
    // Arrange
    const { act } = guardedAct(2);

    // Act
    const verdict = await act.onToolCall(FILE_READ_CALL);

    // Assert
    strictEqual(verdict, "allow");
  });

  it("lets a call through up to the bound", async () => {
    // Arrange
    const { act } = guardedAct(2);
    await act.onToolCall(FILE_READ_CALL);

    // Act
    const verdict = await act.onToolCall(FILE_READ_CALL);

    // Assert
    strictEqual(verdict, "allow");
  });

  it("denies a call past the bound, the batch's spend counted", async () => {
    // Arrange
    const { spend, act, counter } = guardedAct(2);
    await act.onToolCall(FILE_READ_CALL);
    await act.onToolCall(FILE_READ_CALL);

    // Act
    const verdict = await act.onToolCall(FILE_READ_CALL);

    // Assert
    deepStrictEqual(verdict, { deny: "budget: this batch has spent its 2 tool calls; end the act and say what is left" });
    deepStrictEqual([counter.reached, spend.calls(), spend.exhausted()], [2, 2, true]);
  });

  it("is not spent by a batch whose calls reached the bound with none denied", async () => {
    // Arrange
    const { spend, act } = guardedAct(2);
    await act.onToolCall(FILE_READ_CALL);

    // Act
    await act.onToolCall(FILE_READ_CALL);

    // Assert
    deepStrictEqual([spend.calls(), spend.exhausted()], [2, false]);
  });

  it("is the callbacks themselves without a spend", () => {
    // Arrange
    const callbacks = { forAct: () => ({ onToolCall: async () => "allow" as const, onToolResult: async () => undefined }) };

    // Act
    const guarded = spendGuard(callbacks, undefined);

    // Assert
    strictEqual(guarded, callbacks);
  });
});
