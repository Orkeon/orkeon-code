// The profile a crew is launched on (ADR 0027): with `route.agents` on and a decision model on the host, the
// runtime's System One pick (Orkeon #460) reads the command and picks a rung of `route.ladder`, between the floor the
// project's rules raise and the session's profile, the ceiling and the fallback (shared/domain/agents/model-route.ts).
// It fails open at every step: the setting off or unreadable, no decision model, a session on a profile outside the
// ladder, a host without the pick, a refused option, a circuit off and an answer under the bar or missing leave the
// session's profile as it is. A routed launch also carries the session's profile, which the crew falls back on when
// the host declares no profile of the rung's name (orkeon/llm-profile.ts). Each choice the pick makes is logged and
// kept for `/route why`. The act of a sub-agent inside a crew (a reviewer, the auditor) is routed by the same pick,
// under its charter's name (actRoute): it is moved only on a decision, and off the crew's profile.
import type { DecisionModel, Files, Logger, ProfilePick, ProfilePicker, SessionStore } from "../ports.ts";
import type { ConfigStore } from "../config-store.ts";
import { WORKSPACE } from "../../domain/vfs.ts";
import { ROUTE_RECENT_STATE_KEY } from "../../domain/session-keys.ts";
import type { RouteChoice, RouteRules } from "../../domain/agents/model-route.ts";
import {
  NO_ROUTE_RULES, ROUTE_AGENTS_CONFIG_KEY, ROUTE_LADDER_CONFIG_KEY, ROUTE_RULES_FILE, ladderOf, parseRecords, parseRouteRules,
  routable, routeBounds, routeDecided, routeFloor, routeNotAsked, routeOn, routeState, withRecord,
} from "../../domain/agents/model-route.ts";
import {
  HOST_DEFAULT_MODEL, ROUTE_WHY, ROUTE_WITHOUT_DECISION_MODEL, pickedWith, routeKeepsProfile, routedLine,
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

/** Why a choice stands, with the model's pick when it made one. */
export function routeWhy(choice: Pick<RouteChoice, "reason" | "picked" | "probability">): string {
  const why = ROUTE_WHY[choice.reason];
  return choice.picked === undefined || choice.probability === undefined ? why : `${why}; ${pickedWith(choice.picked, choice.probability)}`;
}

/** The choice an answer of the pick makes. */
function choiceOf(answer: ProfilePick): RouteChoice {
  const choice: RouteChoice = { profile: answer.value, reason: answer.reason };
  if (answer.picked !== null) choice.picked = answer.picked;
  if (answer.picked !== null && answer.probability !== null) choice.probability = answer.probability;
  return choice;
}

async function remember(session: RouteDeps["session"], crew: string, choice: RouteChoice): Promise<void> {
  try {
    const records = withRecord(parseRecords(await session.readState(ROUTE_RECENT_STATE_KEY)), { crew, ...choice });
    await session.writeState(ROUTE_RECENT_STATE_KEY, JSON.stringify(records));
  } catch { /* the record is a convenience: the launch goes on without it */ }
}

/** The choice made for `task`, logged and kept; null when nothing was asked (the setting off, no decision model, a
 *  session's profile outside the ladder, a host without the pick or a refused option, a circuit off, no ladder). */
async function choose(deps: RouteDeps, task: RouteTask, sessionProfile: string | null): Promise<RouteChoice | null> {
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
  const answer = await deps.picker.pick(routeState(task.crew, task.brief), routeBounds(ladder, sessionProfile, floor));
  if (answer === null || routeNotAsked(answer.reason)) return null;
  const choice = choiceOf(answer);
  deps.log.info(routedLine(task.crew, choice.profile ?? HOST_DEFAULT_MODEL, routeWhy(choice)));
  await remember(deps.session, task.crew, choice);
  return choice;
}

/** The profile `task.crew` is launched on, the session being on `sessionProfile` (null: the host's default model). */
export async function routeAgent(deps: RouteDeps, task: RouteTask, sessionProfile: string | null): Promise<string | null> {
  const choice = await choose(deps, task, sessionProfile);
  return choice === null ? sessionProfile : choice.profile;
}

/** The profile one sub-agent act is moved to; null leaves the act on the profile the crew's agent runs on. */
export type ActRoute = (task: RouteTask) => Promise<string | null>;

/** The profiles a crew's acts are routed between: the session's (the ceiling) and the one the crew runs on. */
export interface ActProfiles {
  session: string | null;
  crew: string | null;
}

/** The route of a crew's sub-agent acts: the launch's pick, with the session's profile as the ceiling. It moves an
 *  act only on a decision (routeDecided): nothing asked, no answer or an unsure pick leave the act where the crew
 *  runs, as does an answer that is the crew's own profile. */
export function actRoute(deps: RouteDeps, profiles: ActProfiles): ActRoute {
  return async (task) => {
    const choice = await choose(deps, task, profiles.session);
    if (choice === null || !routeDecided(choice.reason) || choice.profile === profiles.crew) return null;
    return choice.profile;
  };
}
