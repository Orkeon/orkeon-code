// B-12 — the advisor crew's subject selection and prompt. Run:
//   node_modules/.bin/tsx --test crews/advisor/domain/advice.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import {
  lastExchange, buildAdvicePrompt, describeAdvisor, clip,
  MAX_ANSWER_CHARS, MAX_REQUEST_CHARS,
} from "./advice.ts";

const M = (role: string, content: string) => ({ role, content });

describe("lastExchange", () => {
  it("pairs the last assistant answer with the user turn BEFORE it", () => {
    // Not the last user message: after a /-command turn or an interrupted request,
    // the most recent user line is not the question that was answered.
    const x = lastExchange([
      M("user", "first question"),
      M("assistant", "first answer"),
      M("user", "second question"),
      M("assistant", "second answer"),
      M("user", "something typed after"),
    ]);
    strictEqual(x?.request, "second question");
    strictEqual(x?.answer, "second answer");
  });

  it("returns null when there is no assistant turn", () => {
    strictEqual(lastExchange([M("user", "hi")]), null);
    strictEqual(lastExchange([]), null);
  });

  it("skips an empty assistant turn rather than reviewing nothing", () => {
    const x = lastExchange([M("user", "q"), M("assistant", "real"), M("assistant", "   ")]);
    strictEqual(x?.answer, "real");
  });

  it("tolerates a buffer that starts mid-thread (no request found)", () => {
    const x = lastExchange([M("assistant", "orphan answer")]);
    strictEqual(x?.request, "");
    strictEqual(x?.answer, "orphan answer");
  });

  it("is case-insensitive on the role, as stores round-trip it differently", () => {
    strictEqual(lastExchange([M("USER", "q"), M("Assistant", "a")])?.request, "q");
  });
});

describe("clip", () => {
  it("leaves short text alone", () => {
    strictEqual(clip("abc", 10), "abc");
  });

  it("says how much it removed, so truncation is never silent", () => {
    const out = clip("x".repeat(20), 5);
    ok(out.startsWith("xxxxx"));
    ok(out.includes("truncated 15 chars"), out);
  });
});

describe("buildAdvicePrompt", () => {
  const exchange = { request: "do the thing", answer: "I did the thing" };

  it("carries both sides under their own headings", () => {
    const p = buildAdvicePrompt(exchange);
    ok(p.includes("## The request"));
    ok(p.includes("do the thing"));
    ok(p.includes("## The answer under review"));
    ok(p.includes("I did the thing"));
  });

  it("permits 'the answer is sound' explicitly", () => {
    // An advisor that always finds three problems is an advisor whose findings
    // carry no information.
    ok(buildAdvicePrompt(exchange).includes("If the answer is sound"));
  });

  it("asks for the worst first, so a truncated reply still leads with it", () => {
    ok(buildAdvicePrompt(exchange).includes("worst first"));
  });

  it("says the request is missing rather than pretending it was empty", () => {
    const p = buildAdvicePrompt({ request: "", answer: "a" });
    ok(p.includes("not in the buffer"), p);
  });

  it("bounds each field independently, so a long answer cannot crowd out the request", () => {
    const p = buildAdvicePrompt({ request: "r".repeat(9_000), answer: "a".repeat(40_000) });
    ok(p.includes(`truncated ${9_000 - MAX_REQUEST_CHARS} chars`));
    ok(p.includes(`truncated ${40_000 - MAX_ANSWER_CHARS} chars`));
  });
});

describe("describeAdvisor", () => {
  it("names the reviewing model when one is set", () => {
    ok(describeAdvisor("kimi-k2.6").includes("'kimi-k2.6'"));
  });

  it("calls an unset advisor a self-review, and says what to do", () => {
    // The whole value of the exercise rests on the reviewer being a different
    // model; hiding that would let a self-review pass for an independent one.
    const note = describeAdvisor("");
    ok(note.includes("self-review"));
    ok(note.includes("/advisor <model>"));
  });
});
