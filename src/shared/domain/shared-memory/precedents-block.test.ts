// The "## Precedents" block (M-3): markers, bounds, grouping, cut line. Run:
//   node --test src/shared/domain/shared-memory/precedents-block.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { MAX_PRECEDENTS, MAX_PRECEDENTS_CHARS, buildPrecedentsBlock, precedentLines } from "./precedents-block.ts";
import type { Precedent } from "./precedents-block.ts";
import type { EntryType, MemoryEntry } from "./entry.ts";

// tests/doubles/memory-entries.ts's sampleEntry, here because a domain test imports the domain only.
const ENTRY_BODY = "## Context\nA sentence of context.\n\n## Content\nThe rule itself.\n\n## Evidence\n`src/app/main.ts:10`\n";
function sampleEntry(type: EntryType, slug: string, over: Partial<MemoryEntry> = {}): MemoryEntry {
  const project = over.project ?? "shop";
  const date = over.date ?? "2026-10-22";
  const entry: MemoryEntry = {
    id: `${project}-${type}-${date.replace(/-/g, "")}-${slug}`, type, title: `Title of ${slug}`, project, date,
    topic: slug, appliesWhen: "a module does the thing", rationale: "it went wrong before",
    source: type === "mistake" || type === "code-structure" ? "audit:workbench/shop/SHOP-VERIFY-F1.md" : "human:2026-10-22 /memory-admit",
    status: "admitted", supersedes: [], tags: ["testing"], stack: ["typescript"], body: ENTRY_BODY,
  };
  if (type === "mistake") {
    entry.correction = "do the other thing";
    entry.detectionSignal = "a red test on the edge case";
  }
  return { ...entry, ...over, id: over.id ?? entry.id };
}

const p = (entry: Precedent["entry"], score: number): Precedent => ({ entry, path: `/workspace/m/entries/${entry.type}/${entry.id}.md`, score });

describe("buildPrecedentsBlock", () => {
  it("is empty when nothing was recalled", () => strictEqual(buildPrecedentsBlock([]), ""));

  it("carries the pinned markers of the five rules in its intro", () => {
    const block = buildPrecedentsBlock([p(sampleEntry("method", "a"), 0.9)]);
    ok(block.startsWith("## Precedents\n"), block);
    for (const marker of ["precedents from other work, not rules", "name the precedent you follow or set aside",
      "projects disagree", "a signal to check"]) ok(block.includes(marker), marker);
  });

  it("renders a precedent in six lines at most, a mistake with its correction and signal", () => {
    const lines = precedentLines(p(sampleEntry("mistake", "loop"), 1));
    strictEqual(lines.length, 6);
    ok(lines[0].startsWith("- shop-mistake-20261022-loop · mistake · shop · 2026-10-22: "), lines[0]);
    ok(lines.some((l) => l === "  correction: do the other thing"));
    ok(lines.some((l) => l === "  signal: a red test on the edge case"));
    strictEqual(precedentLines(p(sampleEntry("decision", "d"), 1)).length, 4);
  });

  it("keeps five precedents, best first, and counts the others", () => {
    const many = Array.from({ length: 8 }, (_, i) => p(sampleEntry("method", `m${i}`), i / 10));
    const block = buildPrecedentsBlock(many);
    strictEqual((block.match(/^- /gm) ?? []).length, MAX_PRECEDENTS);
    ok(block.indexOf("shop-method-20261022-m7") < block.indexOf("shop-method-20261022-m6"));
    ok(!block.includes("shop-method-20261022-m2 "), block);
    ok(block.endsWith("3 more precedents not shown."), block);
  });

  it("stays within its character bound", () => {
    const long = "x".repeat(1_500);
    const many = Array.from({ length: 5 }, (_, i) => p(sampleEntry("method", `l${i}`, { rationale: long }), 1 - i / 10));
    const block = buildPrecedentsBlock(many);
    ok(block.length <= MAX_PRECEDENTS_CHARS, String(block.length));
    ok(/\d more precedents? not shown\.$/.test(block), block.slice(-60));
  });

  it("shows a topic two projects hold as one slot, newest first, under 'projects disagree'", () => {
    const shop = sampleEntry("decision", "money", { project: "shop", date: "2026-09-01" });
    const billing = sampleEntry("decision", "money", { project: "billing", date: "2026-10-12" });
    const block = buildPrecedentsBlock([p(shop, 0.9), p(billing, 0.2), ...Array.from({ length: 5 }, (_, i) =>
      p(sampleEntry("method", `o${i}`), 0.5))]);
    ok(block.includes("Topic money — projects disagree:"), block);
    ok(block.indexOf("billing-decision") < block.indexOf("shop-decision"), block);
    strictEqual((block.match(/^- /gm) ?? []).length, 6, "the disagreement counts as one slot of five");
    ok(block.endsWith("1 more precedent not shown."), block);
  });
});
