// Post-compaction restoration of files and skills over FakeFiles and
// FakeSessionStore. Run:
//   node_modules/.bin/tsx --test shared/application/compaction/restore-context.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { restoreAttachedSkills, restoreRecentFiles } from "./restore-context.ts";
import { buildRestoredFileMessage,
  buildRestoredFileNotice, buildRestoredSkillMessage } from "../../domain/compaction.ts";
import {
  CHARS_PER_TOKEN,
  POST_COMPACT_MAX_FILES_TO_RESTORE,
  POST_COMPACT_PER_FILE_TOKENS,
  POST_COMPACT_PER_SKILL_TOKENS,
  POST_COMPACT_SKILLS_TOKEN_BUDGET,
} from "../../domain/compaction-thresholds.ts";
import { SKILLS_STATE_KEY } from "../../domain/session-keys.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

const PER_FILE_CHARS = POST_COMPACT_PER_FILE_TOKENS * CHARS_PER_TOKEN;
const PER_SKILL_CHARS = POST_COMPACT_PER_SKILL_TOKENS * CHARS_PER_TOKEN;

describe("restoreRecentFiles", () => {
  it("re-reads the paths the conversation mentioned last, most recent first, skipping what it cannot read", async () => {
    const files = new FakeFiles();
    files.files.set("/workspace/src/a.ts", "A");
    files.files.set("/workspace/src/b.ts", "B");
    files.files.set("/workspace/src/empty.ts", "");
    files.readErrors.set("/workspace/src/locked.ts", new Error("access denied"));
    const restored = await restoreRecentFiles(files, [
      { role: "user", content: "look at /workspace/src/a.ts" },
      { role: "assistant", content: "read /workspace/src/b.ts, /workspace/src/gone.ts and /workspace/src/locked.ts" },
      { role: "tool", content: "/workspace/src/empty.ts is empty" },
    ]);
    deepStrictEqual(restored, [
      buildRestoredFileMessage("/workspace/src/b.ts", "B"),
      buildRestoredFileMessage("/workspace/src/a.ts", "A"),
    ]);
  });

  it("caps the number of files restored, and names a file too large instead of cutting it", async () => {
    const files = new FakeFiles();
    const paths = Array.from({ length: POST_COMPACT_MAX_FILES_TO_RESTORE + 2 }, (_, i) => `/workspace/f${i}.ts`);
    for (const p of paths) files.files.set(p, "x".repeat(PER_FILE_CHARS + 10));
    const restored = await restoreRecentFiles(files, paths.map((p) => ({ role: "user", content: `see ${p}` })));
    deepStrictEqual(restored.length, POST_COMPACT_MAX_FILES_TO_RESTORE);
    // A cut copy reads as the whole file and could feed a whole-file write.
    deepStrictEqual(restored[0], buildRestoredFileNotice(paths[paths.length - 1]));
  });

  it("restores a file that fits whole", async () => {
    const files = new FakeFiles();
    files.files.set("/workspace/small.ts", "x".repeat(PER_FILE_CHARS));
    deepStrictEqual(
      await restoreRecentFiles(files, [{ role: "user", content: "see /workspace/small.ts" }]),
      [buildRestoredFileMessage("/workspace/small.ts", "x".repeat(PER_FILE_CHARS))],
    );
  });
});

describe("restoreAttachedSkills", () => {
  it("re-injects the attached skills in attachment order, each capped, under the skills budget", async () => {
    const budgetSkills = (POST_COMPACT_SKILLS_TOKEN_BUDGET * CHARS_PER_TOKEN) / PER_SKILL_CHARS;
    const paths = Array.from({ length: budgetSkills + 1 }, (_, i) => `/workspace/skills/s${i}.md`);
    const session = new FakeSessionStore();
    session.state.set(SKILLS_STATE_KEY, JSON.stringify(paths));
    const files = new FakeFiles();
    for (const p of paths) files.files.set(p, p + "y".repeat(PER_SKILL_CHARS));
    const restored = await restoreAttachedSkills(session, files);
    deepStrictEqual(restored, paths.slice(0, budgetSkills).map((p) =>
      buildRestoredSkillMessage(p, (p + "y".repeat(PER_SKILL_CHARS)).slice(0, PER_SKILL_CHARS))));
  });

  it("skips a skill whose file has gone or is blank", async () => {
    const session = new FakeSessionStore();
    session.state.set(SKILLS_STATE_KEY, `["/workspace/gone.md","/workspace/blank.md","/workspace/ok.md"]`);
    const files = new FakeFiles();
    files.files.set("/workspace/blank.md", " ");
    files.files.set("/workspace/ok.md", "# OK");
    deepStrictEqual(await restoreAttachedSkills(session, files), [buildRestoredSkillMessage("/workspace/ok.md", "# OK")]);
  });

  it("restores nothing without attached skills", async () => {
    deepStrictEqual(await restoreAttachedSkills(new FakeSessionStore(), new FakeFiles()), []);
  });
});
