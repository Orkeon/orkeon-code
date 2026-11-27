// The ports of /route over fakes, and what it shows.
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeProfilePicker } from "../../../support/doubles/fake-profile-picker.ts";
import type { ProfilePick, ProfilePickRefusal } from "../../../../src/shared/application/ports.ts";
import { FakeReasoningReader } from "../../../support/doubles/fake-reasoning-reader.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import {
  GLM_TAKES, HIGH_AS_ASKED, HIGH_UNCHECKED, MEDIUM_DROPPED, MEDIUM_LOWERED, TAKES_NO_EFFORT, UNKNOWN_TAKES,
} from "../../../support/fixtures/reasoning.ts";

/** The ports of /route: a decision model on the host, and a pick that answers `small`. */
export function routeCommandSetup() {
  const config = new FakeConfigStore();
  const session = new FakeSessionStore();
  const decision = new FakeDecisionModel();
  const picker = new FakeProfilePicker();
  return { config, session, decision, picker, deps: { config, session, decision, picker } };
}

export const STATUS_OFF = "route.agents: off; route.effort: off; ladder: small,large (cheapest first); decision model: present.";
export const STATUS_ON_NO_MODEL = "route.agents: on; route.effort: off; ladder: fast,strong (cheapest first); decision model: absent, nothing is routed.";
export const SET_ON = "route.agents: on for this session; /clear clears it.";
export const SET_ON_NO_MODEL = "route.agents: on for this session (the host has no decision model: nothing is routed until it has one); /clear clears it.";
export const SET_OFF = "route.agents: off for this session; /clear clears it.";
export const RECENT = JSON.stringify([
  { crew: "dev-plan", profile: "small", reason: "model", picked: "small", confidence: 0.9 },
  { crew: "code-review", profile: null, reason: "no-answer" },
]);
/** What a session may hold from before: a record whose reason no choice carries any more, and one that says what stood. */
export const RECENT_WITH_CIRCUIT_OFF = JSON.stringify([
  { crew: "dev-plan", profile: "large", reason: "circuit-off" },
  { crew: "dev-reviewer", profile: "small", reason: "low-confidence", picked: "large", probability: 0.4, stands: "crew" },
]);
export const WHY_STANDS_LINES = ["dev-reviewer on 'small': the pick was not sure enough, the act stays on its crew's profile; picked 'large' at 0.40"];
export const WHY_LINES = [
  "dev-plan on 'small': the decision model's pick; picked 'small' at 0.90",
  "code-review on 'the host's default model': the decision model did not answer",
];

/** /route on a host whose `small` rung runs a model that takes no effort and whose `large` rung runs GLM-5.3. */
export function routeOnGlmSetup() {
  const { config, session, decision, picker } = routeCommandSetup();
  const reasoning = new FakeReasoningReader();
  reasoning.byProfile = {
    small: { capabilities: TAKES_NO_EFFORT, reports: { medium: MEDIUM_DROPPED } },
    large: { capabilities: GLM_TAKES, reports: { medium: MEDIUM_LOWERED, high: HIGH_AS_ASKED } },
    custom: { capabilities: UNKNOWN_TAKES, reports: { high: HIGH_UNCHECKED } },
  };
  return { config, session, decision, picker, reasoning, deps: { config, session, decision, picker, reasoning } };
}

export const STATUS_WITH_RUNGS =
  `${STATUS_OFF}\n  small: plain-1 takes no effort level\n  large: glm-5.3 takes low, high, max`;
export const STATUS_WITH_MEDIUM =
  `${STATUS_OFF}\n  small: 'medium' is not sent to plain-1 (it takes no effort level)\n` +
  "  large: 'medium' is sent to glm-5.3 as 'low' (it takes low, high, max)";

/** The ladder `custom,large`: a rung on a model the table does not know says nothing, with or without a level. */
export const CUSTOM_LADDER = { "route.ladder": "custom,large" };
const STATUS_CUSTOM_LADDER = "route.agents: off; route.effort: off; ladder: custom,large (cheapest first); decision model: present.";
export const STATUS_CUSTOM_WITH_HIGH = `${STATUS_CUSTOM_LADDER}\n  large: glm-5.3 takes low, high, max`;

export const STATUS_EFFORT_ON = "route.agents: on; route.effort: on; ladder: small,large (cheapest first); decision model: present.";
export const STATUS_EFFORT_IDLE =
  "route.agents: off; route.effort: on (asks nothing while route.agents is off); ladder: small,large (cheapest first); decision model: present.";

/** A launch whose thinking level was picked with its profile, and one whose level the pick was not sure of. */
export const RECENT_WITH_LEVEL = JSON.stringify([
  { crew: "dev-plan", profile: "small", reason: "model", picked: "small", probability: 0.9, effort: { level: "low", reason: "model", picked: "low", probability: 0.8 } },
  { crew: "dev-reviewer", profile: "small", reason: "model", picked: "small", probability: 0.7, effort: { level: null, reason: "no-answer" } },
]);
export const WHY_LEVEL_LINES = [
  "dev-plan on 'small': the decision model's pick; picked 'small' at 0.90; effort 'low' (the decision model's pick; picked 'low' at 0.80)",
  "dev-reviewer on 'small': the decision model's pick; picked 'small' at 0.70; effort left as it was (the decision model did not answer)",
];

const STATUS_ON = "route.agents: on; route.effort: off; ladder: small,large (cheapest first); decision model: present.";
const STATUS_ON_HEAD = "route.agents: on; route.effort: off; ladder: small,large (cheapest first); decision model: ";
/** The state of a decision model a launch asks nothing, its profile being off the ladder: no test pick is made. */
const NOT_TRIED_OUTSIDE = "configured, not tried: a launch of this session asks it nothing, its profile being off the ladder";
const STATUS_OUTSIDE = `${STATUS_ON_HEAD}${NOT_TRIED_OUTSIDE}.`;

/** What a bare /route says of the profile the crews are launched on, by where it stands on the ladder. */
export const OUTSIDE_LADDER_CASES: readonly { readonly name: string; readonly values: Record<string, string>; readonly text: string }[] = [
  {
    name: "says that nothing is routed under an agents.profile outside the ladder",
    values: { "route.agents": "on", "agents.profile": "subscription", "llm.profile": "large" },
    text: `${STATUS_OUTSIDE}\n  ⚠ agents.profile is 'subscription', which is not on the ladder: nothing is routed. Set it to a rung, or unset it.`,
  },
  {
    name: "says that nothing is routed under an llm.profile outside the ladder",
    values: { "route.agents": "on", "llm.profile": "guarded" },
    text: `${STATUS_OUTSIDE}\n  ⚠ llm.profile is 'guarded', which is not on the ladder: nothing is routed. Set it to a rung, or unset it.`,
  },
  { name: "says nothing more under a profile that is a rung, whatever its case", values: { "route.agents": "on", "agents.profile": "Large" }, text: STATUS_ON },
  {
    name: "says nothing of a profile outside the ladder while the routing is off",
    values: { "agents.profile": "subscription" }, text: "route.agents: off; route.effort: off; ladder: small,large (cheapest first); decision model: present.",
  },
  {
    name: "says that nothing is routed under an llm.profile outside the ladder behind an agents.profile that is no name",
    values: { "route.agents": "on", "agents.profile": "two words", "llm.profile": "guarded" },
    text: `${STATUS_OUTSIDE}\n  ⚠ llm.profile is 'guarded', which is not on the ladder: nothing is routed. Set it to a rung, or unset it.`,
  },
];

const pick = (reason: ProfilePick["reason"], value: string | null = "small"): ProfilePick => ({ value, reason, picked: null, probability: null });
const REFUSED: ProfilePickRefusal = { refused: "services.get(\"pick\").pick { profile.ladder } profile.ladder names the LLM profile 'small', which this host does not offer. Known profiles: default, fast, strong. A profile is defined by the host under Llm:Profiles:<name>.", part: "profile" };
const NOTHING_BACK =
  "configured, but the test pick gave nothing back just now (a host without the pick, a cancelled call, a reply that does not read): nothing is routed until it does";

/** What a bare /route with the routing on says of the decision model, by what its test pick answers. */
export const DECISION_STATE_CASES: readonly { name: string; answer?: ProfilePick | ProfilePickRefusal | null; thrown?: Error; text: string }[] = [
  { name: "says the decision model is present when the test pick decides a rung", answer: { ...pick("model"), picked: "small", probability: 0.9 }, text: STATUS_ON },
  { name: "says the decision model is present when the test pick answers, unsure", answer: { value: "large", reason: "low-confidence", picked: "small", probability: 0.4 }, text: STATUS_ON },
  {
    name: "says that a configured decision model gave no answer to the test pick", answer: pick("no-answer", null),
    text: `${STATUS_ON_HEAD}configured, but it gave no answer to a test pick just now (a server that is down, a key refused): nothing is routed until it answers.`,
  },
  {
    name: "reads a picker that throws, which the runtime's adapter never does, as a decision model that gave no answer",
    thrown: new Error("a picker that throws"),
    text: `${STATUS_ON_HEAD}configured, but it gave no answer to a test pick just now (a server that is down, a key refused): nothing is routed until it answers.`,
  },
  {
    name: "says the runtime refused the test pick, with its message", answer: REFUSED,
    text: `${STATUS_ON_HEAD}configured, but the runtime refused a test pick on the ladder just now: nothing is routed until it accepts one (${REFUSED.refused}).`,
  },
  {
    name: "says the runtime refused the test pick with a refusal that names no part, with its message",
    answer: { refused: "services.get(\"pick\").pick { options } asks neither a profile nor an effort: give { profile } or { effort }, or both." },
    text: `${STATUS_ON_HEAD}configured, but the runtime refused a test pick on the ladder just now: nothing is routed until it accepts one (services.get("pick").pick { options } asks neither a profile nor an effort: give { profile } or { effort }, or both.).`,
  },
  {
    name: "says the test pick gave nothing back", answer: null,
    text: `${STATUS_ON_HEAD}${NOTHING_BACK}.`,
  },
  {
    name: "says the runtime asked the decision model nothing when its circuit is off", answer: pick("circuit-off", null),
    text: `${STATUS_ON_HEAD}configured, but the runtime asked it nothing for a test pick just now (its decision circuit is off for this run): nothing is routed.`,
  },
  {
    name: "says the runtime asked the decision model nothing when it has no ladder", answer: pick("no-ladder", null),
    text: `${STATUS_ON_HEAD}configured, but the runtime asked it nothing for a test pick just now (its decision circuit is off for this run): nothing is routed.`,
  },
];

/** The test pick a bare /route makes with the routing on: a fixed request, on the session's ladder. */
export const PROBE_ASKED = [{
  request: "A test request from /route, to check that the routing answers: any rung of the ladder is a right answer.",
  options: { ladder: ["small", "large"] },
}];

const misreadLine = (stored: string): string =>
  `  ⚠ route.ladder is '${stored}', which is no ladder: the ladder small,large is used instead. Set it to two rungs or more, each once, or unset it.`;

/** What a bare /route says of a stored route.ladder, by what it holds. */
export const MISREAD_LADDER_CASES: readonly { name: string; values: Record<string, string>; text: string }[] = [
  { name: "warns under the status of a route.ladder that names one profile alone", values: { "route.agents": "on", "route.ladder": "small" }, text: `${STATUS_ON}\n${misreadLine("small")}` },
  { name: "warns under the status of a route.ladder that names a profile twice", values: { "route.agents": "on", "route.ladder": "small,Small" }, text: `${STATUS_ON}\n${misreadLine("small,Small")}` },
  { name: "warns under the status of a route.ladder whose name is no profile's", values: { "route.agents": "on", "route.ladder": "small,very large" }, text: `${STATUS_ON}\n${misreadLine("small,very large")}` },
  { name: "warns of a route.ladder that is no ladder while the routing is off", values: { "route.ladder": "small" }, text: `${STATUS_OFF}\n${misreadLine("small")}` },
  { name: "says nothing more of a blank route.ladder", values: { "route.agents": "on", "route.ladder": " " }, text: STATUS_ON },
];

/** The runtime's refusal of a level part that leaves the decision model no level. */
export const EFFORT_REFUSAL: ProfilePickRefusal = {
  refused: "services.get(\"pick\").pick { effort } leaves no level of Orkeon:Decision:Effort:Levels (medium, high) between min '(none)' and max 'low'.",
  part: "effort",
};
const STATUS_EFFORT_HEAD = "route.agents: on; route.effort: on; ladder: small,large (cheapest first); decision model: ";
const LEVEL_REFUSED_LINE =
  "  ⚠ route.effort is on and the runtime refuses the level /effort stored: route.effort picks no level, a launch asks " +
  `for its profile alone (${EFFORT_REFUSAL.refused}).`;

/** What a bare /route says when the runtime refuses the level part of the test pick, by what the pick asked for the
 *  profile alone answers. */
export const LEVEL_REFUSED_CASES: readonly { name: string; second: ProfilePick | ProfilePickRefusal | null; text: string }[] = [
  {
    name: "says the decision model is present and the level refused when the profile asked alone is answered",
    second: { ...pick("model"), picked: "small", probability: 0.9 }, text: `${STATUS_EFFORT_HEAD}present.\n${LEVEL_REFUSED_LINE}`,
  },
  {
    name: "says the decision model is silent and the level refused when the profile asked alone gets no answer",
    second: pick("no-answer", null),
    text: `${STATUS_EFFORT_HEAD}configured, but it gave no answer to a test pick just now (a server that is down, a key refused): nothing is routed until it answers.\n${LEVEL_REFUSED_LINE}`,
  },
  {
    name: "says both refusals when the profile asked alone is refused too", second: REFUSED,
    text: `${STATUS_EFFORT_HEAD}configured, but the runtime refused a test pick on the ladder just now: nothing is routed until it accepts one (${REFUSED.refused}).\n${LEVEL_REFUSED_LINE}`,
  },
  { name: "says the level refused and nothing back when the profile asked alone gives nothing", second: null, text: `${STATUS_EFFORT_HEAD}${NOTHING_BACK}.\n${LEVEL_REFUSED_LINE}` },
];

const LADDER = ["small", "large"];

/** The bounds of the test pick, by the profile the session's crews are launched on: those a launch sends, no floor. */
export const PROBE_BOUNDS_CASES: readonly { name: string; values: Record<string, string>; options: Record<string, unknown> }[] = [
  { name: "asks the test pick on the ladder alone for crews on the host's default model", values: { "route.agents": "on" }, options: { ladder: LADDER } },
  {
    name: "asks the test pick under the agents.profile the crews are launched on", values: { "route.agents": "on", "agents.profile": "large", "llm.profile": "small" },
    options: { ladder: LADDER, ceiling: "large", fallback: "large" },
  },
  {
    name: "asks the test pick under a padded agents.profile, as a launch reads it", values: { "route.agents": "on", "agents.profile": " large " },
    options: { ladder: LADDER, ceiling: "large", fallback: "large" },
  },
  { name: "asks the test pick under the llm.profile the crews are launched on", values: { "route.agents": "on", "llm.profile": "large" }, options: { ladder: LADDER, ceiling: "large", fallback: "large" } },
  {
    name: "asks the test pick under a middle rung as a launch on it does", values: { "route.agents": "on", "route.ladder": "small,medium,large", "llm.profile": "medium" },
    options: { ladder: ["small", "medium", "large"], ceiling: "medium", fallback: "medium" },
  },
];

const notTriedLowest = (key: string, profile: string): string =>
  `${STATUS_ON_HEAD}configured, not tried: a launch of this session asks it nothing, ${key} being '${profile}', the lowest rung, which no pick lowers.`;

/** A session whose launches ask nothing: no test pick, and the state says why. */
export const UNTRIED_CASES: readonly { name: string; values: Record<string, string>; text: string }[] = [
  { name: "tries nothing and says so under an agents.profile on the lowest rung", values: { "route.agents": "on", "agents.profile": "small", "llm.profile": "large" }, text: notTriedLowest("agents.profile", "small") },
  { name: "tries nothing and says so under an llm.profile on the lowest rung, whatever its case", values: { "route.agents": "on", "llm.profile": "Small" }, text: notTriedLowest("llm.profile", "Small") },
  {
    name: "tries nothing under a profile off the ladder", values: { "route.agents": "on", "agents.profile": "subscription" },
    text: `${STATUS_OUTSIDE}\n  ⚠ agents.profile is 'subscription', which is not on the ladder: nothing is routed. Set it to a rung, or unset it.`,
  },
];

/** The warning lines under the status, two at a time, in their order: the level refused, the ladder misread, the
 *  profile off the ladder (a profile off the ladder makes no test pick, so no level is refused beside it). */
export const LINE_ORDER_CASES: readonly { name: string; values: Record<string, string>; text: string }[] = [
  {
    name: "says the level refused, then the ladder misread", values: { "route.agents": "on", "route.effort": "on", "route.ladder": "small" },
    text: `${STATUS_EFFORT_HEAD}present.\n${LEVEL_REFUSED_LINE}\n${misreadLine("small")}`,
  },
  {
    name: "says the ladder misread, then the profile off the ladder", values: { "route.agents": "on", "route.ladder": "small", "agents.profile": "subscription" },
    text: `${STATUS_OUTSIDE}\n${misreadLine("small")}\n  ⚠ agents.profile is 'subscription', which is not on the ladder: nothing is routed. Set it to a rung, or unset it.`,
  },
];
