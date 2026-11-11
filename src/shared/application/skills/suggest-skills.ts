// The skills suggested for one turn (ADR 0027): with `skills.suggest` on and a decision model on the host, the
// project's skill files are listed, the model is told of each by one line, and the few that fit the request are read
// and handed to the turn, apart from the ones a person attached: the turn reads them as reference material the
// operator did not choose. A skill kept for a person to invoke is never offered. It fails open at every step: the setting off or
// unreadable, no decision model, no skill folder, a model that does not answer suggest nothing. What was suggested
// is logged and kept in the session for `/skills suggest why`.
import type { DecisionModel, Files, Logger, SessionStore } from "../ports.ts";
import type { ConfigStore } from "../config-store.ts";
import type { AttachedSkill } from "../attached-skills.ts";
import { WORKSPACE } from "../../domain/vfs.ts";
import { SKILLS_SUGGESTED_STATE_KEY } from "../../domain/session-keys.ts";
import type { DecisionAnswers } from "../../domain/decision/questions.ts";
import type { SkillCard, SkillPick } from "../../domain/skills/shortlist.ts";
import {
  CLAUDE_SKILLS_DIR, CLAUDE_SKILL_FILE, ORKEON_SKILLS_DIR, SKILL_HEAD_CHARS, SKILLS_LISTING_MAX, SKILLS_SUGGEST_CONFIG_KEY,
  SUGGEST_MAX_CANDIDATES, offerable, shortlistOf, shortlistQuestion, skillCard, skillKey, suggestOn, suggestState,
} from "../../domain/skills/shortlist.ts";
import { SUGGEST_WITHOUT_DECISION_MODEL, skillsSuggested } from "./messages.ts";

export interface SuggestDeps {
  config: Pick<ConfigStore, "readValue">;
  decision: DecisionModel;
  files: Pick<Files, "read" | "list">;
  session: Pick<SessionStore, "writeState">;
  log: Pick<Logger, "info" | "warn">;
}

async function settingOn(config: SuggestDeps["config"]): Promise<boolean> {
  try {
    return suggestOn((await config.readValue(SKILLS_SUGGEST_CONFIG_KEY)).value);
  } catch {
    return false;
  }
}

async function entries(files: SuggestDeps["files"], dir: string): Promise<string[]> {
  try {
    return [...await files.list(dir, SKILLS_LISTING_MAX)].map((name) => name.replace(/\/+$/, "")).sort();
  } catch {
    return [];
  }
}

/** The skill files of the project, the project's own first, each folder in name order, SUGGEST_MAX_CANDIDATES at most. */
async function skillPaths(files: SuggestDeps["files"]): Promise<string[]> {
  const own = (await entries(files, `${WORKSPACE}/${ORKEON_SKILLS_DIR}`))
    .filter((name) => /\.md$/i.test(name))
    .map((name) => `${WORKSPACE}/${ORKEON_SKILLS_DIR}/${name}`);
  // A folder per skill: an entry that ends like a file (README.md, notes.txt) is none.
  const others = (await entries(files, `${WORKSPACE}/${CLAUDE_SKILLS_DIR}`))
    .filter((name) => !/\.[A-Za-z0-9]{1,5}$/.test(name))
    .map((name) => `${WORKSPACE}/${CLAUDE_SKILLS_DIR}/${name}/${CLAUDE_SKILL_FILE}`);
  return [...own, ...others].slice(0, SUGGEST_MAX_CANDIDATES);
}

/** The card of each skill file that can be read, is not blank and may be offered to a model. */
async function cards(files: SuggestDeps["files"], paths: readonly string[]): Promise<SkillCard[]> {
  const read = await Promise.all(paths.map(async (path) => {
    try {
      const head = await files.read(path, SKILL_HEAD_CHARS);
      return head.trim().length === 0 || !offerable(head) ? null : skillCard(path, head);
    } catch {
      return null;
    }
  }));
  return read.filter((card): card is SkillCard => card !== null);
}

async function contents(files: SuggestDeps["files"], picks: readonly SkillPick[]): Promise<AttachedSkill[]> {
  const out: AttachedSkill[] = [];
  for (const pick of picks) {
    try {
      const content = await files.read(pick.path);
      if (content.trim().length > 0) out.push({ path: pick.path, content });
    } catch { /* a skill gone since its card was read is left out */ }
  }
  return out;
}

/** The skills suggested for `request`, those of `attached` (paths a person attached) left out. */
export async function suggestSkills(deps: SuggestDeps, request: string, attached: readonly string[]): Promise<AttachedSkill[]> {
  if (!await settingOn(deps.config)) return [];
  if (!deps.decision.available()) {
    deps.log.warn(SUGGEST_WITHOUT_DECISION_MODEL);
    return [];
  }
  const held = new Set(attached.map(skillKey));
  const offered = (await cards(deps.files, await skillPaths(deps.files))).filter((card) => !held.has(skillKey(card.path)));
  if (offered.length === 0) return [];
  let answers: DecisionAnswers | null = null;
  try {
    answers = await deps.decision.ask(suggestState(request), shortlistQuestion(offered));
  } catch { /* a decision model that throws is one that did not answer */ }
  const picks = shortlistOf(answers, offered);
  try {
    await deps.session.writeState(SKILLS_SUGGESTED_STATE_KEY, JSON.stringify({ offered: offered.length, picks }));
  } catch { /* the record is a convenience: the turn goes on without it */ }
  if (picks.length === 0) return [];
  const skills = await contents(deps.files, picks);
  deps.log.info(skillsSuggested(skills.map((skill) => skill.path).join(", ")));
  return skills;
}
