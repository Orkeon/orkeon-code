// The /skills registry as the turn prompt and the compaction read it: the paths
// attached in the session's state bag, each with its file's content.

import type { Files, SessionStore } from "./ports.ts";
import { SKILLS_STATE_KEY } from "../domain/session-keys.ts";
import { readJsonArray } from "./session-state.ts";

export interface AttachedSkill {
  path: string;
  content: string;
}

/**
 * B-13: the attached /skills, WITH their content, in attachment order.
 *
 * The path alone would tell the model a playbook exists without letting it read
 * one — worse than silence. A skill whose file has gone, cannot be read or is blank
 * is dropped: the registry is a session preference, not a guarantee about the
 * filesystem, and neither a turn nor a compaction may fail over it.
 */
export async function readAttachedSkills(
  session: Pick<SessionStore, "readState">,
  files: Pick<Files, "read">,
): Promise<AttachedSkill[]> {
  const paths = (await readJsonArray(session, SKILLS_STATE_KEY))
    .map((p) => String(p ?? ""))
    .filter((p) => p.length > 0);
  const out: AttachedSkill[] = [];
  for (const path of paths) {
    try {
      const content = await files.read(path);
      if (content.trim().length > 0) out.push({ path, content });
    } catch { /* detached-then-deleted → skip */ }
  }
  return out;
}
