// /route [on|off|why]: the routing of the crews a command launches (ADR 0027). `on` and `off` set `route.agents` for
// the session, as `/config set` would; bare, it says where the routing stands; `why` shows the last routed launches.
// A routed crew runs on a rung of the ladder, with the effort /effort stored: bare, /route also says, rung by rung,
// what that rung's model takes and what the stored effort becomes on it, as the runtime judges them (Orkeon #359,
// #360), and whether the pick chooses the thinking level too (`route.effort`, set with /config). With the routing on
// and the crews launched on a profile outside the ladder, it says that nothing is routed, and which setting names it.
// With the routing on it also makes one test pick, the one a launch of this session makes (the ladder, the launch
// profile as the ceiling and the fallback, no rule's floor), through the runtime's pick the launches route with: a
// model the settings configure and that does not answer (a server that is down, a key refused), a pick the runtime
// refuses (a rung the host does not declare) and a pick that gives nothing back (a host without the pick) each route
// nothing, and the status says so. A launch profile on the lowest rung, or outside the ladder, asks nothing at a
// launch: no test pick is made then, and the state says why. With route.effort on the test pick asks the level a
// launch asks; a level the runtime refuses is a warning line, the state then the one of the profile asked alone.
// A stored route.ladder that is no ladder is a warning line under the status, naming the ladder used instead. A
// setting that cannot be read reads as unset.
import type { DecisionModel, ProfilePicker, ReasoningReader, SessionStore } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import {
  ROUTE_AGENTS_CONFIG_KEY, ROUTE_EFFORT_CONFIG_KEY, ROUTE_LADDER_CONFIG_KEY, ladderMisread, ladderOf, parseRecords, routable,
  routeBounds, routeHeld, routeNotAsked, routeOn,
} from "../../../shared/domain/agents/model-route.ts";
import { AGENTS_PROFILE_CONFIG_KEY, LLM_PROFILE_CONFIG_KEY, llmProfileProblem } from "../../../shared/domain/llm-profile.ts";
import { providerEffort } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import type { EffortLevel } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import { EFFORT_STATE_KEY, ROUTE_RECENT_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { pickProfile, routeEffortBounds, routeWhy } from "../../../shared/application/agents/route-agent.ts";
import type { Picked } from "../../../shared/application/agents/route-agent.ts";
import { HOST_DEFAULT_MODEL } from "../../../shared/application/agents/messages.ts";
import type { CommandView } from "../view.ts";
import { effortWarningNote } from "./effort.ts";
import {
  NOTHING_ROUTED_YET, ROUTE_USAGE, modelTakes, routeLadderInvalid, routeLevelRefusedLine, routeOutsideLadder, routeSet, routeStatus, routedRecord,
  rungLine,
} from "./messages.ts";
import type { DecisionModelState } from "./messages.ts";
import { ROUTE_PROBE_REQUEST } from "./prompts.ts";

export interface RouteCommandDeps {
  config: Pick<ConfigStore, "readValue" | "readSession" | "writeSession">;
  session: Pick<SessionStore, "readState">;
  decision: Pick<DecisionModel, "available">;
  /** The runtime's pick, which a bare /route with the routing on tries once on the ladder. */
  picker: ProfilePicker;
  /** What each rung's model takes for reasoning; absent, or answering nothing for a rung: no line for it. */
  reasoning?: ReasoningReader;
}

/** A setting's value; undefined, as unset, when the store cannot be read. */
async function setting(config: RouteCommandDeps["config"], key: string): Promise<unknown> {
  try {
    return (await config.readValue(key)).value;
  } catch {
    return undefined;
  }
}

/** The line of one rung: what the stored effort becomes on its model when it does not go as asked, else the levels
 *  that model takes; none when the runtime cannot tell (a profile the host does not declare, a model the table
 *  does not know and no effort stored). */
function rungReasoning(rung: string, effort: EffortLevel | undefined, reasoning: ReasoningReader): string | null {
  const target = { profile: rung, model: "" };
  const capabilities = reasoning.capabilities(target);
  const note = effort === undefined ? "" : effortWarningNote(reasoning.effort(target, effort), capabilities);
  if (note !== "") return rungLine(rung, note);
  return capabilities !== null && capabilities.known ? rungLine(rung, modelTakes(capabilities.model, capabilities.efforts)) : null;
}

/** The profile the session's crews are launched on, and the key that names it: `agents.profile`, else
 *  `llm.profile`; null for the host's default model. */
interface LaunchProfile {
  profile: string;
  key: string;
}

async function launchProfile(config: RouteCommandDeps["config"]): Promise<LaunchProfile | null> {
  for (const key of [AGENTS_PROFILE_CONFIG_KEY, LLM_PROFILE_CONFIG_KEY]) {
    const value = await setting(config, key);
    if (typeof value === "string" && llmProfileProblem(value) === undefined) return { profile: value.trim(), key };
  }
  return null;
}

/** Where the host's decision model stands, and the runtime's message when it refused the level part of the test pick. */
interface DecisionStanding {
  state: DecisionModelState;
  levelRefused?: string;
}

/** The state an answer of the test pick says: a profile answered is present, no answer silent, a pick that asked
 *  nothing not asked, a refusal refused with the runtime's message, and nothing back (a host without the pick, a
 *  cancelled call, a reply that does not read) no-pick. */
function stateOf(answer: Picked["answer"]): DecisionModelState {
  if (answer === null) return "no-pick";
  if ("refused" in answer) return { refused: answer.refused };
  if (routeNotAsked(answer.reason)) return "not-asked";
  return answer.reason === "no-answer" ? "silent" : "present";
}

/** Where the host's decision model stands: absent, or present; with the routing on the runtime's pick is tried with
 *  the bounds a launch of this session sends (`launch` as the ceiling and the fallback, no rule's floor), the level
 *  asked as a launch asks it (route.effort on), and, when the runtime refuses that level, once more for the profile
 *  alone (pickProfile). Nothing is tried when a launch asks nothing: `launch` outside the ladder, or on its lowest
 *  rung. A call that throws is silent: the adapter turns every failure into a refusal, and another one may not. */
async function decisionState(
  deps: RouteCommandDeps, on: boolean, ladder: readonly string[], launch: LaunchProfile | null,
): Promise<DecisionStanding> {
  if (!deps.decision.available()) return { state: "absent" };
  if (!on) return { state: "present" };
  const profile = launch?.profile ?? null;
  if (launch !== null && !routable(launch.profile, ladder)) return { state: "outside" };
  if (launch !== null && routeHeld(ladder, profile, 0)) return { state: { lowest: launch.profile, key: launch.key } };
  try {
    const level = await routeEffortBounds(deps);
    const { answer, levelRefused } = await pickProfile(deps.picker, ROUTE_PROBE_REQUEST, routeBounds(ladder, profile, 0), level);
    return levelRefused === undefined ? { state: stateOf(answer) } : { state: stateOf(answer), levelRefused };
  } catch {
    return { state: "silent" };
  }
}

async function status(deps: RouteCommandDeps): Promise<CommandView> {
  const on = routeOn(await setting(deps.config, ROUTE_AGENTS_CONFIG_KEY));
  const stored = await setting(deps.config, ROUTE_LADDER_CONFIG_KEY);
  const ladder = ladderOf(stored);
  const effortPicked = routeOn(await setting(deps.config, ROUTE_EFFORT_CONFIG_KEY));
  const launch = on ? await launchProfile(deps.config) : null;
  const standing = await decisionState(deps, on, ladder, launch);
  const head = routeStatus(on, effortPicked, ladder.join(","), standing.state);
  const levelLine = standing.levelRefused === undefined ? null : routeLevelRefusedLine(standing.levelRefused);
  const misread = ladderMisread(stored) ? routeLadderInvalid(stored, ladder.join(",")) : null;
  const outside = launch !== null && !routable(launch.profile, ladder) ? routeOutsideLadder(launch.profile, launch.key) : null;
  const top = [head, levelLine, misread, outside].filter((line) => line !== null);
  const { reasoning } = deps;
  if (reasoning === undefined) return { text: top.join("\n") };
  const effort = providerEffort(await deps.session.readState(EFFORT_STATE_KEY).catch(() => null));
  const rungs = ladder.map((rung) => rungReasoning(rung, effort, reasoning)).filter((line) => line !== null);
  return { text: [...top, ...rungs].join("\n") };
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
