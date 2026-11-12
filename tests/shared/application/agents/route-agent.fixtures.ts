// The ports of shared/application/agents/route-agent.ts over fakes, and what the decision model says.
import type { DecisionAnswers } from "../../../../src/shared/domain/decision/questions.ts";
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

export const TASK = { crew: "dev-plan", brief: "/dev-plan invoice-export" };
export const BILLING_TASK = { crew: "analyze", brief: "/analyze src/billing/tax.ts" };
export const RULES_PATH = "/workspace/.orkeon/route-rules.json";
export const BILLING_RULES = JSON.stringify({ paths: { "src/billing": "large" } });

export function pick(choice: string, confidence = 0.9): DecisionAnswers {
  return { profile: { type: "choice", choice, confidence, probabilities: { [choice]: confidence } } };
}

/** The ports with the routing on, a decision model that picks `small` and no rules file. */
export function routeSetup(setting: string | null = "on") {
  const config = new FakeConfigStore();
  if (setting !== null) config.values["route.agents"] = setting;
  const decision = new FakeDecisionModel();
  decision.answers = pick("small");
  const files = new FakeFiles();
  const session = new FakeSessionStore();
  const log = new FakeLogger();
  return { config, decision, files, session, log, deps: { config, decision, files, session, log } };
}

export const NO_MODEL_WARNING =
  "warn: route.agents is on and the host has no decision model: the session's profile stands (set Orkeon:Decision:Provider, or Orkeon:TypeSafe)";
export const OUTSIDE_LADDER_LINE = "info: route.agents is on and the session's llm.profile 'guarded' is not on the ladder (small,large): it stands";
export const ROUTED_SMALL_LINE = "info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90)";
export const NO_ANSWER_LINE = "info: route: dev-plan on 'the host's default model' (the decision model did not answer, the session's profile stands)";
export const SMALL_RECORD = [{ crew: "dev-plan", profile: "small", reason: "model", picked: "small", confidence: 0.9 }];

export const REVIEW_TASK = { crew: "dev-reviewer", brief: "Review the plan of invoice-export" };
export const REVIEWER_LINE = "info: route: dev-reviewer on 'small' (the decision model's pick; picked 'small' at 0.90)";

interface ActRouteCase {
  name: string;
  setting: string | null;
  answers: DecisionAnswers | null;
  profiles: { session: string | null; crew: string | null };
  profile: string | null;
}

/** Where one act of a sub-agent goes, by what the decision model says and the profile its crew runs on. */
export const ACT_ROUTES: readonly ActRouteCase[] = [
  { name: "moves an act down from the crew's profile to the rung picked", setting: "on", answers: pick("small"), profiles: { session: "large", crew: "large" }, profile: "small" },
  { name: "moves an act up from a crew routed lower, to the rung picked", setting: "on", answers: pick("large"), profiles: { session: "large", crew: "small" }, profile: "large" },
  { name: "leaves an act where it is when the pick is the crew's profile", setting: "on", answers: pick("small"), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "holds a pick at the session's profile", setting: "on", answers: pick("large"), profiles: { session: "small", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the pick is not sure", setting: "on", answers: pick("large", 0.4), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the decision model does not answer", setting: "on", answers: null, profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when route.agents is off", setting: "off", answers: pick("large"), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "moves an act of a session on the host's default model to the rung picked", setting: "on", answers: pick("small"), profiles: { session: null, crew: null }, profile: "small" },
];

/** The ports of one case: its setting, and a decision model that says what the case says (null: it does not answer). */
export function actRouteSetup(c: ActRouteCase) {
  const setup = routeSetup(c.setting);
  if (c.answers === null) setup.decision.replies = [null];
  else setup.decision.answers = c.answers;
  return setup;
}
