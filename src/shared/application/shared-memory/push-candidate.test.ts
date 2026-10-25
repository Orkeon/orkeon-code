// memory_push's use case (M-4): a candidate written, or refused with nothing written. Run:
//   node --test src/shared/application/shared-memory/push-candidate.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { pushCandidate, readPushInput } from "./push-candidate.ts";
import { parseEntry } from "../../domain/shared-memory/front-matter.ts";
import { appendRefused } from "../../domain/shared-memory/refused.ts";
import { LiveListingFiles } from "../../../../tests/doubles/live-listing-files.ts";
import { CANDIDATE_PATH, ID, REFUSED_PUSHES, UNREADABLE_INPUTS, clock, input, layout, memory, racingFiles } from "./push-candidate.fixtures.ts";
import { assertEntry, assertRefused } from "./push-candidate.assertions.ts";

describe("pushCandidate", () => {
  it("writes a candidate with the default source, then the list", async () => {
    // Arrange
    const files = new LiveListingFiles();

    // Act
    const out = await pushCandidate({ files, clock }, memory, input);

    // Assert
    ok(out.ok);
    strictEqual(out.id, ID);
    strictEqual(out.path, `${layout.candidates}/${out.id}.md`);
    assertEntry(files.files.get(out.path), {
      status: "candidate", topic: "contract-tests-first", source: "human:2026-10-24 memory_push", tags: ["testing"],
    });
    const parsed = parseEntry(files.files.get(out.path)!);
    ok(parsed.ok && parsed.entry.body.includes("## Evidence\n- `src/app/main.ts:10`"));
    ok(files.files.get(layout.candidatesList)!.includes(out.id));
  });

  it("suffixes an id already taken", async () => {
    // Arrange
    const files = new LiveListingFiles();
    const first = await pushCandidate({ files, clock }, memory, input);

    // Act
    const second = await pushCandidate({ files, clock }, memory, input);

    // Assert
    ok(first.ok && second.ok);
    strictEqual(second.id, `${first.id}-2`);
  });

  it("refuses a topic an admitted entry already holds", async () => {
    // Arrange
    const files = new LiveListingFiles();
    await pushCandidate({ files, clock }, memory, input);
    await pushCandidate({ files, clock }, memory, input);
    files.files.set(`${layout.entries}/method/${ID}.md`, "admitted");

    // Act
    const third = await pushCandidate({ files, clock }, memory, input);

    // Assert
    assertRefused(third, "an admitted entry already holds");
  });

  it("refuses a secret-like file in an evidence item that holds a space", async () => {
    // Arrange
    const files = new LiveListingFiles();

    // Act
    const out = await pushCandidate({ files, clock }, memory, { ...input, evidence: [".env:3 holds the key"] });

    // Assert
    assertRefused(out, "secret-like file: .env");
  });

  for (const c of REFUSED_PUSHES) {
    it(`refuses ${c.name}, and writes nothing`, async () => {
      // Arrange
      const files = new LiveListingFiles();
      files.files.set(layout.refused, appendRefused(null, { topic: "contract-tests-first", project: "shop", date: "2026-10-01", motif: "no" }));

      // Act
      const out = await pushCandidate({ files, clock }, memory, c.input);

      // Assert
      assertRefused(out, c.says);
      strictEqual(files.writes.length, 0);
    });
  }

  it("says a write failure", async () => {
    // Arrange
    const files = new LiveListingFiles();
    files.writeFailures.set(CANDIDATE_PATH, new Error("read-only mount"));

    // Act
    const failed = await pushCandidate({ files, clock }, memory, input);

    // Assert
    assertRefused(failed, "read-only mount");
  });

  it("stops when the refused list cannot be read", async () => {
    // Arrange
    const files = new LiveListingFiles();
    files.readErrors.set(layout.refused, new Error("permission denied"));

    // Act
    const stopped = await pushCandidate({ files, clock }, memory, input);

    // Assert
    assertRefused(stopped, "refused.md cannot be read");
  });

  it("writes a wrapped rationale on one line rather than calling candidates unwritable", async () => {
    // Arrange
    const files = new LiveListingFiles();

    // Act
    const out = await pushCandidate({ files, clock }, memory, { ...input, rationale: "the slow suite\nhides the contract failure" });

    // Assert
    ok(out.ok, JSON.stringify(out));
    assertEntry(files.files.get(out.path), { rationale: "the slow suite hides the contract failure" });
  });

  it("writes again under the next id when a concurrent push overwrote its candidate", async () => {
    // Arrange
    const files = new LiveListingFiles();
    const racing = racingFiles(files, CANDIDATE_PATH);

    // Act
    const out = await pushCandidate({ files: racing, clock }, memory, input);

    // Assert
    ok(out.ok, JSON.stringify(out));
    strictEqual(out.id, `${ID}-2`);
    ok(files.files.get(CANDIDATE_PATH)!.includes("another push"));
    ok(files.files.get(`${layout.candidates}/${ID}-2.md`)!.includes("the slow suite"));
  });
});

describe("readPushInput", () => {
  for (const c of UNREADABLE_INPUTS) {
    it(`refuses the tool's input with ${c.name}`, () => {
      // Arrange
      const raw = c.input;

      // Act
      const read = readPushInput(raw);

      // Assert
      ok(!read.ok);
    });
  }

  it("reads the optional mistake fields, trimmed", () => {
    // Arrange
    const raw = { ...input, type: "mistake", correction: " do x ", detection_signal: "y" };

    // Act
    const read = readPushInput(raw);

    // Assert
    ok(read.ok);
    strictEqual(read.input.correction, "do x");
    strictEqual(read.input.detectionSignal, "y");
  });
});
