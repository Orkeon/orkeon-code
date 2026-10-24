// Mistake candidates from audit rows (M-4). Run: node --test src/shared/domain/shared-memory/harvest.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { mistakeCandidates } from "./harvest.ts";
import { entryProblems, MAX_BODY_CHARS } from "./entry.ts";
import type { LearnRow } from "./verdict-rows.ts";

const row = (batch: string, gap: string, over: Partial<LearnRow> = {}): LearnRow => ({
  id: "0123456789", batch, severity: "Major", axis: "tests", gap, evidence: "src/a.ts:3", fix: "assert the edge case",
  source: `${batch.split("/")[0]}/${batch.split("/")[0].toUpperCase()}-VERIFY-${batch.split("/")[1]}.md`, line: 12, ...over,
});
const context = { project: "shop", date: "2026-10-24", refusedTopics: new Set<string>() };

describe("mistakeCandidates", () => {
  it("makes one valid mistake candidate of a gap seen in three batches", () => {
    const rows = [row("a/F1", "No test of the empty cart"), row("b/F2", "no test of the empty cart"), row("c/F1", "No test of the empty cart!")];
    const plan = mistakeCandidates(rows, context);
    strictEqual(plan.candidates.length, 1);
    const c = plan.candidates[0];
    strictEqual(c.id, "shop-mistake-20261024-no-test-of-the-empty-cart");
    strictEqual(c.status, "candidate");
    strictEqual(c.correction, "assert the edge case");
    ok(c.source.startsWith("audit:a/A-VERIFY-F1.md"));
    deepStrictEqual(entryProblems(c), []);
  });

  it("leaves a gap of two batches below the threshold, and one batch seen twice counts once", () => {
    const plan = mistakeCandidates([row("a/F1", "Gap"), row("a/F1", "Gap"), row("b/F1", "Gap")], context);
    deepStrictEqual(plan.candidates, []);
    deepStrictEqual(plan.below, [{ topic: "gap", batches: 2 }]);
  });

  it("names a refused topic and proposes nothing for it", () => {
    const rows = ["a/F1", "b/F1", "c/F1"].map((b) => row(b, "Gap"));
    const plan = mistakeCandidates(rows, { ...context, refusedTopics: new Set(["gap"]) });
    deepStrictEqual(plan.candidates, []);
    deepStrictEqual(plan.refused, ["gap"]);
  });

  it("keeps the body under the bound by cutting evidence lines", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(`b${i}/F1`, "Gap", { evidence: "x".repeat(150) }));
    const c = mistakeCandidates(rows, context).candidates[0];
    ok(c.body.length <= MAX_BODY_CHARS);
    ok(/- and \d+ more rows/.test(c.body));
    deepStrictEqual(entryProblems(c), []);
  });
});
