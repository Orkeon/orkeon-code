// Routing a crew to the cheapest profile that fits its task (ADR 0027). The host declares LLM profiles
// (`Llm:Profiles:<name>`); `route.ladder` orders some of them, cheapest first. At a crew's launch the host's
// decision model reads the command and picks a rung; rules of the project raise a floor (a path the command names,
// the crew itself); the session's own profile is the ceiling. Below a confidence, or without an answer, the session's
// profile stands. Routing picks a profile, it forbids nothing. Every number is stated with its reason. Pure.
import type { DecisionAnswers, DecisionQuestions } from "../decision/questions.ts";
import { llmProfileProblem } from "../llm-profile.ts";
import { ladderNeedsTwo, ladderRepeats } from "./messages.ts";
import { routeRung, routeStateText } from "./prompts.ts";

/** The setting that turns the routing on: `on`, anything else is off. */
export const ROUTE_AGENTS_CONFIG_KEY = "route.agents";
/** The setting that orders the profiles, cheapest first, comma-separated. */
export const ROUTE_LADDER_CONFIG_KEY = "route.ladder";
/** The ladder of the example settings: their two profiles. */
export const DEFAULT_LADDER: readonly string[] = ["small", "large"];
/** The probability of its pick under which the model is not followed: between two rungs, a pick under 0.6 is barely
 *  ahead of the other, and the session's profile is what the user chose. The probability is the one the answer gives
 *  the option picked; the answer's `confidence` is a figure of the provider's own, read only when that one is absent. */
export const ROUTE_MIN_CONFIDENCE = 0.6;
/** The command, as the decision model reads it, in characters: cut in the middle, its start and its end kept. */
export const ROUTE_BRIEF_CHARS = 4_000;
/** The choices `/route why` shows. */
export const ROUTE_RECENT = 5;
/** The project's floors, read at each routed launch. */
export const ROUTE_RULES_FILE = ".orkeon/route-rules.json";
/** The name of the question asked. */
export const ROUTE_QUESTION = "profile";

/** Why a pick stands. */
export type RouteReason = "model" | "floor" | "ceiling" | "low-confidence" | "no-answer";

export interface RouteChoice {
  /** The profile the crew runs on; null: the host's default model, as without routing. */
  profile: string | null;
  reason: RouteReason;
  /** What the model picked and how surely, when it answered. */
  picked?: string;
  confidence?: number;
}

/** The floors of a project: a profile of the ladder at least, for a path prefix or for a crew. */
export interface RouteRules {
  paths: Readonly<Record<string, string>>;
  crews: Readonly<Record<string, string>>;
}

export const NO_ROUTE_RULES: RouteRules = { paths: {}, crews: {} };

/** Whether the setting's value turns the routing on. */
export function routeOn(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "on";
}

function names(value: string): string[] {
  return value.split(",").map((name) => name.trim()).filter((name) => name.length > 0);
}

/** Why a value is refused for `route.ladder`; undefined when it is a ladder. */
export function ladderProblem(value: string): string | undefined {
  const rungs = names(value);
  if (rungs.length < 2) return ladderNeedsTwo(value);
  for (const rung of rungs) {
    const problem = llmProfileProblem(rung);
    if (problem !== undefined) return problem;
  }
  return new Set(rungs).size === rungs.length ? undefined : ladderRepeats(value);
}

/** The ladder a setting names; the default one when it names none or what it names is no ladder. */
export function ladderOf(value: unknown): readonly string[] {
  return typeof value === "string" && ladderProblem(value) === undefined ? names(value) : DEFAULT_LADDER;
}

/** The floors a rules file holds: `{ "paths": { "<prefix>": "<profile>" }, "crews": { "<crew>": "<profile>" } }`. An
 *  entry that is not a string is dropped; a text that is not such an object holds none. */
export function parseRouteRules(text: string): RouteRules {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NO_ROUTE_RULES;
  }
  const section = (name: "paths" | "crews"): Record<string, string> => {
    const value = (raw as Record<string, unknown> | null)?.[name];
    const out: Record<string, string> = {};
    if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
    for (const [key, profile] of Object.entries(value)) {
      if (typeof profile === "string" && key.trim().length > 0) out[key.trim()] = profile.trim();
    }
    return out;
  };
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? { paths: section("paths"), crews: section("crews") } : NO_ROUTE_RULES;
}

/** A path as the rules compare it: slashes one way, no `/workspace/` nor `./` in front, no slash at the end. */
function bare(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/workspace\//, "").replace(/^\.\//, "").replace(/\/+$/, "");
}

/** The words of a command, as paths: quotes and the punctuation around a word dropped. */
function wordsOf(brief: string): string[] {
  return brief.split(/\s+/).map((word) => bare(word.replace(/^["'`(]+|["'`),;:]+$/g, ""))).filter((word) => word.length > 0);
}

/** The rung the rules ask for at least: the crew's own, and for each word of the command that is a rule's path or lies
 *  under it, the rule of its closest ancestor; the highest of them. 0 when no rule applies; a rule naming a profile
 *  outside the ladder, or whose path is empty once written bare (`/`, `./`), is ignored. */
export function routeFloor(rules: RouteRules, crew: string, brief: string, ladder: readonly string[]): number {
  let floor = Math.max(0, ladder.indexOf(rules.crews[crew] ?? ""));
  const prefixes = Object.keys(rules.paths)
    .map((prefix) => ({ prefix: bare(prefix), profile: rules.paths[prefix] }))
    .filter(({ prefix }) => prefix.length > 0);
  for (const word of wordsOf(brief)) {
    const closest = prefixes
      .filter(({ prefix }) => word === prefix || word.startsWith(`${prefix}/`))
      .sort((x, y) => y.prefix.length - x.prefix.length)[0];
    if (closest !== undefined) floor = Math.max(floor, ladder.indexOf(closest.profile));
  }
  return floor;
}

function middleCut(text: string, max: number): string {
  if (text.length <= max) return text;
  const kept = max - " ... ".length;
  const head = Math.ceil(kept / 2);
  return `${text.slice(0, head)} ... ${text.slice(text.length - (kept - head))}`;
}

/** The state the decision model judges: the crew and the command that launches it. */
export function routeState(crew: string, brief: string): string {
  return routeStateText(crew, middleCut(brief.trim(), ROUTE_BRIEF_CHARS));
}

/** One choice among the rungs, each described by its place on the ladder. */
export function routeQuestions(ladder: readonly string[]): DecisionQuestions {
  const criteria: Record<string, string> = {};
  ladder.forEach((rung, i) => {
    criteria[rung] = routeRung(i === 0 ? "lowest" : i === ladder.length - 1 ? "highest" : "middle");
  });
  return { [ROUTE_QUESTION]: { type: "choice", criteria } };
}

/** Whether a session on `sessionProfile` can be routed: on the default model, or on a rung of the ladder. A session on
 *  another profile (a decision profile that guards its requests) keeps it. */
export function routable(sessionProfile: string | null, ladder: readonly string[]): boolean {
  return sessionProfile === null || ladder.includes(sessionProfile);
}

/** The profile of a launch: the model's pick when it is sure enough, raised to the floor, never above the session's
 *  own rung. Without an answer, or under the bar, the session's profile; a session on the host's default model then
 *  takes the floor's rung when a rule sets one, since the rule is the project's own word. A session on a profile
 *  outside the ladder keeps it. */
export function routeOf(
  answers: DecisionAnswers | null, ladder: readonly string[], sessionProfile: string | null, floor: number,
): RouteChoice {
  if (sessionProfile !== null && !ladder.includes(sessionProfile)) return { profile: sessionProfile, reason: "ceiling" };
  const unrouted = (reason: RouteReason): RouteChoice =>
    sessionProfile === null && floor > 0 ? { profile: ladder[floor], reason: "floor" } : { profile: sessionProfile, reason };
  const answer = answers?.[ROUTE_QUESTION];
  if (answer?.type !== "choice" || !ladder.includes(answer.choice)) return unrouted("no-answer");
  const told = { picked: answer.choice, confidence: answer.probabilities[answer.choice] ?? answer.confidence };
  if (told.confidence < ROUTE_MIN_CONFIDENCE) return { ...unrouted("low-confidence"), ...told };
  const ceiling = sessionProfile === null ? ladder.length - 1 : ladder.indexOf(sessionProfile);
  const picked = ladder.indexOf(answer.choice);
  const raised = Math.max(picked, floor);
  const rung = Math.min(raised, ceiling);
  const reason: RouteReason = rung < raised ? "ceiling" : raised > picked ? "floor" : "model";
  return { profile: ladder[rung], reason, ...told };
}

/** Whether a choice is a decision (the model's pick, held or raised), not the session's profile left to stand. */
export function routeDecided(reason: RouteReason): boolean {
  return reason !== "no-answer" && reason !== "low-confidence";
}

/** One line of `/route why`, kept in the session. */
export interface RouteRecord {
  crew: string;
  profile: string | null;
  reason: RouteReason;
  picked?: string;
  confidence?: number;
}

/** The records with `next` added, the last ROUTE_RECENT kept. */
export function withRecord(records: readonly RouteRecord[], next: RouteRecord): RouteRecord[] {
  return [...records, next].slice(-ROUTE_RECENT);
}

/** The records a stored value holds; none when it is not a list of them. */
export function parseRecords(stored: string | null): RouteRecord[] {
  try {
    const raw: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(raw) ? raw.filter((r): r is RouteRecord => typeof r?.crew === "string" && typeof r?.reason === "string") : [];
  } catch {
    return [];
  }
}
