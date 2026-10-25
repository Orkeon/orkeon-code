// The command context showView renders into.

/** The command context as showView calls it, recording each call in order. */
export class FakeViewContext {
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
