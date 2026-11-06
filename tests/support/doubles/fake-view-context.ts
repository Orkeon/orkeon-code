// FakeViewContext: the command context showView renders into. Each call lands in `calls`, in order, as
// [method, ...arguments]; `continue` answers "result". `hasBlocks` false plays a runtime without `writeBlock`.
import type { ViewContext } from "../../../src/commands/_lib/view.ts";

export class FakeViewContext implements ViewContext<string> {
  calls: unknown[][] = [];
  hasBlocks = true;

  writeLine(text: string): void {
    this.calls.push(["writeLine", text]);
  }

  get writeBlock(): ViewContext<string>["writeBlock"] {
    return this.hasBlocks ? (spec) => void this.calls.push(["writeBlock", spec]) : undefined;
  }

  table(rows: readonly object[]): void {
    this.calls.push(["table", rows]);
  }

  continue(...message: string[]): string {
    this.calls.push(["continue", ...message]);
    return "result";
  }
}
