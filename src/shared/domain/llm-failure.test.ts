// The host's failure marker read as a failure, never as an answer. Run:
//   node --test src/shared/domain/llm-failure.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import { llmFailureOf } from "./llm-failure.ts";

describe("llmFailureOf", () => {
  it("reads the provider's error out of the marker", () => {
    const failure = llmFailureOf("<undefined-llm:429 Too Many Requests: rate limited>");
    ok(failure instanceof Error);
    strictEqual(failure!.name, "LlmFailure");
    strictEqual(failure!.detail, "429 Too Many Requests: rate limited");
    strictEqual(failure!.message, "the model call failed: 429 Too Many Requests: rate limited");
  });

  it("reads a marker over several lines, and an empty one", () => {
    strictEqual(llmFailureOf("<undefined-llm:line one\nline two>")!.detail, "line one\nline two");
    strictEqual(llmFailureOf("<undefined-llm:>")!.detail, "");
  });

  it("cuts a long error, as a host without a provider echoes the whole prompt", () => {
    const detail = llmFailureOf(`<undefined-llm:act:${"x".repeat(1000)}>`)!.detail;
    strictEqual(detail, `act:${"x".repeat(296)}…`);
  });

  it("takes an answer for an answer, even one that mentions the marker", () => {
    for (const answer of [
      "", "Done: the parser is fixed.", "The host answers <undefined-llm:...> when it fails.",
      "<undefined-llm:open", " <undefined-llm:x>", null, undefined, 42,
    ]) {
      strictEqual(llmFailureOf(answer), null, String(answer));
    }
  });
});
