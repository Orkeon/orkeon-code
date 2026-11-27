// The profile a crew is launched on (ADR 0027): with `route.agents` on and a decision model on the host, the
// runtime's System One pick (Orkeon #460) reads the command and picks a rung of `route.ladder`, between the floor the
// project's rules raise and the session's profile, the ceiling and the fallback (shared/domain/agents/model-route.ts).
// It fails open at every step, and says why whenever something is wrong: the setting off or unreadable and a host
// without the pick are silent; no decision model, a circuit that is off, no usable ladder and a pick the runtime
// refuses (its message kept) are each one warning; a session on a profile outside the ladder is one line. None of
// them is a choice: the session's profile stands and nothing is kept. A session whose own rung is the one rung left
// (the lowest, or a rule's floor at it or above) asks nothing and says nothing. An answer under the bar or missing
// is a choice that decides nothing: the fallback stands, which is the session's profile, or, for a session on the
// host's default model, the floor of a rule when one applies. A routed launch also carries the session's profile,
// which the crew falls back on when the host declares no profile of the rung's name (orkeon/llm-profile.ts). Each
// choice is logged, on the profile really used, and kept for `/route why`. The act of a sub-agent inside a crew (a
// reviewer, the auditor) is routed by the same pick, under its charter's name (actRoute): a decision moves it, off the
// crew's profile; without a decision it stays on the crew's profile, save under a rule's floor on the host's default
// model, which it takes as a launch does. With `route.effort` on, a launch or an act that takes a thinking level asks
// for it in the same call (ADR 0039): among the host's levels, never above the one `/effort` stored. A level the pick
// decided moves the launch or the act; an unsure or missing one leaves the level in place, and the line says so.
import type { DecisionModel, EffortPick, Files, Logger, ProfilePick, ProfilePicker, SessionStore } from "../ports.ts";
import type { ConfigStore } from "../config-store.ts";
import { WORKSPACE } from "../../domain/vfs.ts";
import { EFFORT_STATE_KEY, ROUTE_RECENT_STATE_KEY } from "../../domain/session-keys.ts";
import { providerEffort } from "../../domain/agent-policy/behavior-flags.ts";
import type { EffortLevel } from "../../domain/agent-policy/behavior-flags.ts";
import type {
  EffortBounds, EffortChoice, RouteChoice, RouteChoiceReason, RouteRules, RouteStands,
} from "../../domain/agents/model-route.ts";
import {
  NO_ROUTE_RULES, ROUTE_AGENTS_CONFIG_KEY, ROUTE_EFFORT_CONFIG_KEY, ROUTE_LADDER_CONFIG_KEY, ROUTE_RULES_FILE, asOnLadder,
  effortBounds, effortDecided, effortMoved, ladderOf, parseRecords, parseRouteRules, routable, routeBounds, routeDecided,
  routeFloor, routeHeld, routeNotAsked, routeOn, routeState, withRecord,
} from "../../domain/agents/model-route.ts";
import {
  EFFORT_WHY, HOST_DEFAULT_MODEL, ROUTE_CIRCUIT_OFF, ROUTE_NO_LADDER, ROUTE_STANDS, ROUTE_WHY, ROUTE_WHY_RULE_ALONE,
  ROUTE_WITHOUT_DECISION_MODEL, effortChosen, effortLeft, pickedWith, routeKeepsProfile, routeRefused, routedLine,
} from "./messages.ts";

export interface RouteDeps {
  config: Pick<ConfigStore, "readValue">;
  decision: Pick<DecisionModel, "available">;
  picker: ProfilePicker;
  files: Pick<Files, "read">;
  session: Pick<SessionStore, "readState" | "writeState">;
  log: Pick<Logger, "info" | "warn">;
}

/** What is routed: the crew, and the command that launches it, as typed. */
export interface RouteTask {
  crew: string;
  brief: string;
  /** Whether what is routed takes a thinking level (a crew that forwards `/effort`, a sub-agent's act): with
   *  `route.effort` on, the pick is asked for the level too. */
  thinks?: boolean;
}

/** What a route answers: the profile and the thinking level of a launch, or those one act is moved to. */
export interface Routed {
  /** A launch: the profile it runs on (null: the host's default model). An act: the profile it is moved to (null:
   *  it stays on the profile its crew's agent runs on). */
  profile: string | null;
  /** The level the pick decided; null leaves the one in place (what `/effort` stored, an agent's own). */
  effort: EffortLevel | null;
}

async function setting(config: RouteDeps["config"], key: string): Promise<unknown> {
  try {
    return (await config.readValue(key)).value;
  } catch {
    return undefined;
  }
}

/** The project's floors; none when the file is absent or unreadable. */
async function rulesOf(files: RouteDeps["files"]): Promise<RouteRules> {
  try {
    return parseRouteRules(await files.read(`${WORKSPACE}/${ROUTE_RULES_FILE}`));
  } catch {
    return NO_ROUTE_RULES;
  }
}

/** What a choice of a thinking level says: the level and why, or that the level in place was left and why. */
function effortWhy(choice: EffortChoice): string {
  const reason = EFFORT_WHY[choice.reason];
  const why = choice.picked === undefined || choice.probability === undefined ? reason : `${reason}; ${pickedWith(choice.picked, choice.probability)}`;
  return effortDecided(choice.reason) && choice.level !== null ? effortChosen(choice.level, why) : effortLeft(why);
}

/** Why a choice stands: its reason, what stands when it decided nothing, and the model's pick when it made one. A
 *  floor with no pick is the one rung a rule leaves: no model was asked. The thinking level picked with it follows. */
export function routeWhy(choice: Pick<RouteChoice, "reason" | "picked" | "probability" | "stands" | "effort">): string {
  const reason = choice.reason === "floor" && choice.picked === undefined ? ROUTE_WHY_RULE_ALONE : ROUTE_WHY[choice.reason];
  const stood = choice.stands === undefined || routeDecided(choice.reason) ? reason : `${reason}, ${ROUTE_STANDS[choice.stands]}`;
  const why = choice.picked === undefined || choice.probability === undefined ? stood : `${stood}; ${pickedWith(choice.picked, choice.probability)}`;
  return choice.effort === undefined ? why : `${why}; ${effortWhy(choice.effort)}`;
}

/** What the pick answered for one task. */
interface Asked {
  /** The answer, as the ladder spells its profiles. */
  choice: RouteChoice;
  /** Whether a rule's floor is the fallback: a session on the host's default model, under a rule. */
  floored: boolean;
  /** Whether the answer is worth a line and a record; not when nothing was asked at all. */
  said: boolean;
}

/** The choice an answer of the pick makes; its level only when one was asked (`levelAsked`). */
function choiceOf(answer: ProfilePick, reason: RouteChoiceReason, ladder: readonly string[], levelAsked: boolean): RouteChoice {
  const choice: RouteChoice = { profile: answer.value === null ? null : asOnLadder(ladder, answer.value), reason };
  if (answer.picked !== null) choice.picked = asOnLadder(ladder, answer.picked);
  if (answer.picked !== null && answer.probability !== null) choice.probability = answer.probability;
  const effort = levelAsked ? effortChoiceOf(answer.effort) : undefined;
  if (effort !== undefined) choice.effort = effort;
  return choice;
}

/** The choice of a level an answer makes; none when no level was asked, or with the circuit off. */
function effortChoiceOf(pick: EffortPick | undefined): EffortChoice | undefined {
  if (pick === undefined || pick.reason === "circuit-off") return undefined;
  const choice: EffortChoice = { level: pick.value, reason: pick.reason };
  if (pick.picked !== null) choice.picked = pick.picked;
  if (pick.picked !== null && pick.probability !== null) choice.probability = pick.probability;
  return choice;
}

/** The bounds of the level asked with the profile: none unless `route.effort` is on and the task takes a level; then
 *  the level `/effort` stored as the highest, any of the host's when the session stored none or cannot say. */
async function effortAsked(deps: RouteDeps, task: RouteTask): Promise<EffortBounds | undefined> {
  if (task.thinks !== true || !routeOn(await setting(deps.config, ROUTE_EFFORT_CONFIG_KEY))) return undefined;
  try {
    return effortBounds(providerEffort(await deps.session.readState(EFFORT_STATE_KEY)));
  } catch {
    return effortBounds(undefined);
  }
}

/** What the pick answers for `task`; null when there is no choice (the setting off, no decision model, a session's
 *  profile outside the ladder, a host without the pick, a refusal, a circuit off, no ladder), the cause said. */
async function ask(deps: RouteDeps, task: RouteTask, sessionProfile: string | null): Promise<Asked | null> {
  if (!routeOn(await setting(deps.config, ROUTE_AGENTS_CONFIG_KEY))) return null;
  if (!deps.decision.available()) {
    deps.log.warn(ROUTE_WITHOUT_DECISION_MODEL);
    return null;
  }
  const ladder = ladderOf(await setting(deps.config, ROUTE_LADDER_CONFIG_KEY));
  if (sessionProfile !== null && !routable(sessionProfile, ladder)) {
    deps.log.info(routeKeepsProfile(sessionProfile, ladder.join(",")));
    return null;
  }
  const floor = routeFloor(await rulesOf(deps.files), task.crew, task.brief, ladder);
  // The session's rung is the one rung left: the answer without a call, and nothing to say.
  if (routeHeld(ladder, sessionProfile, floor)) return { choice: { profile: sessionProfile, reason: "ceiling" }, floored: false, said: false };
  const bounds = routeBounds(ladder, sessionProfile, floor);
  const level = await effortAsked(deps, task);
  const answer = await deps.picker.pick(routeState(task.crew, task.brief), bounds, level);
  if (answer === null) return null;
  if ("refused" in answer) {
    deps.log.warn(routeRefused(answer.refused));
    return null;
  }
  const { reason } = answer;
  if (routeNotAsked(reason)) {
    deps.log.warn(reason === "circuit-off" ? ROUTE_CIRCUIT_OFF : ROUTE_NO_LADDER);
    return null;
  }
  return { choice: choiceOf(answer, reason, ladder, level !== undefined), floored: sessionProfile === null && bounds.floor !== undefined, said: true };
}

async function remember(session: RouteDeps["session"], crew: string, choice: RouteChoice): Promise<void> {
  try {
    const records = withRecord(parseRecords(await session.readState(ROUTE_RECENT_STATE_KEY)), { crew, ...choice });
    await session.writeState(ROUTE_RECENT_STATE_KEY, JSON.stringify(records));
  } catch { /* the record is a convenience: the launch goes on without it */ }
}

/** Logs and keeps a choice, on the profile really used; `stands` says what stood when the pick decided nothing. */
async function settle(deps: RouteDeps, crew: string, asked: Asked, profile: string | null, stands: RouteStands): Promise<void> {
  if (!asked.said) return;
  const choice: RouteChoice = routeDecided(asked.choice.reason) ? asked.choice : { ...asked.choice, profile, stands };
  deps.log.info(routedLine(crew, choice.profile ?? HOST_DEFAULT_MODEL, routeWhy(choice)));
  await remember(deps.session, crew, choice);
}

/** The profile `task.crew` is launched on, the session being on `sessionProfile` (null: the host's default model),
 *  and the thinking level the pick decided for it, when it was asked one. */
export async function routeAgent(deps: RouteDeps, task: RouteTask, sessionProfile: string | null): Promise<Routed> {
  const asked = await ask(deps, task, sessionProfile);
  if (asked === null) return { profile: sessionProfile, effort: null };
  const { profile } = asked.choice;
  await settle(deps, task.crew, asked, profile, sessionProfile !== null ? "session" : asked.floored ? "floor" : "default");
  return { profile, effort: effortMoved(asked.choice.effort) };
}

/** Where one sub-agent act is moved: a null profile leaves it on the profile the crew's agent runs on, a null level on
 *  the agent's own. */
export type ActRoute = (task: RouteTask) => Promise<Routed>;

/** An act left where its crew runs. */
export const NOT_MOVED: Routed = { profile: null, effort: null };

/** What `route` answers for an act: left where it is without a route, or when the route throws. */
export async function actRouted(route: ActRoute | undefined, task: RouteTask): Promise<Routed> {
  if (route === undefined) return NOT_MOVED;
  try {
    return await route(task);
  } catch {
    return NOT_MOVED;
  }
}

/** The profiles a crew's acts are routed between: the session's (the ceiling) and the one the crew runs on. */
export interface ActProfiles {
  session: string | null;
  crew: string | null;
}

/** The route of a crew's sub-agent acts: the launch's pick, with the session's profile as the ceiling. A decision
 *  (routeDecided) moves the act, as does, without one, the floor of a rule for a session on the host's default model
 *  (the fallback the pick answers then); nothing asked, and no answer or an unsure pick otherwise, leave the act where
 *  the crew runs, as does an answer that is the crew's own profile. An act takes a thinking level: with `route.effort`
 *  on the pick is asked one, and a level it decided moves the act whatever became of its profile. */
export function actRoute(deps: RouteDeps, profiles: ActProfiles): ActRoute {
  return async (task) => {
    const asked = await ask(deps, { ...task, thinks: true }, profiles.session);
    if (asked === null) return NOT_MOVED;
    const moves = routeDecided(asked.choice.reason) || asked.floored;
    const profile = moves ? asked.choice.profile : profiles.crew;
    await settle(deps, task.crew, asked, profile, asked.floored ? "floor" : "crew");
    return { profile: profile === profiles.crew ? null : profile, effort: effortMoved(asked.choice.effort) };
  };
}
