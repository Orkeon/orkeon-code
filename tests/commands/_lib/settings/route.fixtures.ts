// The ports of /route over fakes, and what it shows.
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeReasoningReader } from "../../../support/doubles/fake-reasoning-reader.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import {
  GLM_TAKES, HIGH_AS_ASKED, HIGH_UNCHECKED, MEDIUM_DROPPED, MEDIUM_LOWERED, TAKES_NO_EFFORT, UNKNOWN_TAKES,
} from "../../../support/fixtures/reasoning.ts";

/** A decision model that answers the test question of a bare /route. */
const PROBE_ANSWERED = { reachable: { type: "noul" as const, probability: 0.9 } };

export function routeCommandSetup() {
  const config = new FakeConfigStore();
  const session = new FakeSessionStore();
  const decision = new FakeDecisionModel();
  decision.answers = PROBE_ANSWERED;
  return { config, session, decision, deps: { config, session, decision } };
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
  const { config, session, decision } = routeCommandSetup();
  const reasoning = new FakeReasoningReader();
  reasoning.byProfile = {
    small: { capabilities: TAKES_NO_EFFORT, reports: { medium: MEDIUM_DROPPED } },
    large: { capabilities: GLM_TAKES, reports: { medium: MEDIUM_LOWERED, high: HIGH_AS_ASKED } },
    custom: { capabilities: UNKNOWN_TAKES, reports: { high: HIGH_UNCHECKED } },
  };
  return { config, session, decision, reasoning, deps: { config, session, decision, reasoning } };
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

/** What a bare /route says of the profile the crews are launched on, by where it stands on the ladder. */
export const OUTSIDE_LADDER_CASES: readonly { readonly name: string; readonly values: Record<string, string>; readonly text: string }[] = [
  {
    name: "says that nothing is routed under an agents.profile outside the ladder",
    values: { "route.agents": "on", "agents.profile": "subscription", "llm.profile": "large" },
    text: `${STATUS_ON}\n  ⚠ agents.profile is 'subscription', which is not on the ladder: nothing is routed. Set it to a rung, or unset it.`,
  },
  {
    name: "says that nothing is routed under an llm.profile outside the ladder",
    values: { "route.agents": "on", "llm.profile": "guarded" },
    text: `${STATUS_ON}\n  ⚠ llm.profile is 'guarded', which is not on the ladder: nothing is routed. Set it to a rung, or unset it.`,
  },
  { name: "says nothing more under a profile that is a rung, whatever its case", values: { "route.agents": "on", "agents.profile": "Large" }, text: STATUS_ON },
  {
    name: "says nothing of a profile outside the ladder while the routing is off",
    values: { "agents.profile": "subscription" }, text: "route.agents: off; route.effort: off; ladder: small,large (cheapest first); decision model: present.",
  },
  {
    name: "says that nothing is routed under an llm.profile outside the ladder behind an agents.profile that is no name",
    values: { "route.agents": "on", "agents.profile": "two words", "llm.profile": "guarded" },
    text: `${STATUS_ON}\n  ⚠ llm.profile is 'guarded', which is not on the ladder: nothing is routed. Set it to a rung, or unset it.`,
  },
];

export const STATUS_SILENT =
  "route.agents: on; route.effort: off; ladder: small,large (cheapest first); decision model: configured, but it gave no answer " +
  "to a test question just now (a server that is down, a key refused): nothing is routed until it answers.";
export const PROBE_ASKED = [{ state: "ready", questions: { reachable: { type: "noul", criteria: { true: "The text is the single word 'ready'" } } } }];
