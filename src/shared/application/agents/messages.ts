// The text the agent services report: the lines of a background child, the problems of a sub-agent's answer and the
// lines of the routing.
import type { RouteChoiceReason, RouteStands } from "../../domain/agents/model-route.ts";
import { NO_DECISION_MODEL_CAUSES } from "../messages.ts";

// child-agent.ts
export const CHILD_FAILED = "the child failed";
export const instancesNotWritten = (crew: string, reason: string): string =>
  `${crew}: the agent instances could not be written for /tasks: ${reason}`;
export const tasksStopLine = (crew: string, id: string, agent: string, stopRequested: boolean | undefined): string =>
  `${crew}: /tasks stop ${id} (${agent})${stopRequested ? "" : ": it was no longer running"}`;
export const startedInBackground = (agent: string, id: string, task: string): string =>
  `${agent} ${id} started in the background: ${task}`;
export const STOPPED_BY_TASKS_STOP = "stopped by /tasks stop";
export const CHILD_ENDED_WITHOUT_REPLY = "the child ended without leaving a reply";
export const waitReturnedAtOnce = (agent: string, early: number): string =>
  `the wait for ${agent} returned at once ${early} times in a row`;

// run-sub-agent.ts
/** The log line of an answer refused and asked again: what was wrong with it. */
export const answerAskedAgain = (who: string, problems: readonly string[]): string =>
  `${who}: answer refused, asked again: ${problems.join("; ")}`;
export const answerDidNotParse = (reason: string): string => `the answer did not parse: ${reason}`;
export const briefTooLong = (length: number, max: number): string => `the brief is ${length} characters, over ${max}`;
export const ROUTE_WITHOUT_DECISION_MODEL =
  "route.agents is on and the host has no decision model to ask: the session's profile stands " +
  NO_DECISION_MODEL_CAUSES;
export const ROUTE_CIRCUIT_OFF =
  "route.agents is on and the runtime's decision circuit is off for this run (a crew on decision.mode none, a run " +
  "scope that turns the circuit off, such as a forge trial pass): nothing is routed, the session's profile stands";
export const ROUTE_NO_LADDER =
  "route.agents is on and the runtime had no usable ladder to pick from: nothing is routed, the session's profile stands";
export const routeRefused = (message: string): string =>
  `route.agents is on and the runtime refused the pick: nothing is routed, the session's profile stands (${message})`;
export const routeKeepsProfile = (profile: string, ladder: string): string =>
  `route.agents is on and the session's llm.profile '${profile}' is not on the ladder (${ladder}): it stands`;
export const routedLine = (crew: string, profile: string, why: string): string => `route: ${crew} on '${profile}' (${why})`;
/** Why a choice stands, by its reason: the reasons a choice can carry, and no other. */
export const ROUTE_WHY: Readonly<Record<RouteChoiceReason, string>> = {
  model: "the decision model's pick",
  floor: "raised by a rule of .orkeon/route-rules.json",
  ceiling: "held at the session's profile",
  "low-confidence": "the pick was not sure enough",
  "no-answer": "the decision model did not answer",
};
/** The floor that is an answer by itself: the one rung a rule leaves, no model asked. */
export const ROUTE_WHY_RULE_ALONE = "set by a rule of .orkeon/route-rules.json, the one rung it leaves: no model was asked";
/** What stands when the pick decided nothing. */
export const ROUTE_STANDS: Readonly<Record<RouteStands, string>> = {
  session: "the session's profile stands",
  floor: "the floor of a rule of .orkeon/route-rules.json stands",
  default: "the host's default model stands",
  crew: "the act stays on its crew's profile",
};
export const pickedWith = (picked: string, probability: number): string => `picked '${picked}' at ${probability.toFixed(2)}`;
export const HOST_DEFAULT_MODEL = "the host's default model";
