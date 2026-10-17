// showView (commands/_lib/view.ts): how an entry point renders a use case's view.
// Run:
//   node --test tests/commands-view.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { showView } from "../src/commands/_lib/view.ts";

/** The command context as showView calls it, recording each call in order. */
class FakeViewContext {
  calls: unknown[][] = [];

  writeLine(text: string): void {
    this.calls.push(["writeLine", text]);
  }

  table(rows: readonly object[]): void {
    this.calls.push(["table", rows]);
  }

  continue(...message: string[]): string {
    this.calls.push(["continue", ...message]);
    return "result";
  }
}

describe("showView", () => {
  it("shows the table, then closes with the message, and returns what continue returns", () => {
    const ctx = new FakeViewContext();
    strictEqual(showView(ctx, { table: [{ a: 1 }], text: "done" }), "result");
    deepStrictEqual(ctx.calls, [["table", [{ a: 1 }]], ["continue", "done"]]);
  });

  it("closes without a message when the view has none, and shows no table when it has none", () => {
    const ctx = new FakeViewContext();
    showView(ctx, { table: [] });
    showView(ctx, { text: "usage" });
    deepStrictEqual(ctx.calls, [["table", []], ["continue"], ["continue", "usage"]]);
  });

  it("writes the lines first, in order", () => {
    const ctx = new FakeViewContext();
    showView(ctx, { lines: ["── staged changes", "diff --git a b"], text: "1 argument(s) ignored" });
    deepStrictEqual(ctx.calls, [
      ["writeLine", "── staged changes"], ["writeLine", "diff --git a b"], ["continue", "1 argument(s) ignored"],
    ]);
  });
});
