// The /summary request. Run: node --test src/shared/domain/session-summary.test.ts
import { describe, it } from "node:test";
import { ok } from "node:assert";

import { SUMMARY_PROMPT } from "./session-summary.ts";

describe("SUMMARY_PROMPT", () => {
  it("leads with where things stand, then fixed headings, bounded", () => {
    ok(SUMMARY_PROMPT.includes("Start with where things stand"));
    for (const part of ["decisions taken", "files touched", "still open"]) ok(SUMMARY_PROMPT.includes(part), part);
    ok(SUMMARY_PROMPT.includes("a few short bullets"));
  });
  it("says why no tool is needed and covers the compacted turns", () => {
    ok(SUMMARY_PROMPT.includes("calling a tool would only spend this turn"));
    ok(SUMMARY_PROMPT.includes("[compacted]"));
  });
  it("follows the conversation's language and reports checks as last seen", () => {
    ok(SUMMARY_PROMPT.includes("language of the conversation"));
    ok(SUMMARY_PROMPT.includes("only as it was last seen"));
  });
});
