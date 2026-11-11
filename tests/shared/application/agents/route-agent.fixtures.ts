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
