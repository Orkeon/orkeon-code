// The crew shared-memory-admit's use case (M-4): admissions and refusals applied, the lists, one
// ingestion. Run: node --test src/shared/application/shared-memory/admit-entries.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { admitEntries, admitReport, admittedIds } from "./admit-entries.ts";
import { parseEntry } from "../../domain/shared-memory/front-matter.ts";
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { parseRefused } from "../../domain/shared-memory/refused.ts";
import type { MemoryEntry } from "../../domain/shared-memory/entry.ts";
import { LiveListingFiles } from "../../../../tests/doubles/live-listing-files.ts";
import { FakeSharedMemory } from "../../../../tests/doubles/fake-shared-memory.ts";
import { ENTRY_BODY, entryText, sampleEntry } from "../../../../tests/doubles/memory-entries.ts";

const layout = memoryLayout(".orkeon/memory");
const memory = { layout, collection: "memory-shop" };
const clock = () => new Date("2026-10-24T10:00:00Z");

function world(...candidates: MemoryEntry[]) {
  const files = new LiveListingFiles();
  for (const c of candidates) files.files.set(`${layout.candidates}/${c.id}.md`, entryText({ ...c, status: "candidate" }));
  const index = new FakeSharedMemory();
  return { files, index, deps: { files, memory: index, clock } };
}

describe("admitEntries", () => {
  it("moves an admitted candidate to entries/, leaves a pointer, refreshes both lists and ingests once with prune", async () => {
    const c = sampleEntry("method", "contract-first", { status: "candidate" });
    const { files, index, deps } = world(c, sampleEntry("decision", "other", { status: "candidate" }));
    const out = await admitEntries(deps, memory, { admit: [c.id], refuse: [] });
    deepStrictEqual(out, { admitted: [c.id], refused: [], failed: [], warnings: [] });
    const stored = parseEntry(files.files.get(`${layout.entries}/method/${c.id}.md`)!);
    ok(stored.ok && stored.entry.status === "admitted" && stored.entry.date === c.date);
    ok(files.files.get(`${layout.candidates}/${c.id}.md`)!.startsWith("Admitted on 2026-10-24"));
    const list = files.files.get(layout.candidatesList)!;
    ok(!list.includes(c.id) && list.includes("shop-decision-20261022-other"));
    ok(files.files.get(layout.index)!.includes(`| ${c.id} | method | admitted |`));
    deepStrictEqual(index.ingests, [{ collection: "memory-shop", sources: [layout.entriesGlob], prune: true }]);
  });

  it("rewrites what the entry supersedes, and warns on an id that is no admitted entry", async () => {
    const old = sampleEntry("method", "old-way");
    const c = sampleEntry("method", "new-way", { status: "candidate", supersedes: [old.id, "shop-method-20200101-gone"] });
    const { files, deps } = world(c);
    files.files.set(`${layout.entries}/method/${old.id}.md`, entryText(old));
    const out = await admitEntries(deps, memory, { admit: [c.id], refuse: [] });
    const rewritten = parseEntry(files.files.get(`${layout.entries}/method/${old.id}.md`)!);
    ok(rewritten.ok && rewritten.entry.status === "superseded" && rewritten.entry.supersededBy === c.id);
    deepStrictEqual(out.warnings, [`${c.id} supersedes shop-method-20200101-gone, which is no admitted entry: left as it is`]);
  });

  it("refuses to admit a candidate edited into an invalid entry or one its source cannot admit", async () => {
    const edited = sampleEntry("method", "edited", { status: "candidate", body: ENTRY_BODY.replace("src/app/main.ts:10", ".env:1") });
    const wrongSource = sampleEntry("decision", "wrong", { status: "candidate", source: "audit:a/A-VERIFY-F1.md" });
    const { files, index, deps } = world(edited, wrongSource);
    const out = await admitEntries(deps, memory, { admit: [edited.id, wrongSource.id, "shop-method-20261022-absent"], refuse: [] });
    strictEqual(out.admitted.length, 0);
    strictEqual(out.failed.length, 3);
    ok(out.failed[0].includes("secret-like file: .env"), out.failed[0]);
    ok(out.failed[1].includes("an audit: source admits"), out.failed[1]);
    ok(out.failed[2].includes("no candidate file"));
    strictEqual(index.ingests.length, 0);
    strictEqual(files.writes.length, 0);
  });

  it("refuses a candidate: its topic in refused.md with the motif, a pointer, no ingestion", async () => {
    const c = sampleEntry("method", "never-this", { status: "candidate" });
    const { files, index, deps } = world(c);
    const out = await admitEntries(deps, memory, { admit: [], refuse: [{ id: c.id, motif: "too local" }] });
    deepStrictEqual(out.refused, [c.id]);
    deepStrictEqual(parseRefused(files.files.get(layout.refused)!).motifs.map((m) => [m.topic, m.date, m.motif]),
      [["never-this", "2026-10-24", "too local"]]);
    ok(files.files.get(`${layout.candidates}/${c.id}.md`)!.startsWith("Refused on"));
    strictEqual(index.ingests.length, 0);
    const again = await admitEntries(deps, memory, { admit: [c.id], refuse: [] });
    ok(again.failed[0].includes("not a candidate entry any more"));
  });

  it("keeps the admission when the ingestion fails, and says the index is stale", async () => {
    const c = sampleEntry("method", "kept", { status: "candidate" });
    const { files, index, deps } = world(c);
    index.ingestFailure = new Error("rag: no embedder\nstack");
    const out = await admitEntries(deps, memory, { admit: [c.id], refuse: [] });
    deepStrictEqual(out.admitted, [c.id]);
    ok(files.files.has(`${layout.entries}/method/${c.id}.md`));
    deepStrictEqual(out.warnings, ["the index of memory-shop is stale (rag: no embedder): the next admission re-ingests entries/"]);
  });

  it("reads the crew's input and reports one line per decision", () => {
    deepStrictEqual(admittedIds({ admit: ["a-b", "a-b", "Bad Id", 3] }), ["a-b"]);
    deepStrictEqual(admittedIds(null), []);
    strictEqual(admitReport({ admitted: ["x"], refused: [], failed: ["y: no"], warnings: ["w"] }), "admitted x\nnot applied: y: no\nwarning: w");
    strictEqual(admitReport({ admitted: [], refused: [], failed: [], warnings: [] }), "nothing to apply");
  });
});
