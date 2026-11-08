// FakeActCallbacks: the onToolCall/onToolResult pair an act carries (ActCallbacks), scripted. `verdict` is what
// onToolCall answers, `resultAnswer` what onToolResult answers; `calls` lists each call onToolCall received,
// `results` each call and result onToolResult received.
import type { ActCallbacks, ToolCallVerdict } from "../../../src/shared/application/dev/tool-callbacks.ts";

export class FakeActCallbacks implements ActCallbacks {
  verdict: ToolCallVerdict = "allow";
  resultAnswer: void | { context: string } = undefined;
  calls: Array<{ name: string; input: unknown }> = [];
  results: Array<{ call: { name: string; input: unknown }; result: unknown }> = [];

  async onToolCall(call: { name: string; input: unknown }): Promise<ToolCallVerdict> {
    this.calls.push(call);
    return this.verdict;
  }

  async onToolResult(call: { name: string; input: unknown }, result: unknown): Promise<void | { context: string }> {
    this.results.push({ call, result });
    return this.resultAnswer;
  }
}
