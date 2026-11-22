// The ports of shared/application/agents/route-agent.ts over fakes, and what the runtime's pick answers.
import type { ProfilePick, ProfilePickOptions } from "../../../../src/shared/application/ports.ts";
import type { RouteReason } from "../../../../src/shared/domain/agents/model-route.ts";
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeProfilePicker } from "../../../support/doubles/fake-profile-picker.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

export const TASK = { crew: "dev-plan", brief: "/dev-plan invoice-export" };
export const BILLING_TASK = { crew: "analyze", brief: "/analyze src/billing/tax.ts" };
export const RULES_PATH = "/workspace/.orkeon/route-rules.json";
export const BILLING_RULES = JSON.stringify({ paths: { "src/billing": "large" } });

/** An answer of the pick: `value` for `reason`, the model having picked `picked` at `probability` when given. */
export function answer(value: string | null, reason: RouteReason, picked: string | null = null, probability: number | null = null): ProfilePick {
  return { value, reason, picked, probability };
}

/** The ports with the routing on, a decision model on the host, a pick that answers `small` and no rules file. */
export function routeSetup(setting: string | null = "on") {
  const config = new FakeConfigStore();
  if (setting !== null) config.values["route.agents"] = setting;
  const decision = new FakeDecisionModel();
  const picker = new FakeProfilePicker();
  const files = new FakeFiles();
  const session = new FakeSessionStore();
  const log = new FakeLogger();
  return { config, decision, picker, files, session, log, deps: { config, decision, picker, files, session, log } };
}

export const NO_MODEL_WARNING =
  "warn: route.agents is on and the host has no decision model: the session's profile stands (set Orkeon:Decision:Provider, or Orkeon:TypeSafe)";
export const OUTSIDE_LADDER_LINE = "info: route.agents is on and the session's llm.profile 'guarded' is not on the ladder (small,large): it stands";
export const ROUTED_SMALL_LINE = "info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90)";
export const NO_ANSWER_LINE =
  "info: route: dev-plan on 'the host's default model' (the decision model did not answer, the session's profile (or a rule's floor) stands)";
export const SMALL_RECORD = [{ crew: "dev-plan", profile: "small", reason: "model", picked: "small", probability: 0.9 }];

interface OptionsCase {
  name: string;
  session: string | null;
  task: { crew: string; brief: string };
  rules: string | null;
  ladder?: string;
  options: ProfilePickOptions;
}

/** What the pick is given, by the session's profile, the project's rules and the ladder. */
export const OPTIONS_CASES: readonly OptionsCase[] = [
  {
    name: "gives the ladder, and the session's profile as the ceiling and the fallback",
    session: "large", task: TASK, rules: null, options: { ladder: ["small", "large"], ceiling: "large", fallback: "large" },
  },
  {
    name: "gives the ladder alone on the host's default model without a rule",
    session: null, task: TASK, rules: null, options: { ladder: ["small", "large"] },
  },
  {
    name: "gives the floor of a rule, and falls back on it, on the host's default model",
    session: null, task: BILLING_TASK, rules: BILLING_RULES, options: { ladder: ["small", "large"], floor: "large", fallback: "large" },
  },
  {
    name: "holds a rule's floor at the session's rung",
    session: "small", task: BILLING_TASK, rules: BILLING_RULES, options: { ladder: ["small", "large"], ceiling: "small", fallback: "small" },
  },
  {
    name: "gives the ladder route.ladder sets",
    session: null, task: TASK, rules: null, ladder: "fast,strong", options: { ladder: ["fast", "strong"] },
  },
];

interface ReasonCase {
  name: string;
  answer: ProfilePick | null;
  session: string | null;
  profile: string | null;
}

/** The profile a launch gets, by what the pick answers. */
export const REASON_CASES: readonly ReasonCase[] = [
  { name: "launches on the model's pick", answer: answer("small", "model", "small", 0.9), session: "large", profile: "small" },
  { name: "launches on the fallback when the pick is not sure", answer: answer("large", "low-confidence", "small", 0.4), session: "large", profile: "large" },
  { name: "launches on the fallback when the decision model does not answer", answer: answer("large", "no-answer"), session: "large", profile: "large" },
  { name: "launches on the floor a rule raises the pick to", answer: answer("large", "floor", "small", 0.9), session: null, profile: "large" },
  { name: "launches on the ceiling the pick is held at", answer: answer("small", "ceiling", "large", 0.9), session: "small", profile: "small" },
  { name: "launches on the host's default model the pick falls back on", answer: answer(null, "no-answer"), session: null, profile: null },
  { name: "keeps the session's profile when the runtime's circuit is off", answer: answer("small", "circuit-off"), session: "large", profile: "large" },
  { name: "keeps the session's profile when the runtime has no ladder", answer: answer("small", "no-ladder"), session: "large", profile: "large" },
  { name: "keeps the session's profile when the host has no pick or refuses an option", answer: null, session: "large", profile: "large" },
];

/** The answers after which nothing is logged nor kept: nothing was asked. */
export const NOT_ASKED: readonly { name: string; answer: ProfilePick | null }[] = [
  { name: "logs and keeps nothing when the runtime's circuit is off", answer: answer("large", "circuit-off") },
  { name: "logs and keeps nothing when the runtime has no ladder", answer: answer("large", "no-ladder") },
  { name: "logs and keeps nothing when the host has no pick", answer: null },
];

export const REVIEW_TASK = { crew: "dev-reviewer", brief: "Review the plan of invoice-export" };
export const REVIEWER_LINE = "info: route: dev-reviewer on 'small' (the decision model's pick; picked 'small' at 0.90)";

interface ActRouteCase {
  name: string;
  setting: string | null;
  answer: ProfilePick | null;
  profiles: { session: string | null; crew: string | null };
  profile: string | null;
}

/** Where one act of a sub-agent goes, by what the pick answers and the profile its crew runs on. */
export const ACT_ROUTES: readonly ActRouteCase[] = [
  { name: "moves an act down from the crew's profile to the rung picked", setting: "on", answer: answer("small", "model", "small", 0.9), profiles: { session: "large", crew: "large" }, profile: "small" },
  { name: "moves an act up from a crew routed lower, to the rung picked", setting: "on", answer: answer("large", "model", "large", 0.9), profiles: { session: "large", crew: "small" }, profile: "large" },
  { name: "moves an act up to the floor a rule raises it to", setting: "on", answer: answer("large", "floor", "small", 0.9), profiles: { session: "large", crew: "small" }, profile: "large" },
  { name: "leaves an act where it is when the pick is the crew's profile", setting: "on", answer: answer("small", "model", "small", 0.9), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act held at the session's profile, the crew's own", setting: "on", answer: answer("small", "ceiling", "large", 0.9), profiles: { session: "small", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the pick is not sure", setting: "on", answer: answer("large", "low-confidence", "large", 0.4), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the decision model does not answer", setting: "on", answer: answer("large", "no-answer"), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the runtime's circuit is off", setting: "on", answer: answer("large", "circuit-off"), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the host has no pick", setting: "on", answer: null, profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when route.agents is off", setting: "off", answer: answer("large", "model", "large", 0.9), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "moves an act of a session on the host's default model to the rung picked", setting: "on", answer: answer("small", "model", "small", 0.9), profiles: { session: null, crew: null }, profile: "small" },
];

/** The ports of one case: its setting, and a pick that answers what the case says. */
export function actRouteSetup(c: ActRouteCase) {
  const setup = routeSetup(c.setting);
  setup.picker.answer = c.answer;
  return setup;
}
