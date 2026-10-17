/// <reference path="../../src/crews/.orkeon/orkeon.d.ts" />
// FakeLlmFacade: a stand-in for the runtime's `ctx.llm`, to test the Llm adapter of
// src/shared/infrastructure/orkeon/llm.ts. `actResult` is what act() resolves to,
// of any shape (the adapter reads whatever a host hands back); `completion` and
// `extraction` are what complete() (and chat(), as its content) and extract()
// resolve to. An Error is thrown.
// Every call lands in `calls` with the arguments it received.
type Method = "act" | "complete" | "extract" | "chat";

export class FakeLlmFacade implements Pick<LlmFacade, Method> {
  actResult: unknown = { output: "", iterations: 1 };
  completion: string | Error = "";
  extraction: unknown = {};
  calls: Array<{ method: Method; args: unknown[] }> = [];

  answer(method: Method, args: unknown[], value: unknown): unknown {
    this.calls.push({ method, args });
    if (value instanceof Error) throw value;
    return value;
  }

  async act(prompt: string, opts?: ActOptions): Promise<ActResult> {
    return this.answer("act", [prompt, opts], this.actResult) as ActResult;
  }

  async complete(prompt: string, opts?: LlmCallOptions): Promise<string> {
    return this.answer("complete", [prompt, opts], this.completion) as string;
  }

  async chat(messages: readonly Message[], opts?: LlmCallOptions): Promise<ChatResponse> {
    const content = this.answer("chat", [messages, opts], this.completion) as string;
    return { content, tokensUsed: 0, model: "" };
  }

  async extract<T>(prompt: string, schema: JsonSchema, opts?: LlmCallOptions): Promise<T> {
    return this.answer("extract", [prompt, schema, opts], this.extraction) as T;
  }
}
