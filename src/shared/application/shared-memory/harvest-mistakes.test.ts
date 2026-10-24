// Mistake candidates written from audit rows (M-4). Run:
//   node --test src/shared/application/shared-memory/harvest-mistakes.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { harvestMistakes } from "./harvest-mistakes.ts";
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { appendRefused } from "../../domain/shared-memory/refused.ts";
import type { LearnRow } from "../../domain/shared-memory/verdict-rows.ts";
import { LiveListingFiles } from "../../../../tests/doubles/live-listing-files.ts";
import { entryText, sampleEntry } from "../../../../tests/doubles/memory-entries.ts";

const layout = memoryLayout(".orkeon/memory");
const memory = { layout, project: "shop" };
const clock = () => new Date("2026-10-24T10:00:00Z");
const row = (code: string, gap: string): LearnRow => ({
  id: "0123456789", batch: `${code}/F1`, severity: "Blocking", axis: "tests", gap, evidence: "src/a.ts:3", fix: "test it",
  source: `${code}/${code.toUpperCase()}-VERIFY-F1.md`, line: 4,
});
const rows = (gap: string) => ["a", "b", "c"].map((code) => row(code, gap));

describe("harvestMistakes", () => {
  it("writes one candidate per recurring gap", async () => {
    const files = new LiveListingFiles();
    const out = await harvestMistakes({ files, clock }, memory, [...rows("Empty cart untested"), row("d", "Once")]);
    deepStrictEqual(out.written, [`${layout.candidates}/shop-mistake-20261024-empty-cart-untested.md`]);
    deepStrictEqual(out.skipped, []);
  });

  it("skips a topic a mistake candidate or entry already holds", async () => {
    const files = new LiveListingFiles();
    const held = sampleEntry("mistake", "empty-cart-untested");
    files.files.set(`${layout.entries}/mistake/${held.id}.md`, entryText(held));
    const out = await harvestMistakes({ files, clock }, memory, rows("Empty cart untested"));
    deepStrictEqual(out.written, []);
    ok(out.skipped[0].includes("already holds it"));
  });

  it("names a refused topic, and harvests nothing when refused.md cannot be read", async () => {
    const files = new LiveListingFiles();
    files.files.set(layout.refused, appendRefused(null, { topic: "empty-cart-untested", project: "shop", date: "2026-10-01", motif: "no" }));
    const out = await harvestMistakes({ files, clock }, memory, rows("Empty cart untested"));
    strictEqual(out.written.length, 0);
    deepStrictEqual(out.skipped, ["empty-cart-untested: refused (refused.md)"]);
    const locked = new LiveListingFiles();
    locked.readErrors.set(layout.refused, new Error("denied"));
    const none = await harvestMistakes({ files: locked, clock }, memory, rows("Empty cart untested"));
    ok(none.skipped[0].includes("nothing harvested"));
  });
});
