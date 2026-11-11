// /route [on|off|why]: the routing of the crews a command launches (ADR 0027). `on` and `off` set `route.agents` for
// the session, as `/config set` would; bare, it says where the routing stands; `why` shows the last routed launches.
import type { DecisionModel, SessionStore } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import {
  ROUTE_AGENTS_CONFIG_KEY, ROUTE_LADDER_CONFIG_KEY, ladderOf, parseRecords, routeOn,
} from "../../../shared/domain/agents/model-route.ts";
import { ROUTE_RECENT_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { routeWhy } from "../../../shared/application/agents/route-agent.ts";
import { HOST_DEFAULT_MODEL } from "../../../shared/application/agents/messages.ts";
import type { CommandView } from "../view.ts";
import { NOTHING_ROUTED_YET, ROUTE_USAGE, routeSet, routeStatus, routedRecord } from "./messages.ts";

export interface RouteCommandDeps {
  config: Pick<ConfigStore, "readValue" | "readSession" | "writeSession">;
  session: Pick<SessionStore, "readState">;
  decision: Pick<DecisionModel, "available">;
}

async function status(deps: RouteCommandDeps): Promise<CommandView> {
  const on = routeOn((await deps.config.readValue(ROUTE_AGENTS_CONFIG_KEY)).value);
  const ladder = ladderOf((await deps.config.readValue(ROUTE_LADDER_CONFIG_KEY)).value);
  return { text: routeStatus(on, ladder.join(","), deps.decision.available()) };
}

async function why(deps: RouteCommandDeps): Promise<CommandView> {
  const records = parseRecords(await deps.session.readState(ROUTE_RECENT_STATE_KEY).catch(() => null));
  if (records.length === 0) return { text: NOTHING_ROUTED_YET };
  return { lines: records.map((r) => routedRecord(r.crew, r.profile ?? HOST_DEFAULT_MODEL, routeWhy(r))) };
}

export async function runRoute(tokens: string[], deps: RouteCommandDeps): Promise<CommandView> {
  const word = (tokens[0] ?? "").toLowerCase();
  if (word === "") return status(deps);
  if (word === "why") return why(deps);
  if (word !== "on" && word !== "off") return { text: ROUTE_USAGE };
  await deps.config.writeSession({ ...await deps.config.readSession(), [ROUTE_AGENTS_CONFIG_KEY]: word });
  return { text: routeSet(word === "on", deps.decision.available()) };
}
