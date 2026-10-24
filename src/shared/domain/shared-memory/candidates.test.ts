// The generated lists of the shared memory (M-4). Run: node --test src/shared/domain/shared-memory/candidates.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import { CANDIDATES_TITLE, INDEX_TITLE, batchesOf, candidatesList, decidedPointer, entriesIndex } from "./candidates.ts";
import { parseEntry } from "./front-matter.ts";
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

describe("the candidates list and the index", () => {
  it("lists the candidates by id, a pipe of a cell escaped", () => {
    const b = sampleEntry("method", "beta", { status: "candidate", source: "human:2026-10-22 a | b" });
    const a = sampleEntry("mistake", "alpha", { status: "candidate", source: "audit:x/X-VERIFY-F1.md, y/Y-VERIFY-F2.md" });
    const text = candidatesList([b, a]);
    const lines = text.trimEnd().split("\n");
    strictEqual(lines[0], CANDIDATES_TITLE);
    strictEqual(lines[4], "| id | type | topic | source | batches |");
    ok(lines[7].startsWith(`| ${a.id} | mistake | alpha |`) && lines[7].endsWith("| 2 |"));
    ok(lines[6].includes("a \\| b") && lines[6].endsWith("| - |"), "method sorts before mistake");
    ok(text.endsWith("\n"));
  });

  it("counts the distinct batches a source names", () => {
    strictEqual(batchesOf("audit:x/X-VERIFY-F1.md, x/X-VERIFY-F1.md, x/X-VERIFY-F3.md"), "2");
    strictEqual(batchesOf("human:2026-10-22 memory_push"), "-");
  });

  it("indexes the entries with their status", () => {
    const text = entriesIndex([sampleEntry("decision", "b"), sampleEntry("method", "a", { status: "superseded", supersededBy: "x" })]);
    ok(text.startsWith(INDEX_TITLE));
    ok(text.includes("| shop-method-20261022-a | method | superseded | Title of a |"));
  });

  it("turns a decided candidate into a pointer that is no entry", () => {
    ok(decidedPointer("admitted", "2026-10-24", "/workspace/m/entries/method/x.md").includes("entries/method/x.md"));
    ok(decidedPointer("refused", "2026-10-24").includes("refused.md"));
    strictEqual(parseEntry(decidedPointer("admitted", "2026-10-24", "f")).ok, false);
    strictEqual(parseEntry(decidedPointer("refused", "2026-10-24")).ok, false);
  });
});
