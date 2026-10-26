// The shared memory's files as the use cases read and write them: a file read or found absent, the pending
// candidates, the refused topics, a candidate's file, and INDEX.md regenerated. Over FakeFiles. Run:
//   node --test tests/shared/application/shared-memory/memory-files.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";

import { pendingCandidates, readOrNull, refreshIndexFile, refusedTopics, writeCandidateFile } from "../../../../src/shared/application/shared-memory/memory-files.ts";
import { CANDIDATE_A, DECISION, PENDING_IDS, REFRESH_CASES, candidatesFolder, layout, oneEntry, refusedFile } from "./memory-files.fixtures.ts";
import { assertEntryWritten, assertListNames } from "./memory-files.assertions.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { candidatePath } from "../../../../src/shared/domain/shared-memory/layout.ts";

describe("readOrNull", () => {
  it("reads a file that does not exist as null", async () => {
    // Arrange
    const files = new FakeFiles();

    // Act
    const text = await readOrNull(files, layout.refused);

    // Assert
    strictEqual(text, null);
  });

  it("gives the text of a file that exists", async () => {
    // Arrange
    const files = refusedFile();

    // Act
    const text = await readOrNull(files, layout.refused);

    // Assert
    strictEqual(text, files.files.get(layout.refused));
  });

  it("throws on a file that exists but cannot be read", async () => {
    // Arrange
    const files = new FakeFiles();
    files.readErrors.set(layout.refused, new Error("permission denied"));

    // Act
    const reading = readOrNull(files, layout.refused);

    // Assert
    await rejects(reading, /permission denied/);
  });
});

describe("pendingCandidates", () => {
  it("gives the candidates in the order of their file names, leaving out any other file", async () => {
    // Arrange
    const files = candidatesFolder();

    // Act
    const pending = await pendingCandidates(files, layout);

    // Assert
    deepStrictEqual(pending.map((c) => c.entry.id), PENDING_IDS);
  });

  it("reads an absent candidates folder as no candidate", async () => {
    // Arrange
    const files = new FakeFiles();

    // Act
    const pending = await pendingCandidates(files, layout);

    // Assert
    deepStrictEqual(pending, []);
  });
});

describe("refusedTopics", () => {
  it("gives the topics of refused.md", async () => {
    // Arrange
    const files = refusedFile();

    // Act
    const topics = await refusedTopics(files, layout);

    // Assert
    deepStrictEqual([...topics], ["empty-exports", "fixtures-drift"]);
  });

  it("gives no topic when refused.md does not exist", async () => {
    // Arrange
    const files = new FakeFiles();

    // Act
    const topics = await refusedTopics(files, layout);

    // Assert
    strictEqual(topics.size, 0);
  });

  it("throws when refused.md cannot be read", async () => {
    // Arrange
    const files = new FakeFiles();
    files.readErrors.set(layout.refused, new Error("permission denied"));

    // Act
    const reading = refusedTopics(files, layout);

    // Assert
    await rejects(reading, /permission denied/);
  });
});

describe("writeCandidateFile", () => {
  it("gives the path of the candidate's file", async () => {
    // Arrange
    const files = new FakeFiles();

    // Act
    const path = await writeCandidateFile(files, layout, CANDIDATE_A);

    // Assert
    strictEqual(path, candidatePath(layout, CANDIDATE_A.id));
  });

  it("writes the entry with the status candidate, whatever the status it was given", async () => {
    // Arrange
    const files = new FakeFiles();

    // Act
    await writeCandidateFile(files, layout, DECISION);

    // Assert
    assertEntryWritten(files, candidatePath(layout, DECISION.id), DECISION.id, "candidate");
  });
});

describe("refreshIndexFile", () => {
  for (const c of REFRESH_CASES) {
    it(c.name, async () => {
      // Arrange
      const files = c.files();

      // Act
      const line = await refreshIndexFile(files, layout);

      // Assert
      strictEqual(line, c.line);
    });
  }

  it("lists the admitted entries in INDEX.md", async () => {
    // Arrange
    const files = oneEntry();

    // Act
    await refreshIndexFile(files, layout);

    // Assert
    assertListNames(files, layout.index, DECISION.title);
  });
});
