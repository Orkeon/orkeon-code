// /route [on|off|why]: the routing of the crews a command launches (ADR 0027). `on` and `off` set `route.agents` for
// the session, as `/config set` would; bare, it says where the routing stands; `why` shows the last routed launches.
// A routed crew runs on a rung of the ladder, with the effort /effort stored: bare, /route also says, rung by rung,
// what that rung's model takes and what the stored effort becomes on it, as the runtime judges them (Orkeon #359,
// #360).
import type { DecisionModel, ReasoningReader, SessionStore } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import {
  ROUTE_AGENTS_CONFIG_KEY, ROUTE_LADDER_CONFIG_KEY, ladderOf, parseRecords, routeOn,
} from "../../../shared/domain/agents/model-route.ts";
import { providerEffort } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import type { EffortLevel } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import { EFFORT_STATE_KEY, ROUTE_RECENT_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { routeWhy } from "../../../shared/application/agents/route-agent.ts";
import { HOST_DEFAULT_MODEL } from "../../../shared/application/agents/messages.ts";
import type { CommandView } from "../view.ts";
import { effortNote } from "./effort.ts";
import { NOTHING_ROUTED_YET, ROUTE_USAGE, modelTakes, routeSet, routeStatus, routedRecord, rungLine } from "./messages.ts";

export interface RouteCommandDeps {
  config: Pick<ConfigStore, "readValue" | "readSession" | "writeSession">;
  session: Pick<SessionStore, "readState">;
  decision: Pick<DecisionModel, "available">;
  /** What each rung's model takes for reasoning; absent, or answering nothing for a rung: no line for it. */
  reasoning?: ReasoningReader;
}

/** The line of one rung: what the stored effort becomes on its model when it does not go as asked, else the levels
 *  that model takes; none when the runtime cannot tell (a profile the host does not declare, a model the table
 *  does not know and no effort stored). */
function rungReasoning(rung: string, effort: EffortLevel | undefined, reasoning: ReasoningReader): string | null {
  const target = { profile: rung, model: "" };
  const capabilities = reasoning.capabilities(target);
  const note = effort === undefined ? "" : effortNote(reasoning.effort(target, effort), capabilities);
  if (note !== "") return rungLine(rung, note);
  return capabilities !== null && capabilities.known ? rungLine(rung, modelTakes(capabilities.model, capabilities.efforts)) : null;
}

async function status(deps: RouteCommandDeps): Promise<CommandView> {
  const on = routeOn((await deps.config.readValue(ROUTE_AGENTS_CONFIG_KEY)).value);
  const ladder = ladderOf((await deps.config.readValue(ROUTE_LADDER_CONFIG_KEY)).value);
  const head = routeStatus(on, ladder.join(","), deps.decision.available());
  const { reasoning } = deps;
  if (reasoning === undefined) return { text: head };
  const effort = providerEffort(await deps.session.readState(EFFORT_STATE_KEY).catch(() => null));
  const rungs = ladder.map((rung) => rungReasoning(rung, effort, reasoning)).filter((line) => line !== null);
  return { text: [head, ...rungs].join("\n") };
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
