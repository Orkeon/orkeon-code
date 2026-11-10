// /skills (E-1) — manage skill attachments (baseline 04 §/skills). Skills in
// Orkeon Code are workspace markdown files whose PATH is registered here; attached
// skills are restorable context (the post-compaction restore, E-4, re-injects
// path-mentioned files). DEVIATION (recorded in RESULTS.md): no autonomous
// skill triggering — attachment is explicit.

import type { Files, SessionStore } from "../../../shared/application/ports.ts";
import { readJsonArray, writeJson } from "../../../shared/application/session-state.ts";
import { SKILLS_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CommandView } from "../view.ts";
import {
  NO_SKILLS, SKILLS_ATTACH_USAGE, SKILLS_USAGE, cannotAttach, skillAttached, skillDetached, skillsDetachUsage,
} from "./messages.ts";

export interface SkillsDeps {
  session: Pick<SessionStore, "readState" | "writeState">;
  files: Pick<Files, "read">;
}

/** `/skills [list|attach <path>|detach <n>]`, from the command's raw tokens. */
export async function runSkills(tokens: string[], deps: SkillsDeps): Promise<CommandView> {
  const { session, files } = deps;
  const [sub, arg] = tokens;
  const skills = await readJsonArray(session, SKILLS_STATE_KEY);
  switch ((sub ?? "list").toLowerCase()) {
    case "list":
      if (skills.length === 0) {
        return { text: NO_SKILLS };
      }
      return { table: skills.map((p, i) => ({ n: i + 1, path: String(p) })) };
    case "attach": {
      if (!arg) return { text: SKILLS_ATTACH_USAGE };
      try {
        await files.read(arg, 1);
      } catch {
        return { text: cannotAttach(arg) };
      }
      if (!skills.includes(arg)) skills.push(arg);
      await writeJson(session, SKILLS_STATE_KEY, skills);
      return { text: skillAttached(arg, skills.length) };
    }
    case "detach": {
      const n = Number(arg);
      if (!Number.isInteger(n) || n < 1 || n > skills.length) {
        return { text: skillsDetachUsage(skills.length || 1) };
      }
      const [removed] = skills.splice(n - 1, 1);
      await writeJson(session, SKILLS_STATE_KEY, skills);
      return { text: skillDetached(removed) };
    }
    default:
      return { text: SKILLS_USAGE };
  }
}
