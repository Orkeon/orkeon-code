// The profile a crew is launched on (ADR 0027): with `route.agents` on and a decision model on the host, the model
// reads the command and picks a rung of `route.ladder`; the project's rules raise a floor and the session's profile
// is the ceiling (shared/domain/agents/model-route.ts). It fails open at every step: the setting off or unreadable,
// no decision model, a session on a profile outside the ladder, a model that does not answer or is not sure leave
// the session's profile as it is. Each routed launch is logged and kept for `/route why`.
import type { DecisionModel, Files, Logger, SessionStore } from "../ports.ts";
import type { ConfigStore } from "../config-store.ts";
import { WORKSPACE } from "../../domain/vfs.ts";
import { ROUTE_RECENT_STATE_KEY } from "../../domain/session-keys.ts";
import type { RouteChoice, RouteRules } from "../../domain/agents/model-route.ts";
import {
  NO_ROUTE_RULES, ROUTE_AGENTS_CONFIG_KEY, ROUTE_LADDER_CONFIG_KEY, ROUTE_RULES_FILE, ladderOf, parseRecords, parseRouteRules,
  routable, routeFloor, routeOf, routeOn, routeQuestions, routeState, withRecord,
} from "../../domain/agents/model-route.ts";
import {
  HOST_DEFAULT_MODEL, ROUTE_WHY, ROUTE_WITHOUT_DECISION_MODEL, pickedWith, routeKeepsProfile, routedLine,
} from "./messages.ts";

export interface RouteDeps {
  config: Pick<ConfigStore, "readValue">;
  decision: DecisionModel;
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
export function routeWhy(choice: Pick<RouteChoice, "reason" | "picked" | "confidence">): string {
  const why = ROUTE_WHY[choice.reason];
  return choice.picked === undefined || choice.confidence === undefined ? why : `${why}; ${pickedWith(choice.picked, choice.confidence)}`;
}

async function remember(session: RouteDeps["session"], crew: string, choice: RouteChoice): Promise<void> {
  try {
    const records = withRecord(parseRecords(await session.readState(ROUTE_RECENT_STATE_KEY)), { crew, ...choice });
    await session.writeState(ROUTE_RECENT_STATE_KEY, JSON.stringify(records));
  } catch { /* the record is a convenience: the launch goes on without it */ }
}

/** The profile `task.crew` is launched on, the session being on `sessionProfile` (null: the host's default model). */
export async function routeAgent(deps: RouteDeps, task: RouteTask, sessionProfile: string | null): Promise<string | null> {
  if (!routeOn(await setting(deps.config, ROUTE_AGENTS_CONFIG_KEY))) return sessionProfile;
  if (!deps.decision.available()) {
    deps.log.warn(ROUTE_WITHOUT_DECISION_MODEL);
    return sessionProfile;
  }
  const ladder = ladderOf(await setting(deps.config, ROUTE_LADDER_CONFIG_KEY));
  if (sessionProfile !== null && !routable(sessionProfile, ladder)) {
    deps.log.info(routeKeepsProfile(sessionProfile, ladder.join(",")));
    return sessionProfile;
  }
  const floor = routeFloor(await rulesOf(deps.files), task.crew, task.brief, ladder);
  const answers = await deps.decision.ask(routeState(task.crew, task.brief), routeQuestions(ladder));
  const choice = routeOf(answers, ladder, sessionProfile, floor);
  deps.log.info(routedLine(task.crew, choice.profile ?? HOST_DEFAULT_MODEL, routeWhy(choice)));
  await remember(deps.session, task.crew, choice);
  return choice.profile;
}
