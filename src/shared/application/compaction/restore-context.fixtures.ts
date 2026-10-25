// The files, sessions and conversations the post-compaction restoration is tested over.
import {
  CHARS_PER_TOKEN,
  POST_COMPACT_MAX_FILES_TO_RESTORE,
  POST_COMPACT_PER_FILE_TOKENS,
  POST_COMPACT_PER_SKILL_TOKENS,
  POST_COMPACT_SKILLS_TOKEN_BUDGET,
} from "../../domain/compaction-thresholds.ts";
import { SKILLS_STATE_KEY } from "../../domain/session-keys.ts";
import type { SessionMsg } from "../../domain/types.ts";
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../../../tests/support/doubles/fake-session-store.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export const PER_FILE_CHARS = POST_COMPACT_PER_FILE_TOKENS * CHARS_PER_TOKEN;
export const PER_SKILL_CHARS = POST_COMPACT_PER_SKILL_TOKENS * CHARS_PER_TOKEN;

/** Two readable files, an empty one, and one that cannot be read. */
export function mixedFiles(): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/src/a.ts`, "A");
  files.files.set(`${WORKSPACE}/src/b.ts`, "B");
  files.files.set(`${WORKSPACE}/src/empty.ts`, "");
  files.readErrors.set(`${WORKSPACE}/src/locked.ts`, new Error("access denied"));
  return files;
}

/** A conversation naming a, then b, a gone file and the locked one, then the empty one. */
export const MIXED_MENTIONS: SessionMsg[] = [
  { role: "user", content: `look at ${WORKSPACE}/src/a.ts` },
  { role: "assistant", content: `read ${WORKSPACE}/src/b.ts, ${WORKSPACE}/src/gone.ts and ${WORKSPACE}/src/locked.ts` },
  { role: "tool", content: `${WORKSPACE}/src/empty.ts is empty` },
];

/** Two more files than the cap, each over the per-file limit, and a conversation naming each in turn. */
export function tooManyLargeFiles() {
  const files = new FakeFiles();
  const paths = Array.from({ length: POST_COMPACT_MAX_FILES_TO_RESTORE + 2 }, (_, i) => `${WORKSPACE}/f${i}.ts`);
  for (const p of paths) files.files.set(p, "x".repeat(PER_FILE_CHARS + 10));
  const messages: SessionMsg[] = paths.map((p) => ({ role: "user", content: `see ${p}` }));
  return { files, paths, messages };
}

/** The number of full skills the skills budget holds. */
export const BUDGET_SKILLS = (POST_COMPACT_SKILLS_TOKEN_BUDGET * CHARS_PER_TOKEN) / PER_SKILL_CHARS;

/** One more attached skill than the budget holds, each over the per-skill limit. */
export function tooManySkills() {
  const paths = Array.from({ length: BUDGET_SKILLS + 1 }, (_, i) => `${WORKSPACE}/skills/s${i}.md`);
  const session = new FakeSessionStore();
  session.state.set(SKILLS_STATE_KEY, JSON.stringify(paths));
  const files = new FakeFiles();
  for (const p of paths) files.files.set(p, p + "y".repeat(PER_SKILL_CHARS));
  return { paths, session, files };
}

/** Three attached skills: one gone, one blank, one readable. */
export function goneBlankAndOkSkills() {
  const session = new FakeSessionStore();
  session.state.set(SKILLS_STATE_KEY, `["${WORKSPACE}/gone.md","${WORKSPACE}/blank.md","${WORKSPACE}/ok.md"]`);
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/blank.md`, " ");
  files.files.set(`${WORKSPACE}/ok.md`, "# OK");
  return { session, files };
}
