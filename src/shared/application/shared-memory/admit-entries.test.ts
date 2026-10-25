// The crew shared-memory-admit's use case (M-4): admissions and refusals applied, the lists, one
// ingestion. Run: node --test src/shared/application/shared-memory/admit-entries.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { admitEntries, admitReport, admittedCandidates } from "./admit-entries.ts";
import { appendRefused, parseRefused } from "../../domain/shared-memory/refused.ts";
import { ENTRY_BODY, entryText, sampleEntry } from "../../../../tests/doubles/memory-entries.ts";
import { RAW_ADMIT, SHA1, layout, memory, world, yes } from "./admit-entries.fixtures.ts";
import { assertEntry, assertFailures } from "./admit-entries.assertions.ts";

describe("admitEntries", () => {
  it("moves an admitted candidate to entries/, leaves a pointer, refreshes both lists and ingests once with prune", async () => {
    // Arrange
    const c = sampleEntry("method", "contract-first", { status: "candidate" });
    const { files, index, deps } = world(c, sampleEntry("decision", "other", { status: "candidate" }));

    // Act
    const out = await admitEntries(deps, memory, { admit: [yes(files, c.id)], refuse: [] });

    // Assert
    deepStrictEqual(out, { admitted: [c.id], refused: [], failed: [], warnings: [] });
    assertEntry(files.files.get(`${layout.entries}/method/${c.id}.md`), { status: "admitted", date: c.date });
    ok(files.files.get(`${layout.candidates}/${c.id}.md`)!.startsWith("Admitted on 2026-10-24"));
    const list = files.files.get(layout.candidatesList)!;
    ok(!list.includes(c.id) && list.includes("shop-decision-20261022-other"), list);
    ok(files.files.get(layout.index)!.includes(`| ${c.id} | method | admitted |`));
    deepStrictEqual(index.ingests, [{ collection: "memory-shop", sources: [layout.entriesGlob], prune: true }]);
  });

  it("rewrites what the entry supersedes, and warns on an id that is no admitted entry", async () => {
    // Arrange
    const old = sampleEntry("method", "old-way");
    const c = sampleEntry("method", "new-way", { status: "candidate", supersedes: [old.id, "shop-method-20200101-gone"] });
    const { files, deps } = world(c);
    files.files.set(`${layout.entries}/method/${old.id}.md`, entryText(old));

    // Act
    const out = await admitEntries(deps, memory, { admit: [yes(files, c.id)], refuse: [] });

    // Assert
    assertEntry(files.files.get(`${layout.entries}/method/${old.id}.md`), { status: "superseded", supersededBy: c.id });
    deepStrictEqual(out.warnings, [`${c.id} supersedes shop-method-20200101-gone, which is no admitted entry: left as it is`]);
  });

  it("refuses to admit a candidate edited into an invalid entry or one its source cannot admit", async () => {
    // Arrange
    const edited = sampleEntry("method", "edited", { status: "candidate", body: ENTRY_BODY.replace("src/app/main.ts:10", ".env:1") });
    const wrongSource = sampleEntry("decision", "wrong", { status: "candidate", source: "audit:a/A-VERIFY-F1.md" });
    const { files, index, deps } = world(edited, wrongSource);
    const admit = [yes(files, edited.id), yes(files, wrongSource.id), yes(files, "shop-method-20261022-absent")];

    // Act
    const out = await admitEntries(deps, memory, { admit, refuse: [] });

    // Assert
    strictEqual(out.admitted.length, 0);
    strictEqual(out.failed.length, 3);
    assertFailures(out.failed, ["secret-like file: .env", "an audit: source admits", "no candidate file"]);
    strictEqual(index.ingests.length, 0);
    strictEqual(files.writes.length, 0);
  });

  it("refuses a candidate: its topic in refused.md with the motif, a pointer, no ingestion", async () => {
    // Arrange
    const c = sampleEntry("method", "never-this", { status: "candidate" });
    const { files, index, deps } = world(c);

    // Act
    const out = await admitEntries(deps, memory, { admit: [], refuse: [{ id: c.id, motif: "too local" }] });

    // Assert
    deepStrictEqual(out.refused, [c.id]);
    deepStrictEqual(parseRefused(files.files.get(layout.refused)!).motifs.map((m) => [m.topic, m.date, m.motif]),
      [["never-this", "2026-10-24", "too local"]]);
    ok(files.files.get(`${layout.candidates}/${c.id}.md`)!.startsWith("Refused on"));
    strictEqual(index.ingests.length, 0);
  });

  it("refuses to admit a candidate refused before: it is no candidate entry any more", async () => {
    // Arrange
    const c = sampleEntry("method", "never-this", { status: "candidate" });
    const { files, deps } = world(c);
    await admitEntries(deps, memory, { admit: [], refuse: [{ id: c.id, motif: "too local" }] });

    // Act
    const again = await admitEntries(deps, memory, { admit: [yes(files, c.id)], refuse: [] });

    // Assert
    assertFailures(again.failed, ["not a candidate entry any more"]);
  });

  it("keeps the admission when the ingestion fails, and says the index is stale", async () => {
    // Arrange
    const c = sampleEntry("method", "kept", { status: "candidate" });
    const { files, index, deps } = world(c);
    index.ingestFailure = new Error("rag: no embedder\nstack");

    // Act
    const out = await admitEntries(deps, memory, { admit: [yes(files, c.id)], refuse: [] });

    // Assert
    deepStrictEqual(out.admitted, [c.id]);
    ok(files.files.has(`${layout.entries}/method/${c.id}.md`));
    deepStrictEqual(out.warnings, ["the index of memory-shop is stale (rag: no embedder): the next admission re-ingests entries/"]);
  });

  it("admits only the text confirmed, never a refused topic", async () => {
    // Arrange
    const c = sampleEntry("method", "changed", { status: "candidate" });
    const r = sampleEntry("method", "refused-later", { status: "candidate" });
    const { files, deps } = world(c, r);
    const shown = yes(files, c.id);
    files.files.set(`${layout.candidates}/${c.id}.md`, entryText({ ...c, status: "candidate", rationale: "edited after the yes" }));
    files.files.set(layout.refused, appendRefused(null, { topic: "refused-later", project: "shop", date: "2026-10-01", motif: "no" }));

    // Act
    const out = await admitEntries(deps, memory, { admit: [shown, yes(files, r.id)], refuse: [] });

    // Assert
    deepStrictEqual(out.admitted, []);
    assertFailures(out.failed, ["changed since it was confirmed", "was refused"]);
  });

  it("leaves a foreign INDEX.md alone, and says so", async () => {
    // Arrange
    const fine = sampleEntry("method", "fine", { status: "candidate" });
    const { files, deps } = world(fine);
    files.files.set(layout.index, "# My project's index\n");

    // Act
    const done = await admitEntries(deps, memory, { admit: [yes(files, fine.id)], refuse: [] });

    // Assert
    deepStrictEqual(done.admitted, [fine.id]);
    strictEqual(files.files.get(layout.index), "# My project's index\n");
    ok(done.warnings[0].includes("is not the memory's"), done.warnings[0]);
  });

  it("reads the crew's input: valid admissions once each, the rest dropped", () => {
    // Arrange
    const input = RAW_ADMIT;

    // Act
    const admitted = admittedCandidates(input);

    // Assert
    deepStrictEqual(admitted, [{ id: "a-b", sha1: SHA1 }]);
  });

  it("reads no admission from no input", () => {
    // Arrange
    const input = null;

    // Act
    const admitted = admittedCandidates(input);

    // Assert
    deepStrictEqual(admitted, []);
  });

  it("reports one line per decision", () => {
    // Arrange
    const out = { admitted: ["x"], refused: [], failed: ["y: no"], warnings: ["w"] };

    // Act
    const report = admitReport(out);

    // Assert
    strictEqual(report, "admitted x\nnot applied: y: no\nwarning: w");
  });

  it("reports nothing to apply when no decision was made", () => {
    // Arrange
    const out = { admitted: [], refused: [], failed: [], warnings: [] };

    // Act
    const report = admitReport(out);

    // Assert
    strictEqual(report, "nothing to apply");
  });
});
