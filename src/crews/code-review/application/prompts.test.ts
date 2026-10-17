// The review-lens prompt across passes (B-9 `/passes`). Run:
//   node_modules/.bin/tsx --test crews/code-review/application/prompts.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import { LENSES } from "../domain/lenses.ts";
import { buildLensPrompt, MAX_PRIOR_FINDINGS_IN_PROMPT } from "./prompts.ts";

describe("buildLensPrompt across passes", () => {
  const lens = LENSES[0];
  const prior = [
    { lens: "correctness", severity: "high", file: "a.ts", line: 12, finding: "off-by-one" },
    { lens: "security", severity: "low", file: "b.ts", finding: "unvalidated input" },
  ] as any[];

  it("pass 1 carries no prior-findings section", () => {
    const p = buildLensPrompt(lens, "DIFF");
    ok(p.endsWith("DIFF"));
    ok(!p.includes("already reported"));
  });

  it("pass 2 asks for what the earlier passes missed, listing them", () => {
    const p = buildLensPrompt(lens, "DIFF", 2, prior);
    ok(p.includes("review pass 2"));
    ok(p.includes("do NOT repeat them"));
    ok(p.includes("a.ts:12 — off-by-one"));
    ok(p.includes("b.ts:? — unvalidated input"), p);
  });

  it("says an empty answer is valid, so pass 2 does not invent findings", () => {
    ok(buildLensPrompt(lens, "DIFF", 2, prior).includes("empty list is a valid answer"));
  });

  it("pass 2 with nothing found yet is identical to pass 1", () => {
    strictEqual(buildLensPrompt(lens, "DIFF", 2, []), buildLensPrompt(lens, "DIFF"));
  });

  it("bounds the prior list so the prompt cannot grow without limit", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ file: `f${i}.ts`, line: i, finding: `x${i}` })) as any[];
    const p = buildLensPrompt(lens, "DIFF", 2, many);
    strictEqual(p.includes(`f${MAX_PRIOR_FINDINGS_IN_PROMPT}.ts`), false);
    ok(p.includes(`f${MAX_PRIOR_FINDINGS_IN_PROMPT - 1}.ts`));
  });
});
