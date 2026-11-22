// Routing a crew to the cheapest profile that fits its task (ADR 0027). The host declares LLM profiles
// (`Llm:Profiles:<name>`); `route.ladder` orders some of them, cheapest first. At a crew's launch the runtime's System
// One pick reads the command and picks a rung, between the floor the project's rules raise (a path the command names,
// the crew itself) and the session's own profile, the ceiling; under its bar, or without an answer, the fallback
// stands. This module holds what Orkeon Code gives that pick and what it keeps of the answer. Routing picks a profile,
// it forbids nothing. Pure.
import { llmProfileProblem } from "../llm-profile.ts";
import { ladderNeedsTwo, ladderRepeats } from "./messages.ts";
import { routeStateText } from "./prompts.ts";

/** The setting that turns the routing on: `on`, anything else is off. */
export const ROUTE_AGENTS_CONFIG_KEY = "route.agents";
/** The setting that orders the profiles, cheapest first, comma-separated. */
export const ROUTE_LADDER_CONFIG_KEY = "route.ladder";
/** The ladder of the example settings: their two profiles. */
export const DEFAULT_LADDER: readonly string[] = ["small", "large"];
/** The command, as the pick reads it, in characters: cut in the middle, its start and its end kept. */
export const ROUTE_BRIEF_CHARS = 4_000;
/** The choices `/route why` shows. */
export const ROUTE_RECENT = 5;
/** The project's floors, read at each routed launch. */
export const ROUTE_RULES_FILE = ".orkeon/route-rules.json";
/** Why a pick answers what it answers: the reasons of the runtime's pick, as it spells them. */
export type RouteReason = "model" | "low-confidence" | "no-answer" | "circuit-off" | "no-ladder" | "floor" | "ceiling";

export interface RouteChoice {
  /** The profile the crew runs on; null: the host's default model, as without routing. */
  profile: string | null;
  reason: RouteReason;
  /** What the model picked and the probability its answer gave it, when it answered one of the rungs. */
  picked?: string;
  probability?: number;
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

/** The request the pick reads: the crew and the command that launches it, cut in its middle. */
export function routeState(crew: string, brief: string): string {
  return routeStateText(crew, middleCut(brief.trim(), ROUTE_BRIEF_CHARS));
}

/** Whether a session on `sessionProfile` can be routed: on the default model, or on a rung of the ladder. A session on
 *  another profile (a decision profile that guards its requests) keeps it. */
export function routable(sessionProfile: string | null, ladder: readonly string[]): boolean {
  return sessionProfile === null || ladder.includes(sessionProfile);
}

/** Whether a choice is a decision (the model's pick, held or raised, or the one rung the bounds leave), not the
 *  fallback left to stand. */
export function routeDecided(reason: RouteReason): boolean {
  return reason === "model" || reason === "floor" || reason === "ceiling";
}

/** Whether the pick asked nothing: the runtime's decision circuit is off, or it has no ladder. */
export function routeNotAsked(reason: RouteReason): boolean {
  return reason === "circuit-off" || reason === "no-ladder";
}

/** What the pick is given besides the request. */
export interface RouteBounds {
  ladder: readonly string[];
  floor?: string;
  ceiling?: string;
  fallback?: string;
}

/** The bounds of a pick: the ladder; the floor's rung when a rule raises one, held at the session's rung (the pick
 *  refuses a floor above its ceiling); the session's profile as the ceiling and the fallback. A session on the host's
 *  default model has no ceiling, and its fallback is the floor's rung when a rule sets one, since the rule is the
 *  project's own word: without a fallback the pick falls back on the host's default model, which no floor raises. */
export function routeBounds(ladder: readonly string[], sessionProfile: string | null, floor: number): RouteBounds {
  const top = sessionProfile === null ? ladder.length - 1 : Math.max(0, ladder.indexOf(sessionProfile));
  const low = Math.min(floor, top);
  const bounds: RouteBounds = { ladder };
  if (low > 0) bounds.floor = ladder[low];
  if (sessionProfile !== null) {
    bounds.ceiling = sessionProfile;
    bounds.fallback = sessionProfile;
  } else if (low > 0) {
    bounds.fallback = ladder[low];
  }
  return bounds;
}

/** One line of `/route why`, kept in the session. */
export interface RouteRecord {
  crew: string;
  profile: string | null;
  reason: RouteReason;
  picked?: string;
  probability?: number;
}

/** The records with `next` added, the last ROUTE_RECENT kept. */
export function withRecord(records: readonly RouteRecord[], next: RouteRecord): RouteRecord[] {
  return [...records, next].slice(-ROUTE_RECENT);
}

/** A record as read: one kept before the runtime's pick carries its probability as `confidence`. */
function recordOf(raw: Record<string, unknown>): RouteRecord {
  const { confidence, ...rest } = raw;
  const record = rest as unknown as RouteRecord;
  return record.probability === undefined && typeof confidence === "number" ? { ...record, probability: confidence } : record;
}

/** The records a stored value holds; none when it is not a list of them. */
export function parseRecords(stored: string | null): RouteRecord[] {
  try {
    const raw: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((r) => typeof r?.crew === "string" && typeof r?.reason === "string").map(recordOf)
      : [];
  } catch {
    return [];
  }
}
