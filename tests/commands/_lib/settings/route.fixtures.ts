// The ports of /route over fakes, and what it shows.
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

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
