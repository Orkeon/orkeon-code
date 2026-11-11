// Suggesting skills for a turn (ADR 0027). A project keeps skills as markdown files: `.orkeon/skills/<name>.md`, or
// a folder of `.claude/skills/` holding a `SKILL.md`. With `skills.suggest` on, the host's decision model reads the
// request and one line per skill (its name and what it is for) and the few that fit join the turn's attached skills,
// for that turn. The skills a person attached with /skills stay, first. Every number is stated with its reason. Pure.
import type { DecisionAnswers, DecisionQuestions } from "../decision/questions.ts";
import { NO_SKILL_FITS, skillLine, SUGGEST_INSTRUCTIONS } from "./prompts.ts";

/** The setting that turns the suggestion on: `on`, anything else is off. */
export const SKILLS_SUGGEST_CONFIG_KEY = "skills.suggest";
/** A project's own skills, one markdown file each. */
export const ORKEON_SKILLS_DIR = ".orkeon/skills";
/** Skills written for another assistant, one folder each with its SKILL.md. */
export const CLAUDE_SKILLS_DIR = ".claude/skills";
export const CLAUDE_SKILL_FILE = "SKILL.md";
/** Skills suggested for one turn at most: each may add 4 000 characters to the turn (the skills block's cap). */
export const SUGGEST_MAX_PICKS = 3;
/** The share of the model's probability from which a skill is suggested: three skills at most can reach it. The
 *  question is one choice, so skills that all fit split the probability: four that fit equally reach none. */
export const SUGGEST_MIN_SHARE = 0.3;
/** Skills offered to the decision model in one question, in name order: past it the options crowd each other out. */
export const SUGGEST_MAX_CANDIDATES = 24;
/** Entries read of a skills folder before its skills are picked out: a folder holds other files too. */
export const SKILLS_LISTING_MAX = 200;
/** What is read of a skill file to find its name and description. */
export const SKILL_HEAD_CHARS = 2_000;
/** A skill's description, as the decision model reads it. */
export const SKILL_DESCRIPTION_CHARS = 300;
/** The request, as the decision model reads it. */
export const SUGGEST_REQUEST_CHARS = 2_000;
/** The name of the question asked, and the option that says no skill fits. */
export const SUGGEST_QUESTION = "skill";
export const NO_SKILL_OPTION = "none";

/** One skill as the decision model is told of it. */
export interface SkillCard {
  path: string;
  name: string;
  description: string;
}

/** One suggested skill and the share of probability it got. */
export interface SkillPick {
  path: string;
  share: number;
}

/** Whether the setting's value turns the suggestion on. */
export function suggestOn(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "on";
}

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

/** The name a path gives a skill: the file's, or its folder's for a SKILL.md. */
function nameOfPath(path: string): string {
  const parts = path.split("/");
  const file = parts[parts.length - 1] ?? "";
  return file === CLAUDE_SKILL_FILE ? parts[parts.length - 2] ?? file : file.replace(/\.md$/i, "");
}

/** The fields of a file's front matter, a folded or literal value (`description: >`) read from its indented lines;
 *  null when the file opens with none. A front matter the head cuts short is read as far as it goes. */
function frontmatter(head: string): { fields: Record<string, string>; body: string } | null {
  const lines = head.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const fields: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length && lines[i].trim() !== "---"; i += 1) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (field === null) continue;
    let value = field[2].trim();
    if (/^[>|][+-]?$/.test(value)) {
      const folded: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) folded.push(lines[(i += 1)].trim());
      value = folded.join(" ");
    }
    fields[field[1].toLowerCase()] = value.replace(/^["']|["']$/g, "");
  }
  return { fields, body: lines.slice(i + 1).join("\n") };
}

/** The lines of a body outside its code fences, trimmed. */
function prose(body: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const line of body.split(/\r?\n/).map((l) => l.trim())) {
    if (/^(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced) out.push(line);
  }
  return out;
}

/** Whether the model may be offered a skill: not one its front matter keeps for a person to invoke
 *  (`disable-model-invocation: true`, the mark other assistants' skills carry). */
export function offerable(head: string): boolean {
  return frontmatter(head.replace(/^\uFEFF/, ""))?.fields["disable-model-invocation"]?.toLowerCase() !== "true";
}

/** A skill's card from the head of its file: the `name` and `description` of its front matter; else its first
 *  heading and the first line of text under it, code fences left out. A missing name is the path's; a missing
 *  description is empty. */
export function skillCard(path: string, head: string): SkillCard {
  const text = head.replace(/^\uFEFF/, "");
  const front = frontmatter(text);
  const lines = prose(front === null ? text : front.body);
  const heading = lines.find((line) => /^#{1,6}\s+\S/.test(line))?.replace(/^#+\s+/, "");
  const paragraph = lines.find((line) => line.length > 0 && !line.startsWith("#") && line !== "---") ?? "";
  return {
    path,
    name: front?.fields.name || heading || nameOfPath(path),
    description: cut((front?.fields.description || paragraph).replace(/\s+/g, " "), SKILL_DESCRIPTION_CHARS),
  };
}

/** A skill's path as two spellings of it compare: no `/workspace/` nor `./` in front. */
export function skillKey(path: string): string {
  return path.trim().replace(/^\/workspace\//, "").replace(/^\.\//, "");
}

const option = (n: number): string => `s${n}`;

/** The state the decision model judges: the request alone. */
export function suggestState(request: string): string {
  return cut(request.trim(), SUGGEST_REQUEST_CHARS);
}

/** One choice among the skills, numbered from 1, and the option that none fits. */
export function shortlistQuestion(cards: readonly SkillCard[]): DecisionQuestions {
  const criteria: Record<string, string> = {};
  cards.forEach((card, i) => {
    criteria[option(i + 1)] = skillLine(card.name, card.description);
  });
  criteria[NO_SKILL_OPTION] = NO_SKILL_FITS;
  return { [SUGGEST_QUESTION]: { type: "choice", criteria, instructions: SUGGEST_INSTRUCTIONS } };
}

/** The skills whose share reaches SUGGEST_MIN_SHARE, the largest first, SUGGEST_MAX_PICKS at most; none when the
 *  model chose that none fits, or did not answer. */
export function shortlistOf(answers: DecisionAnswers | null, cards: readonly SkillCard[]): SkillPick[] {
  const answer = answers?.[SUGGEST_QUESTION];
  if (answer?.type !== "choice" || answer.choice === NO_SKILL_OPTION) return [];
  return cards
    .map((card, i) => ({ path: card.path, share: answer.probabilities[option(i + 1)] ?? 0 }))
    .filter((pick) => pick.share >= SUGGEST_MIN_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, SUGGEST_MAX_PICKS);
}
