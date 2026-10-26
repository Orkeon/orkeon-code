// Post-compaction restoration of files and skills over FakeFiles and
// FakeSessionStore. Run:
//   node --test src/shared/application/compaction/restore-context.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { restoreAttachedSkills, restoreRecentFiles } from "../../../../src/shared/application/compaction/restore-context.ts";
import { buildRestoredFileMessage,
  buildRestoredFileNotice, buildRestoredSkillMessage } from "../../../../src/shared/domain/compaction.ts";
import { POST_COMPACT_MAX_FILES_TO_RESTORE } from "../../../../src/shared/domain/compaction-thresholds.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import {
  BUDGET_SKILLS, MIXED_MENTIONS, PER_FILE_CHARS, PER_SKILL_CHARS, goneBlankAndOkSkills, mixedFiles, tooManyLargeFiles, tooManySkills,
} from "./restore-context.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("restoreRecentFiles", () => {
  it("re-reads the paths the conversation mentioned last, most recent first, skipping what it cannot read", async () => {
    // Arrange
    const files = mixedFiles();

    // Act
    const restored = await restoreRecentFiles(files, MIXED_MENTIONS);

    // Assert
    deepStrictEqual(restored, [
      buildRestoredFileMessage(`${WORKSPACE}/src/b.ts`, "B"),
      buildRestoredFileMessage(`${WORKSPACE}/src/a.ts`, "A"),
    ]);
  });

  it("caps the number of files restored, and names a file too large instead of cutting it", async () => {
    // Arrange
    const { files, paths, messages } = tooManyLargeFiles();

    // Act
    const restored = await restoreRecentFiles(files, messages);

    // Assert
    deepStrictEqual(restored.length, POST_COMPACT_MAX_FILES_TO_RESTORE);
    // A cut copy reads as the whole file and could feed a whole-file write.
    deepStrictEqual(restored[0], buildRestoredFileNotice(paths[paths.length - 1]));
  });

  it("restores a file that fits whole", async () => {
    // Arrange
    const files = new FakeFiles();
    files.files.set(`${WORKSPACE}/small.ts`, "x".repeat(PER_FILE_CHARS));

    // Act
    const restored = await restoreRecentFiles(files, [{ role: "user", content: `see ${WORKSPACE}/small.ts` }]);

    // Assert
    deepStrictEqual(restored, [buildRestoredFileMessage(`${WORKSPACE}/small.ts`, "x".repeat(PER_FILE_CHARS))]);
  });
});

describe("restoreAttachedSkills", () => {
  it("re-injects the attached skills in attachment order, each capped, under the skills budget", async () => {
    // Arrange
    const { paths, session, files } = tooManySkills();

    // Act
    const restored = await restoreAttachedSkills(session, files);

    // Assert
    deepStrictEqual(restored, paths.slice(0, BUDGET_SKILLS).map((p) =>
      buildRestoredSkillMessage(p, (p + "y".repeat(PER_SKILL_CHARS)).slice(0, PER_SKILL_CHARS))));
  });

  it("skips a skill whose file has gone or is blank", async () => {
    // Arrange
    const { session, files } = goneBlankAndOkSkills();

    // Act
    const restored = await restoreAttachedSkills(session, files);

    // Assert
    deepStrictEqual(restored, [buildRestoredSkillMessage(`${WORKSPACE}/ok.md`, "# OK")]);
  });

  it("restores nothing without attached skills", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const restored = await restoreAttachedSkills(session, new FakeFiles());

    // Assert
    deepStrictEqual(restored, []);
  });
});
