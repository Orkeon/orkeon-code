// showView (commands/_lib/view.ts): how an entry point renders a use case's view.
// Run:
//   node --test src/commands/_lib/view.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { showView } from "./view.ts";
import { FakeViewContext } from "../../../tests/support/doubles/fake-view-context.ts";

describe("showView", () => {
  it("shows the table, then closes with the message, and returns what continue returns", () => {
    // Arrange
    const ctx = new FakeViewContext();

    // Act
    const result = showView(ctx, { table: [{ a: 1 }], text: "done" });

    // Assert
    strictEqual(result, "result");
    deepStrictEqual(ctx.calls, [["table", [{ a: 1 }]], ["continue", "done"]]);
  });

  it("closes without a message when the view has none", () => {
    // Arrange
    const ctx = new FakeViewContext();

    // Act
    showView(ctx, { table: [] });

    // Assert
    deepStrictEqual(ctx.calls, [["table", []], ["continue"]]);
  });

  it("shows no table when the view has none", () => {
    // Arrange
    const ctx = new FakeViewContext();

    // Act
    showView(ctx, { text: "usage" });

    // Assert
    deepStrictEqual(ctx.calls, [["continue", "usage"]]);
  });

  it("writes the lines first, in order", () => {
    // Arrange
    const ctx = new FakeViewContext();

    // Act
    showView(ctx, { lines: ["── staged changes", "diff --git a b"], text: "1 argument(s) ignored" });

    // Assert
    deepStrictEqual(ctx.calls, [
      ["writeLine", "── staged changes"], ["writeLine", "diff --git a b"], ["continue", "1 argument(s) ignored"],
    ]);
  });
});
