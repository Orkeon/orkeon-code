// After a full synthesis, the compaction re-injects the working context the
// summary would lose: the files the conversation touched last (E-4) and the
// attached skills (B-13), each under its own token budget (chars/4 heuristic).

import type { Files, SessionStore } from "../ports.ts";
import type { SessionMsg } from "../../domain/types.ts";
import {
  buildRestoredFileMessage,
  buildRestoredSkillMessage,
  extractRecentFilePaths,
} from "../../domain/compaction.ts";
import {
  CHARS_PER_TOKEN,
  POST_COMPACT_MAX_FILES_TO_RESTORE,
  POST_COMPACT_PER_FILE_TOKENS,
  POST_COMPACT_TOKEN_BUDGET,
  POST_COMPACT_SKILLS_TOKEN_BUDGET,
  POST_COMPACT_PER_SKILL_TOKENS,
} from "../../domain/compaction-thresholds.ts";
import { readAttachedSkills } from "../attached-skills.ts";

/**
 * E-4: read back up to POST_COMPACT_MAX_FILES_TO_RESTORE recently-mentioned
 * files (recency order) under the 50 k-token restore budget (5 k per file,
 * chars/4 heuristic). Unreadable/gone paths are skipped silently — the
 * harvest regex is conservative but the filesystem stays the arbiter.
 */
export async function restoreRecentFiles(
  files: Pick<Files, "read">,
  preCompaction: SessionMsg[],
): Promise<SessionMsg[]> {
  const candidates = extractRecentFilePaths(preCompaction, POST_COMPACT_MAX_FILES_TO_RESTORE * 4);
  const out: SessionMsg[] = [];
  let budgetChars = POST_COMPACT_TOKEN_BUDGET * CHARS_PER_TOKEN;
  const perFileChars = POST_COMPACT_PER_FILE_TOKENS * CHARS_PER_TOKEN;
  for (const path of candidates) {
    if (out.length >= POST_COMPACT_MAX_FILES_TO_RESTORE || budgetChars <= 0) break;
    try {
      const content = await files.read(path);
      if (content.length === 0) continue;
      const capped = content.slice(0, Math.min(perFileChars, budgetChars));
      budgetChars -= capped.length;
      out.push(buildRestoredFileMessage(path, capped));
    } catch { /* not a real/readable file → skip */ }
  }
  return out;
}

/**
 * B-13: read back every attached skill under POST_COMPACT_SKILLS_TOKEN_BUDGET.
 *
 * Reads the registry from the session bag rather than taking it as an argument:
 * this runs inside the compaction, which has no caller able to supply it. A gone,
 * unreadable or blank skill is skipped (readAttachedSkills) — a
 * detached-then-deleted playbook must not fail a compaction.
 */
export async function restoreAttachedSkills(
  session: Pick<SessionStore, "readState">,
  files: Pick<Files, "read">,
): Promise<SessionMsg[]> {
  const out: SessionMsg[] = [];
  let budgetChars = POST_COMPACT_SKILLS_TOKEN_BUDGET * CHARS_PER_TOKEN;
  const perSkillChars = POST_COMPACT_PER_SKILL_TOKENS * CHARS_PER_TOKEN;
  for (const { path, content } of await readAttachedSkills(session, files)) {
    if (budgetChars <= 0) break;
    const capped = content.slice(0, Math.min(perSkillChars, budgetChars));
    budgetChars -= capped.length;
    out.push(buildRestoredSkillMessage(path, capped));
  }
  return out;
}
