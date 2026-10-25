// Mistake candidates written from audit rows (M-4). Run:
//   node --test src/shared/application/shared-memory/harvest-mistakes.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { harvestMistakes } from "./harvest-mistakes.ts";
import { appendRefused } from "../../domain/shared-memory/refused.ts";
import { LiveListingFiles } from "../../../../tests/doubles/live-listing-files.ts";
import { entryText, sampleEntry } from "../../../../tests/doubles/memory-entries.ts";
import { TOPIC_GAP, clock, layout, memory, row, rows } from "./harvest-mistakes.fixtures.ts";

describe("harvestMistakes", () => {
  it("writes one candidate per recurring gap", async () => {
    // Arrange
    const files = new LiveListingFiles();
    const audit = [...rows(TOPIC_GAP), row("d", "Once")];

    // Act
    const out = await harvestMistakes({ files, clock }, memory, audit);

    // Assert
    deepStrictEqual(out.written, [`${layout.candidates}/shop-mistake-20261024-empty-cart-untested.md`]);
    deepStrictEqual(out.skipped, []);
  });

  it("skips a topic a mistake candidate or entry already holds", async () => {
    // Arrange
    const files = new LiveListingFiles();
    const held = sampleEntry("mistake", "empty-cart-untested");
    files.files.set(`${layout.entries}/mistake/${held.id}.md`, entryText(held));

    // Act
    const out = await harvestMistakes({ files, clock }, memory, rows(TOPIC_GAP));

    // Assert
    deepStrictEqual(out.written, []);
    ok(out.skipped[0].includes("already holds it"), out.skipped[0]);
  });

  it("names a refused topic", async () => {
    // Arrange
    const files = new LiveListingFiles();
    files.files.set(layout.refused, appendRefused(null, { topic: "empty-cart-untested", project: "shop", date: "2026-10-01", motif: "no" }));

    // Act
    const out = await harvestMistakes({ files, clock }, memory, rows(TOPIC_GAP));

    // Assert
    strictEqual(out.written.length, 0);
    deepStrictEqual(out.skipped, ["empty-cart-untested: refused (refused.md)"]);
  });

  it("harvests nothing when refused.md cannot be read", async () => {
    // Arrange
    const files = new LiveListingFiles();
    files.readErrors.set(layout.refused, new Error("denied"));

    // Act
    const out = await harvestMistakes({ files, clock }, memory, rows(TOPIC_GAP));

    // Assert
    ok(out.skipped[0].includes("nothing harvested"), out.skipped[0]);
  });
});
