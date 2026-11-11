// /skills (E-1) — manage skill attachments (baseline 04 §/skills). Skills in
// Orkeon Code are workspace markdown files whose PATH is registered here; attached
// skills are restorable context (the post-compaction restore, E-4, re-injects
// path-mentioned files). Attachment is explicit; `/skills suggest on` adds, turn by turn, the project's skills the
// host's decision model finds fit for the request (shared/application/skills/suggest-skills.ts, ADR 0027).

import type { DecisionModel, Files, SessionStore } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { SKILLS_SUGGEST_CONFIG_KEY, suggestOn } from "../../../shared/domain/skills/shortlist.ts";
import type { SkillPick } from "../../../shared/domain/skills/shortlist.ts";
import { readJsonArray, writeJson } from "../../../shared/application/session-state.ts";
import { SKILLS_STATE_KEY, SKILLS_SUGGESTED_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CommandView } from "../view.ts";
import {
  NO_SKILLS, NOTHING_SUGGESTED_YET, SKILLS_ATTACH_USAGE, SKILLS_SUGGEST_USAGE, SKILLS_USAGE, cannotAttach, noSkillFit, skillAttached,
  skillDetached, skillsDetachUsage, skillsOffered, suggestSet, suggestStatus, suggestedSkill,
} from "./messages.ts";

export interface SkillsDeps {
  session: Pick<SessionStore, "readState" | "writeState">;
  files: Pick<Files, "read">;
  /** The settings and the decision model `/skills suggest` reads; absent, the sub-command answers its usage. */
  config?: Pick<ConfigStore, "readValue" | "readSession" | "writeSession">;
  decision?: Pick<DecisionModel, "available">;
}

/** What the last turn was suggested, as stored; null when nothing readable is. */
function lastSuggestion(stored: string | null): { offered: number; picks: SkillPick[] } | null {
  try {
    const raw = JSON.parse(stored ?? "null") as { offered?: unknown; picks?: unknown } | null;
    if (raw === null || typeof raw.offered !== "number" || !Array.isArray(raw.picks)) return null;
    return { offered: raw.offered, picks: raw.picks.filter((p): p is SkillPick => typeof p?.path === "string" && typeof p?.share === "number") };
  } catch {
    return null;
  }
}

/** `/skills suggest [on|off|why]`. */
async function runSuggest(word: string, deps: SkillsDeps): Promise<CommandView> {
  const { config, decision } = deps;
  if (config === undefined || decision === undefined) return { text: SKILLS_SUGGEST_USAGE };
  if (word === "") {
    return { text: suggestStatus(suggestOn((await config.readValue(SKILLS_SUGGEST_CONFIG_KEY)).value), decision.available()) };
  }
  if (word === "why") {
    const last = lastSuggestion(await deps.session.readState(SKILLS_SUGGESTED_STATE_KEY).catch(() => null));
    if (last === null) return { text: NOTHING_SUGGESTED_YET };
    if (last.picks.length === 0) return { text: noSkillFit(last.offered) };
    return { lines: last.picks.map((pick) => suggestedSkill(pick.path, pick.share)), text: skillsOffered(last.offered) };
  }
  if (word !== "on" && word !== "off") return { text: SKILLS_SUGGEST_USAGE };
  await config.writeSession({ ...await config.readSession(), [SKILLS_SUGGEST_CONFIG_KEY]: word });
  return { text: suggestSet(word === "on", decision.available()) };
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
    case "suggest":
      return runSuggest((arg ?? "").toLowerCase(), deps);
    default:
      return { text: SKILLS_USAGE };
  }
}
