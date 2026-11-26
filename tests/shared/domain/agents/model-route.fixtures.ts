// The cases of shared/domain/agents/model-route.ts: ladders, rules, the bounds of a pick and the records kept.
import type { EffortLevel } from "../../../../src/shared/domain/agent-policy/behavior-flags.ts";
import type { EffortBounds, EffortChoice, EffortPickReason, RouteBounds, RouteReason, RouteRecord, RouteRules } from "../../../../src/shared/domain/agents/model-route.ts";

export const LADDER = ["small", "medium", "large"] as const;

export const LADDER_CASES: readonly { readonly name: string; readonly value: unknown; readonly expected: readonly string[] }[] = [
  { name: "reads the profiles a value names, in order", value: " fast , strong ", expected: ["fast", "strong"] },
  { name: "falls back on small,large for a value that is not a text", value: undefined, expected: ["small", "large"] },
  { name: "falls back on small,large for one profile alone", value: "small", expected: ["small", "large"] },
  { name: "falls back on small,large for a profile named twice", value: "small,small", expected: ["small", "large"] },
];

export const LADDER_PROBLEM_CASES: readonly { readonly name: string; readonly value: string; readonly problem: boolean }[] = [
  { name: "accepts two profiles", value: "small,large", problem: false },
  { name: "refuses one profile alone", value: "small", problem: true },
  { name: "refuses a profile named twice", value: "small,large,small", problem: true },
  { name: "refuses a profile named twice in two cases, one profile for the host", value: "Small,small", problem: true },
  { name: "refuses a name that holds a space", value: "small,very large", problem: true },
  { name: "refuses the name the runtime reserves for its own pick as a rung", value: "small,auto", problem: true },
];

export const RULES: RouteRules = {
  paths: { "src/billing": "large", "src/billing/fixtures": "small", "docs/": "small", "src/auth": "opus" },
  crews: { "code-review": "medium", "security-audit": "Large" },
};

/** A rule whose path is empty once written bare: it would match every command. */
export const ROOT_RULES: RouteRules = { paths: { "/": "large", "./": "large" }, crews: {} };

export const RULES_TEXT = JSON.stringify({ paths: { " src/billing ": " large ", "docs": 3 }, crews: { "code-review": "medium" }, other: 1 });
export const RULES_READ: RouteRules = { paths: { "src/billing": "large" }, crews: { "code-review": "medium" } };

export const RULES_TEXT_CASES: readonly { readonly name: string; readonly text: string; readonly expected: RouteRules }[] = [
  { name: "reads the floors of the paths and of the crews, a non-text entry dropped", text: RULES_TEXT, expected: RULES_READ },
  { name: "reads no floor from a text that is not JSON", text: "paths: src", expected: { paths: {}, crews: {} } },
  { name: "reads no floor from a list", text: "[]", expected: { paths: {}, crews: {} } },
  { name: "reads no floor from a section that is a list", text: '{"paths": ["src"]}', expected: { paths: {}, crews: {} } },
];

export const FLOOR_CASES: readonly { readonly name: string; readonly crew: string; readonly brief: string; readonly floor: number }[] = [
  { name: "asks for no floor when no rule applies", crew: "dev-plan", brief: "/dev-plan invoice-export", floor: 0 },
  { name: "raises the floor for a path under a rule's prefix", crew: "dev-plan", brief: "/analyze src/billing/tax.ts", floor: 2 },
  { name: "reads a path written from /workspace", crew: "dev-plan", brief: "/analyze /workspace/src/billing/tax.ts", floor: 2 },
  { name: "follows the closest ancestor's rule", crew: "dev-plan", brief: "/analyze src/billing/fixtures/a.json", floor: 0 },
  { name: "keeps the highest floor of the paths named", crew: "dev-plan", brief: "/analyze docs/a.md src/billing/tax.ts", floor: 2 },
  { name: "does not match a folder that only starts like the prefix", crew: "dev-plan", brief: "/analyze src/billing-old/a.ts", floor: 0 },
  { name: "raises the floor for the crew a rule names", crew: "code-review", brief: "/review", floor: 1 },
  { name: "raises the floor for a folder named bare", crew: "dev-plan", brief: "/dev-plan rework src/billing", floor: 2 },
  { name: "reads a path written with backslashes", crew: "dev-plan", brief: "/analyze src\\billing\\tax.ts", floor: 2 },
  { name: "reads a path in quotes, a comma after it", crew: "dev-plan", brief: '/analyze "src/billing/tax.ts", then stop', floor: 2 },
  { name: "ignores a rule that names a profile outside the ladder", crew: "dev-plan", brief: "/analyze src/auth/token.ts", floor: 0 },
  { name: "reads a rule's profile whatever its case", crew: "security-audit", brief: "/audit", floor: 2 },
];

export const BOUNDS_CASES: readonly {
  readonly name: string; readonly session: string | null; readonly floor: number; readonly expected: RouteBounds;
}[] = [
  { name: "gives the ladder alone on the host's default model without a floor", session: null, floor: 0, expected: { ladder: LADDER } },
  { name: "gives the session's profile as the ceiling and the fallback", session: "medium", floor: 0, expected: { ladder: LADDER, ceiling: "medium", fallback: "medium" } },
  { name: "gives the floor's rung, under the session's ceiling", session: "large", floor: 1, expected: { ladder: LADDER, floor: "medium", ceiling: "large", fallback: "large" } },
  { name: "holds a floor above the session's rung at it", session: "medium", floor: 2, expected: { ladder: LADDER, floor: "medium", ceiling: "medium", fallback: "medium" } },
  { name: "gives no floor when it is held at the lowest rung", session: "small", floor: 2, expected: { ladder: LADDER, ceiling: "small", fallback: "small" } },
  { name: "falls back on the floor's rung on the host's default model", session: null, floor: 1, expected: { ladder: LADDER, floor: "medium", fallback: "medium" } },
  { name: "finds the rung of a session's profile spelled in another case", session: "Large", floor: 1, expected: { ladder: LADDER, floor: "medium", ceiling: "Large", fallback: "Large" } },
];

export const HELD_CASES: readonly { readonly name: string; readonly session: string | null; readonly floor: number; readonly held: boolean }[] = [
  { name: "holds a session on the lowest rung", session: "small", floor: 0, held: true },
  { name: "holds a session whose rung a rule's floor reaches", session: "medium", floor: 1, held: true },
  { name: "holds a session whose rung a rule's floor is above", session: "medium", floor: 2, held: true },
  { name: "does not hold a session above the lowest rung without a floor", session: "medium", floor: 0, held: false },
  { name: "does not hold a session above a rule's floor", session: "large", floor: 1, held: false },
  { name: "does not hold a session on the host's default model, whatever the floor", session: null, floor: 2, held: false },
  { name: "does not hold a session on the top rung spelled in another case", session: "Large", floor: 1, held: false },
];

export const SPELLING_CASES: readonly { readonly name: string; readonly profile: string; readonly expected: string }[] = [
  { name: "spells a rung the host answers in another case as the ladder does", profile: "Medium", expected: "medium" },
  { name: "leaves a profile that is no rung as it is", profile: "Guarded", expected: "Guarded" },
];

export const ROUTABLE_CASES: readonly { readonly name: string; readonly session: string | null; readonly routable: boolean }[] = [
  { name: "routes a session on the host's default model", session: null, routable: true },
  { name: "routes a session on a rung of the ladder", session: "medium", routable: true },
  { name: "does not route a session on a profile outside the ladder", session: "guarded", routable: false },
  { name: "routes a session on a rung spelled in another case", session: "Large", routable: true },
];

export function record(n: number): RouteRecord {
  return { crew: `crew-${n}`, profile: "small", reason: "model", picked: "small", probability: 0.9 };
}

export const LONG_BRIEF = `/dev-change ${"a".repeat(3_000)}${"z".repeat(3_000)}`;

/** A record `/route why` kept before the runtime's pick: its probability under `confidence`. */
export const OLD_RECORD = { crew: "dev-plan", profile: "small", reason: "model", picked: "small", confidence: 0.9 };

/** Which reasons of a choice are a decision, and which leave the fallback to stand. */
export const DECIDED_REASONS: readonly { readonly name: string; readonly reason: RouteReason; readonly decided: boolean }[] = [
  { name: "reads the model's pick as a decision", reason: "model", decided: true },
  { name: "reads a pick raised by a rule as a decision", reason: "floor", decided: true },
  { name: "reads a pick held at the ceiling as a decision", reason: "ceiling", decided: true },
  { name: "reads an unsure pick as no decision", reason: "low-confidence", decided: false },
  { name: "reads a missing answer as no decision", reason: "no-answer", decided: false },
  { name: "reads a circuit off as no decision", reason: "circuit-off", decided: false },
  { name: "reads a missing ladder as no decision", reason: "no-ladder", decided: false },
];

/** Which reasons say the pick asked nothing. */
export const NOT_ASKED_REASONS: readonly { readonly name: string; readonly reason: RouteReason; readonly notAsked: boolean }[] = [
  { name: "reads a circuit off as nothing asked", reason: "circuit-off", notAsked: true },
  { name: "reads a missing ladder as nothing asked", reason: "no-ladder", notAsked: true },
  { name: "reads a missing answer as asked", reason: "no-answer", notAsked: false },
  { name: "reads the model's pick as asked", reason: "model", notAsked: false },
];

/** Records `/route why` cannot read: each is dropped. */
export const MALFORMED_RECORDS: readonly { readonly name: string; readonly raw: unknown }[] = [
  { name: "drops a record whose probability is not a number", raw: { crew: "dev-plan", profile: "small", reason: "model", picked: "small", probability: "0.9" } },
  { name: "drops a record whose probability is not finite", raw: { crew: "dev-plan", profile: "small", reason: "model", picked: "small", probability: null } },
  { name: "drops a record whose pick is not a name", raw: { crew: "dev-plan", profile: "small", reason: "model", picked: 3, probability: 0.9 } },
  { name: "drops a record whose stands is none of the known ones", raw: { crew: "dev-plan", profile: "large", reason: "no-answer", stands: "everyone" } },
  { name: "drops a record whose profile is not a name", raw: { crew: "dev-plan", profile: 2, reason: "model" } },
  { name: "drops a record whose old confidence is not a number", raw: { crew: "dev-plan", profile: "small", reason: "model", picked: "small", confidence: "high" } },
  { name: "drops a record that is not an object", raw: "dev-plan" },
];

/** Records kept before the runtime's pick with the reason `floor`: that reason no longer says what they meant. */
export const OLD_FLOOR_RECORDS: readonly { readonly name: string; readonly raw: unknown }[] = [
  { name: "drops an old record of a sure pick raised by a rule", raw: { crew: "dev-plan", profile: "large", reason: "floor", picked: "small", confidence: 0.8 } },
  { name: "drops an old record left on a rule's floor under an unsure pick", raw: { crew: "dev-plan", profile: "large", reason: "floor", picked: "small", confidence: 0.4 } },
];

/** A record with every field of its type, `stands` included: read as it is. */
export const FULL_RECORD = { crew: "dev-plan", profile: "large", reason: "low-confidence", picked: "small", probability: 0.4, stands: "session" };

/** The bounds of a pick of a thinking level, by the level /effort stored. */
export const EFFORT_BOUNDS_CASES: readonly { readonly name: string; readonly stored: EffortLevel | undefined; readonly bounds: EffortBounds }[] = [
  { name: "holds the pick at the level /effort stored", stored: "high", bounds: { max: "high" } },
  { name: "leaves every level of the host to a session that stored none", stored: undefined, bounds: {} },
];

export const EFFORT_DECIDED_REASONS: readonly { readonly name: string; readonly reason: EffortPickReason; readonly decided: boolean }[] = [
  { name: "takes the model's pick of a level as a decision", reason: "model", decided: true },
  { name: "takes the one level the bounds leave as a decision", reason: "single-level", decided: true },
  { name: "takes an unsure pick of a level as no decision", reason: "low-confidence", decided: false },
  { name: "takes a level without an answer as no decision", reason: "no-answer", decided: false },
  { name: "takes a level with the circuit off as no decision", reason: "circuit-off", decided: false },
];

/** The level a choice moves a launch or an act to. */
export const EFFORT_MOVED_CASES: readonly { readonly name: string; readonly choice: EffortChoice | undefined; readonly level: EffortLevel | null }[] = [
  { name: "moves to the level the model picked", choice: { level: "low", reason: "model", picked: "low", probability: 0.8 }, level: "low" },
  { name: "moves to the one level the bounds leave", choice: { level: "low", reason: "single-level" }, level: "low" },
  { name: "moves nothing when the pick of a level is not sure", choice: { level: "high", reason: "low-confidence", picked: "low", probability: 0.4 }, level: null },
  { name: "moves nothing when the decision model answers no level", choice: { level: null, reason: "no-answer" }, level: null },
  { name: "moves nothing when no level was asked", choice: undefined, level: null },
];

/** A record of a launch whose thinking level was picked with its profile. */
export const LEVEL_RECORD = {
  crew: "dev-plan", profile: "small", reason: "model", picked: "small", probability: 0.9,
  effort: { level: "low", reason: "model", picked: "low", probability: 0.8 },
};

/** The levels a stored record may hold that do not read. */
export const UNREAD_LEVEL_RECORDS: readonly { readonly name: string; readonly effort: unknown }[] = [
  { name: "its level is no level", effort: { level: "extreme", reason: "model" } },
  { name: "its reason is none of a choice", effort: { level: "low", reason: "circuit-off" } },
  { name: "its probability is no number", effort: { level: "low", reason: "model", picked: "low", probability: "0.8" } },
  { name: "it is no object", effort: "low" },
];
