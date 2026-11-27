// The ports of shared/application/agents/route-agent.ts over fakes, and what the runtime's pick answers. Every answer
// played here is one the runtime can give for the bounds of its case: a floor or a ceiling with a pick needs two rungs
// or more between the bounds, a floor with no pick is the one rung a rule leaves.
import type { EffortPick, ProfilePick, ProfilePickRefusal } from "../../../../src/shared/application/ports.ts";
import type { Routed } from "../../../../src/shared/application/agents/route-agent.ts";
import type { EffortLevel } from "../../../../src/shared/domain/agent-policy/behavior-flags.ts";
import type { EffortBounds, RouteBounds, RouteReason } from "../../../../src/shared/domain/agents/model-route.ts";
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeProfilePicker } from "../../../support/doubles/fake-profile-picker.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

type Answer = ProfilePick | ProfilePickRefusal | null;

export const TASK = { crew: "dev-plan", brief: "/dev-plan invoice-export" };
export const BILLING_TASK = { crew: "analyze", brief: "/analyze src/billing/tax.ts" };
export const RULES_PATH = "/workspace/.orkeon/route-rules.json";
export const BILLING_RULES = JSON.stringify({ paths: { "src/billing": "large" } });
const THREE_RUNGS = "small,medium,large";
const PLAN_ON_MEDIUM = JSON.stringify({ crews: { "dev-plan": "medium" } });
const PLAN_ON_LARGE = JSON.stringify({ crews: { "dev-plan": "large" } });
const REVIEWER_ON_MEDIUM = JSON.stringify({ crews: { "dev-reviewer": "medium" } });
const REVIEWER_ON_LARGE = JSON.stringify({ crews: { "dev-reviewer": "large" } });

/** An answer of the pick: `value` for `reason`, the model having picked `picked` at `probability` when given. */
export function answer(value: string | null, reason: RouteReason, picked: string | null = null, probability: number | null = null): ProfilePick {
  return { value, reason, picked, probability };
}

/** The runtime's refusal of a ladder that names a profile the host does not declare. */
export const REFUSAL: ProfilePickRefusal = {
  refused: "services.get(\"pick\").pick { profile.ladder } 'small' is not a profile of this host (known: fast, strong)", part: "profile",
};

/** The runtime's refusal of a level part that leaves the decision model no level (a level /effort stored under all of
 *  its levels). */
export const EFFORT_REFUSAL: ProfilePickRefusal = {
  refused: "services.get(\"pick\").pick { effort } leaves no level of Orkeon:Decision:Effort:Levels (medium, high) between min '(none)' and max 'low'.",
  part: "effort",
};

/** What a case sets besides the pick's answer: the project's rules, and `route.ladder`. */
interface Ground {
  rules?: string;
  ladder?: string;
}

/** The ports with the routing on, a decision model on the host, a pick that answers `small` and no rules file. */
export function routeSetup(setting: string | null = "on", ground: Ground = {}) {
  const config = new FakeConfigStore();
  if (setting !== null) config.values["route.agents"] = setting;
  if (ground.ladder !== undefined) config.values["route.ladder"] = ground.ladder;
  const decision = new FakeDecisionModel();
  const picker = new FakeProfilePicker();
  const files = new FakeFiles();
  if (ground.rules !== undefined) files.files.set(RULES_PATH, ground.rules);
  const session = new FakeSessionStore();
  const log = new FakeLogger();
  return { config, decision, picker, files, session, log, deps: { config, decision, picker, files, session, log } };
}

/** The ports of one case: its ground, and a pick that answers what the case says. */
export function answeredSetup(c: Ground & { answer: Answer; setting?: string | null }) {
  const setup = routeSetup(c.setting === undefined ? "on" : c.setting, c);
  setup.picker.answer = c.answer;
  return setup;
}

export const NO_MODEL_WARNING =
  "warn: route.agents is on and the host has no decision model to ask: the session's profile stands " +
  "(no Orkeon:Decision:Provider nor Orkeon:TypeSafe is set, the provider lacks its key, or the host's decision circuit is " +
  "off by --no-decision or Orkeon:Decision:Enabled false: check Orkeon:Decision:Provider and Orkeon:Decision:Enabled, " +
  "then the key of the provider's section, read from the variable its ApiKeyEnvVar names (TYPESAFE_API_KEY or " +
  "LIQUID_API_KEY by default) or from its ApiKey)";
export const OUTSIDE_LADDER_LINE = "info: route.agents is on and the profile 'guarded' the crew is launched on is not on the ladder (small,large): it stands";
export const SMALL_RECORD = [{ crew: "dev-plan", profile: "small", reason: "model", picked: "small", probability: 0.9 }];
export const UNSURE_RECORD = [{ crew: "dev-plan", profile: "large", reason: "low-confidence", picked: "small", probability: 0.4, stands: "session" }];

interface OptionsCase extends Ground {
  name: string;
  session: string | null;
  task: { crew: string; brief: string };
  options: RouteBounds;
}

/** What the pick is given, by the session's profile, the project's rules and the ladder. */
export const OPTIONS_CASES: readonly OptionsCase[] = [
  {
    name: "gives the ladder, and the session's profile as the ceiling and the fallback",
    session: "large", task: TASK, options: { ladder: ["small", "large"], ceiling: "large", fallback: "large" },
  },
  {
    name: "gives the ladder alone on the host's default model without a rule",
    session: null, task: TASK, options: { ladder: ["small", "large"] },
  },
  {
    name: "gives the floor of a rule, and falls back on it, on the host's default model",
    session: null, task: BILLING_TASK, rules: BILLING_RULES, options: { ladder: ["small", "large"], floor: "large", fallback: "large" },
  },
  {
    name: "gives the floor of a rule under the session's ceiling",
    session: "large", task: TASK, rules: PLAN_ON_MEDIUM, ladder: THREE_RUNGS,
    options: { ladder: ["small", "medium", "large"], floor: "medium", ceiling: "large", fallback: "large" },
  },
  {
    name: "gives the ladder route.ladder sets",
    session: null, task: TASK, ladder: "fast,strong", options: { ladder: ["fast", "strong"] },
  },
];

/** The sessions whose own rung is the one rung left: nothing is asked, said nor kept. */
export const HELD_CASES: readonly (Ground & { name: string; session: string; task: { crew: string; brief: string } })[] = [
  { name: "asks, says and keeps nothing for a session on the lowest rung", session: "small", task: TASK },
  { name: "asks, says and keeps nothing when a rule's floor is the session's rung", session: "medium", task: TASK, rules: PLAN_ON_MEDIUM, ladder: THREE_RUNGS },
  { name: "asks, says and keeps nothing when a rule's floor is above the session's rung", session: "small", task: BILLING_TASK, rules: BILLING_RULES },
];

interface ReasonCase extends Ground {
  name: string;
  answer: Answer;
  session: string | null;
  profile: string | null;
}

/** The profile a launch gets, by what the pick answers. */
export const REASON_CASES: readonly ReasonCase[] = [
  { name: "launches on the model's pick", answer: answer("small", "model", "small", 0.9), session: "large", profile: "small" },
  { name: "launches on the model's pick as the ladder spells it", answer: answer("Small", "model", "Small", 0.9), session: "large", profile: "small" },
  { name: "launches on the fallback when the pick is not sure", answer: answer("large", "low-confidence", "small", 0.4), session: "large", profile: "large" },
  { name: "launches on the fallback when the decision model does not answer", answer: answer("large", "no-answer"), session: "large", profile: "large" },
  {
    name: "launches on the floor a rule raises the pick to", answer: answer("medium", "floor", "small", 0.9), session: null, profile: "medium",
    rules: PLAN_ON_MEDIUM, ladder: THREE_RUNGS,
  },
  { name: "launches on the one rung a rule leaves, no model asked", answer: answer("large", "floor"), session: null, profile: "large", rules: PLAN_ON_LARGE },
  {
    name: "launches on a rule's floor when the pick is not sure, on the host's default model",
    answer: answer("medium", "low-confidence", "small", 0.5), session: null, profile: "medium", rules: PLAN_ON_MEDIUM, ladder: THREE_RUNGS,
  },
  {
    name: "launches on the ceiling the pick is held at", answer: answer("medium", "ceiling", "large", 0.9), session: "medium", profile: "medium",
    ladder: THREE_RUNGS,
  },
  { name: "launches on the host's default model the pick falls back on", answer: answer(null, "no-answer"), session: null, profile: null },
  { name: "keeps the session's profile when the runtime's circuit is off", answer: answer("large", "circuit-off"), session: "large", profile: "large" },
  { name: "keeps the session's profile when the runtime has no ladder", answer: answer("large", "no-ladder"), session: "large", profile: "large" },
  { name: "keeps the session's profile when the host has no pick", answer: null, session: "large", profile: "large" },
  { name: "keeps the session's profile when the runtime refuses the pick", answer: REFUSAL, session: "large", profile: "large" },
];

interface LineCase extends Ground {
  name: string;
  answer: Answer;
  session: string | null;
  lines: readonly string[];
}

/** The line a launch's choice logs: the profile really used, and why. */
export const LINE_CASES: readonly LineCase[] = [
  {
    name: "says on which rung the crew is launched, and why", answer: answer("small", "model", "small", 0.9), session: "large",
    lines: ["info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90)"],
  },
  {
    name: "says the session's profile stands when the pick is not sure", answer: answer("large", "low-confidence", "small", 0.4), session: "large",
    lines: ["info: route: dev-plan on 'large' (the pick was not sure enough, the session's profile stands; picked 'small' at 0.40)"],
  },
  {
    name: "says the host's default model stands when the pick falls back on it", answer: answer(null, "no-answer"), session: null,
    lines: ["info: route: dev-plan on 'the host's default model' (the decision model did not answer, the host's default model stands)"],
  },
  {
    name: "says a rule's floor stands when the decision model does not answer, on the host's default model",
    answer: answer("medium", "no-answer"), session: null, rules: PLAN_ON_MEDIUM, ladder: THREE_RUNGS,
    lines: ["info: route: dev-plan on 'medium' (the decision model did not answer, the floor of a rule of .orkeon/route-rules.json stands)"],
  },
  {
    name: "says a rule raised the model's pick", answer: answer("medium", "floor", "small", 0.9), session: null, rules: PLAN_ON_MEDIUM, ladder: THREE_RUNGS,
    lines: ["info: route: dev-plan on 'medium' (raised by a rule of .orkeon/route-rules.json; picked 'small' at 0.90)"],
  },
  {
    name: "says no model was asked when a rule leaves one rung", answer: answer("large", "floor"), session: null, rules: PLAN_ON_LARGE,
    lines: ["info: route: dev-plan on 'large' (set by a rule of .orkeon/route-rules.json, the one rung it leaves: no model was asked)"],
  },
];

/** The answers that are no choice: the session's profile stands, the cause is a warning, nothing is kept. */
export const NO_CHOICE: readonly { name: string; answer: Answer; lines: readonly string[] }[] = [
  {
    name: "warns that the runtime's circuit is off, and keeps nothing", answer: answer("large", "circuit-off"),
    lines: [
      "warn: route.agents is on and the runtime's decision circuit is off for this run (a crew on decision.mode none, a run " +
      "scope that turns the circuit off, such as a forge trial pass): nothing is routed, the session's profile stands",
    ],
  },
  {
    name: "warns that the runtime had no ladder, and keeps nothing", answer: answer("large", "no-ladder"),
    lines: ["warn: route.agents is on and the runtime had no usable ladder to pick from: nothing is routed, the session's profile stands"],
  },
  {
    name: "warns with the runtime's message when it refuses the pick, and keeps nothing", answer: REFUSAL,
    lines: [
      "warn: route.agents is on and the runtime refused the pick: nothing is routed, the session's profile stands " +
      "(services.get(\"pick\").pick { profile.ladder } 'small' is not a profile of this host (known: fast, strong))",
    ],
  },
  { name: "logs and keeps nothing when the host has no pick", answer: null, lines: [] },
];

export const REVIEW_TASK = { crew: "dev-reviewer", brief: "Review the plan of invoice-export" };

interface ActRouteCase extends Ground {
  name: string;
  setting?: string | null;
  answer: Answer;
  profiles: { session: string | null; crew: string | null };
  profile: string | null;
}

/** Where one act of a sub-agent goes, by what the pick answers and the profile its crew runs on. */
export const ACT_ROUTES: readonly ActRouteCase[] = [
  { name: "moves an act down from the crew's profile to the rung picked", answer: answer("small", "model", "small", 0.9), profiles: { session: "large", crew: "large" }, profile: "small" },
  { name: "moves an act up from a crew routed lower, to the rung picked", answer: answer("large", "model", "large", 0.9), profiles: { session: "large", crew: "small" }, profile: "large" },
  {
    name: "moves an act up to the floor a rule raises it to", answer: answer("medium", "floor", "small", 0.9), profiles: { session: "large", crew: "small" },
    profile: "medium", rules: REVIEWER_ON_MEDIUM, ladder: THREE_RUNGS,
  },
  {
    name: "moves an act up to the session's rung, the one rung a rule leaves", answer: null, profiles: { session: "medium", crew: "small" },
    profile: "medium", rules: REVIEWER_ON_LARGE, ladder: THREE_RUNGS,
  },
  {
    name: "moves an act to a rule's floor when the pick is not sure, on the host's default model",
    answer: answer("medium", "low-confidence", "small", 0.5), profiles: { session: null, crew: "small" }, profile: "medium",
    rules: REVIEWER_ON_MEDIUM, ladder: THREE_RUNGS,
  },
  {
    name: "moves an act to a rule's floor when the decision model does not answer, on the host's default model",
    answer: answer("medium", "no-answer"), profiles: { session: null, crew: null }, profile: "medium", rules: REVIEWER_ON_MEDIUM, ladder: THREE_RUNGS,
  },
  { name: "leaves an act where it is when the pick is the crew's profile", answer: answer("small", "model", "small", 0.9), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on the session's lowest rung, the crew's own", answer: null, profiles: { session: "small", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the pick is not sure", answer: answer("large", "low-confidence", "large", 0.4), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the decision model does not answer", answer: answer("large", "no-answer"), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the runtime's circuit is off", answer: answer("large", "circuit-off"), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the host has no pick", answer: null, profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when the runtime refuses the pick", answer: REFUSAL, profiles: { session: "large", crew: "small" }, profile: null },
  { name: "leaves an act on a crew routed lower when route.agents is off", setting: "off", answer: answer("large", "model", "large", 0.9), profiles: { session: "large", crew: "small" }, profile: null },
  { name: "moves an act of a session on the host's default model to the rung picked", answer: answer("small", "model", "small", 0.9), profiles: { session: null, crew: null }, profile: "small" },
  {
    name: "leaves an act where it is when the pick is the crew's profile spelled in another case", answer: answer("Small", "model", "Small", 0.9),
    profiles: { session: "large", crew: "small" }, profile: null, ladder: "Small,Large",
  },
];

interface ActLineCase extends Ground {
  name: string;
  answer: Answer;
  profiles: { session: string | null; crew: string | null };
  lines: readonly string[];
}

/** The line an act's choice logs: under the sub-agent's name, on the profile the act really runs on. */
export const ACT_LINES: readonly ActLineCase[] = [
  {
    name: "asks under the sub-agent's name and says where its act runs", answer: answer("small", "model", "small", 0.9), profiles: { session: "large", crew: "large" },
    lines: ["info: route: dev-reviewer on 'small' (the decision model's pick; picked 'small' at 0.90)"],
  },
  {
    name: "says the act stays on its crew's profile when the pick is not sure", answer: answer("large", "low-confidence", "small", 0.4),
    profiles: { session: "large", crew: "small" },
    lines: ["info: route: dev-reviewer on 'small' (the pick was not sure enough, the act stays on its crew's profile; picked 'small' at 0.40)"],
  },
  {
    name: "says the act takes a rule's floor when the pick is not sure, on the host's default model",
    answer: answer("medium", "low-confidence", "small", 0.5), profiles: { session: null, crew: "small" }, rules: REVIEWER_ON_MEDIUM, ladder: THREE_RUNGS,
    lines: ["info: route: dev-reviewer on 'medium' (the pick was not sure enough, the floor of a rule of .orkeon/route-rules.json stands; picked 'small' at 0.50)"],
  },
  {
    name: "says nothing of an act moved to the session's rung, the one rung a rule leaves", answer: null, profiles: { session: "medium", crew: "small" },
    rules: REVIEWER_ON_LARGE, ladder: THREE_RUNGS, lines: [],
  },
];

/** A launch that forwards /effort to its crew: the pick may be asked its thinking level. */
export const THINKING_TASK = { ...TASK, thinks: true };

/** The pick of `small` with the level `effort` answered in the same call. */
function withLevel(effort: EffortPick): ProfilePick {
  return { ...answer("small", "model", "small", 0.9), effort };
}

/** The model picked `low` for the level, sure of it. */
export const LOW_PICKED = withLevel({ value: "low", reason: "model", picked: "low", probability: 0.8 });
const LOW_UNSURE = withLevel({ value: null, reason: "low-confidence", picked: "low", probability: 0.4 });
/** The level is answered, yet the pick was not sure of it, or the decision model gave no answer. */
const LOW_ANSWERED_UNSURE = withLevel({ value: "low", reason: "low-confidence", picked: "low", probability: 0.4 });
const LOW_ANSWERED_UNANSWERED = withLevel({ value: "low", reason: "no-answer", picked: null, probability: null });
const LEVEL_UNANSWERED = withLevel({ value: null, reason: "no-answer", picked: null, probability: null });
const ONE_LEVEL_LEFT = withLevel({ value: "low", reason: "single-level", picked: null, probability: null });
const LEVEL_CIRCUIT_OFF = withLevel({ value: null, reason: "circuit-off", picked: null, probability: null });

/** What a case of the thinking level sets: `route.effort` (on unless said), the level /effort stored, the answer. */
interface EffortGround {
  effortSetting?: string | null;
  stored?: EffortLevel;
  answer?: Answer;
}

/** The ports with the routing on and `route.effort` as the case sets it. */
export function effortSetup(c: EffortGround = {}) {
  const setup = routeSetup();
  const effortSetting = c.effortSetting === undefined ? "on" : c.effortSetting;
  if (effortSetting !== null) setup.config.values["route.effort"] = effortSetting;
  if (c.stored !== undefined) setup.session.state.set("reasoning_effort", c.stored);
  if (c.answer !== undefined) setup.picker.answer = c.answer;
  return setup;
}

/** What the pick is asked for the level, by the setting, the task and the level /effort stored. */
export const EFFORT_ASKED_CASES: readonly (EffortGround & { name: string; task: typeof THINKING_TASK | typeof TASK; effort: EffortBounds | undefined })[] = [
  { name: "asks for a level under the one /effort stored, with route.effort on", task: THINKING_TASK, stored: "high", effort: { max: "high" } },
  { name: "asks for any level of the host when /effort stored none", task: THINKING_TASK, effort: {} },
  { name: "asks for no level with route.effort off", task: THINKING_TASK, effortSetting: "off", stored: "high", effort: undefined },
  { name: "asks for no level with route.effort unset", task: THINKING_TASK, effortSetting: null, stored: "high", effort: undefined },
  { name: "asks for no level for a launch whose crew takes none", task: TASK, stored: "high", effort: undefined },
];

/** The level a launch gets, by what the pick answers for it. */
export const EFFORT_ROUTED_CASES: readonly (EffortGround & { name: string; level: EffortLevel | null })[] = [
  { name: "launches on the level the model picked", answer: LOW_PICKED, level: "low" },
  { name: "launches on the one level the bounds leave", answer: ONE_LEVEL_LEFT, level: "low" },
  { name: "leaves the level in place when the pick of it is not sure", answer: LOW_UNSURE, level: null },
  { name: "leaves the level in place when the decision model answers none", answer: LEVEL_UNANSWERED, level: null },
  { name: "leaves the level in place when the reply holds none", answer: answer("small", "model", "small", 0.9), level: null },
  { name: "leaves the level in place when the pick answers one it is not sure of", answer: LOW_ANSWERED_UNSURE, level: null },
  { name: "leaves the level in place when the pick answers one without the decision model's answer", answer: LOW_ANSWERED_UNANSWERED, level: null },
];

/** The line a launch logs when its level was asked: the profile's part, then the level's. */
export const EFFORT_LINE_CASES: readonly (EffortGround & { name: string; lines: readonly string[] })[] = [
  {
    name: "says the level picked after the profile", answer: LOW_PICKED,
    lines: ["info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90; effort 'low' (the decision model's pick; picked 'low' at 0.80))"],
  },
  {
    name: "says the level is the one left under /effort", answer: ONE_LEVEL_LEFT,
    lines: ["info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90; effort 'low' (the one level left under /effort))"],
  },
  {
    name: "says the level was left as it was when the pick of it is not sure", answer: LOW_UNSURE,
    lines: ["info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90; effort left as it was (the pick was not sure enough; picked 'low' at 0.40))"],
  },
  {
    name: "says the level was left as it was when the decision model answers none", answer: LEVEL_UNANSWERED,
    lines: ["info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90; effort left as it was (the decision model did not answer))"],
  },
  {
    name: "says nothing of a level the runtime's circuit left unasked", answer: LEVEL_CIRCUIT_OFF,
    lines: ["info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90)"],
  },
];

export const EFFORT_RECORD = [{
  crew: "dev-plan", profile: "small", reason: "model", picked: "small", probability: 0.9,
  effort: { level: "low", reason: "model", picked: "low", probability: 0.8 },
}];

/** Where an act of a crew on `small`, under a session on `large`, goes with its level. */
export const ACT_EFFORTS: readonly (EffortGround & { name: string; routed: Routed })[] = [
  { name: "moves the level of an act the pick leaves on its crew's profile", answer: LOW_PICKED, routed: { profile: null, effort: "low" } },
  {
    name: "moves the level of an act whose profile the pick is not sure of",
    answer: { ...answer("large", "low-confidence", "large", 0.4), effort: { value: "low", reason: "model", picked: "low", probability: 0.8 } },
    routed: { profile: null, effort: "low" },
  },
  { name: "leaves the level of an act when the pick of it is not sure", answer: LOW_UNSURE, routed: { profile: null, effort: null } },
  { name: "leaves the level of an act when the pick answers one it is not sure of", answer: LOW_ANSWERED_UNSURE, routed: { profile: null, effort: null } },
  { name: "leaves the level of an act when the pick answers one without the decision model's answer", answer: LOW_ANSWERED_UNANSWERED, routed: { profile: null, effort: null } },
  { name: "leaves an act where it is when the host has no pick", answer: null, routed: { profile: null, effort: null } },
];

/** The ports with a level stored at `low` and a pick whose level part the runtime refuses, answering `second` when
 *  asked for the profile alone. */
export function levelRefusedSetup(second: Answer = answer("small", "model", "small", 0.9)) {
  const setup = effortSetup({ stored: "low" });
  setup.picker.answerFor = (_options, effort) => (effort === undefined ? second : EFFORT_REFUSAL);
  return setup;
}

const LEVEL_REFUSED_WARNING =
  "warn: route.agents is on and the runtime refused the pick of the profile with a thinking level: the profile is asked " +
  `again without one, and the level /effort stored stays in place (${EFFORT_REFUSAL.refused})`;

/** What a launch gets, and what is said, by what the pick asked for the profile alone answers. */
export const RETRY_CASES: readonly { name: string; second: Answer; profile: string; lines: readonly string[] }[] = [
  {
    name: "routes on the profile the pick asked alone answers, after one warning", second: answer("small", "model", "small", 0.9), profile: "small",
    lines: [LEVEL_REFUSED_WARNING, "info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90)"],
  },
  {
    name: "keeps the session's profile and warns of both refusals when the pick asked alone is refused too", second: REFUSAL, profile: "large",
    lines: [LEVEL_REFUSED_WARNING, `warn: route.agents is on and the runtime refused the pick: nothing is routed, the session's profile stands (${REFUSAL.refused})`],
  },
  { name: "keeps the session's profile when the pick asked alone gives nothing back", second: null, profile: "large", lines: [LEVEL_REFUSED_WARNING] },
  {
    name: "keeps the session's profile when the pick asked alone finds the circuit off", second: answer("large", "circuit-off"), profile: "large",
    lines: [
      LEVEL_REFUSED_WARNING,
      "warn: route.agents is on and the runtime's decision circuit is off for this run (a crew on decision.mode none, a run " +
      "scope that turns the circuit off, such as a forge trial pass): nothing is routed, the session's profile stands",
    ],
  },
];

/** A refusal of the ladder with a level asked: one warning, of the refusal, and no second pick. */
export const LADDER_REFUSED_LINES = [
  `warn: route.agents is on and the runtime refused the pick: nothing is routed, the session's profile stands (${REFUSAL.refused})`,
];

/** A stored route.ladder that is no ladder: one warning naming it and the ladder used, then the line of the launch. */
export const MISREAD_LADDERS: readonly { name: string; ladder: string; lines: readonly string[] }[] = [
  { name: "one profile alone", ladder: "small" },
  { name: "a profile named twice", ladder: "small,Small,large" },
  { name: "a name that is no profile's", ladder: "small,very large" },
].map((c) => ({
  name: `warns that route.ladder names ${c.name}, and the ladder used instead`,
  ladder: c.ladder,
  lines: [
    `warn: route.agents is on and route.ladder is '${c.ladder}', which is no ladder: the ladder small,large is used instead`,
    "info: route: dev-plan on 'small' (the decision model's pick; picked 'small' at 0.90)",
  ],
}));
