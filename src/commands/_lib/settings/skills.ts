// /skills (E-1) — manage skill attachments (baseline 04 §/skills). Skills in
// Orkeon Code are workspace markdown files whose PATH is registered here; attached
// skills are restorable context (the post-compaction restore, E-4, re-injects
// path-mentioned files). DEVIATION (recorded in RESULTS.md): no autonomous
// skill triggering — attachment is explicit.

import type { Files, SessionStore } from "../../../shared/application/ports.ts";
import { readJsonArray, writeJson } from "../../../shared/application/session-state.ts";
import { SKILLS_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CommandView } from "../view.ts";

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
        return { text: "no skills attached. usage: /skills attach <workspace path to a .md playbook>" };
      }
      return { table: skills.map((p, i) => ({ n: i + 1, path: String(p) })) };
    case "attach": {
      if (!arg) return { text: "usage: /skills attach <path>" };
      try {
        await files.read(arg, 1);
      } catch {
        return { text: `cannot attach '${arg}' — the file is not readable in the mounted workspace.` };
      }
      if (!skills.includes(arg)) skills.push(arg);
      await writeJson(session, SKILLS_STATE_KEY, skills);
      return { text: `skill attached: ${arg} (${skills.length} attached; /clear clears).` };
    }
    case "detach": {
      const n = Number(arg);
      if (!Number.isInteger(n) || n < 1 || n > skills.length) {
        return { text: `usage: /skills detach <1-${skills.length || 1}>` };
      }
      const [removed] = skills.splice(n - 1, 1);
      await writeJson(session, SKILLS_STATE_KEY, skills);
      return { text: `skill detached: ${removed}` };
    }
    default:
      return { text: "usage: /skills [list|attach <path>|detach <n>]" };
  }
}
