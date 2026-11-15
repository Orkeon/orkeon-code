// The ports of /route over fakes, and what it shows.
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeReasoningReader } from "../../../support/doubles/fake-reasoning-reader.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import {
  GLM_TAKES, HIGH_AS_ASKED, HIGH_UNCHECKED, MEDIUM_DROPPED, MEDIUM_LOWERED, TAKES_NO_EFFORT, UNKNOWN_TAKES,
} from "../../../support/fixtures/reasoning.ts";

export function routeCommandSetup() {
  const config = new FakeConfigStore();
  const session = new FakeSessionStore();
  const decision = new FakeDecisionModel();
  return { config, session, decision, deps: { config, session, decision } };
}

export const STATUS_OFF = "route.agents: off; ladder: small,large (cheapest first); decision model: present.";
export const STATUS_ON_NO_MODEL = "route.agents: on; ladder: fast,strong (cheapest first); decision model: absent, nothing is routed.";
export const SET_ON = "route.agents: on for this session; /clear clears it.";
export const SET_ON_NO_MODEL = "route.agents: on for this session (the host has no decision model: nothing is routed until it has one); /clear clears it.";
export const SET_OFF = "route.agents: off for this session; /clear clears it.";
export const RECENT = JSON.stringify([
  { crew: "dev-plan", profile: "small", reason: "model", picked: "small", confidence: 0.9 },
  { crew: "code-review", profile: null, reason: "no-answer" },
]);
export const WHY_LINES = [
  "dev-plan on 'small': the decision model's pick; picked 'small' at 0.90",
  "code-review on 'the host's default model': the decision model did not answer, the session's profile stands",
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
const STATUS_CUSTOM_LADDER = "route.agents: off; ladder: custom,large (cheapest first); decision model: present.";
export const STATUS_CUSTOM_WITH_HIGH = `${STATUS_CUSTOM_LADDER}\n  large: glm-5.3 takes low, high, max`;
