// The cases of shared/domain/agents/model-route.ts: ladders, rules, the model's picks and the profile read from them.
import type { DecisionAnswers } from "../../../../src/shared/domain/decision/questions.ts";
import type { RouteChoice, RouteRecord, RouteRules } from "../../../../src/shared/domain/agents/model-route.ts";

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
  { name: "refuses a name that holds a space", value: "small,very large", problem: true },
];

export const RULES: RouteRules = {
  paths: { "src/billing": "large", "src/billing/fixtures": "small", "docs/": "small", "src/auth": "opus" },
  crews: { "code-review": "medium" },
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
];

const pick = (choice: string, confidence: number): DecisionAnswers => ({
  profile: { type: "choice", choice, confidence, probabilities: { [choice]: confidence } },
});

/** A pick whose probability and the provider's own confidence figure differ. */
export const SURE_PICK_LOW_FIGURE: DecisionAnswers = {
  profile: { type: "choice", choice: "small", confidence: 0.24, probabilities: { small: 0.62, large: 0.38 } },
};
/** A pick without probabilities: the confidence figure is all there is. */
export const PICK_WITHOUT_SHARES: DecisionAnswers = { profile: { type: "choice", choice: "small", confidence: 0.7, probabilities: {} } };

export const ROUTE_CASES: readonly {
  readonly name: string; readonly answers: DecisionAnswers | null; readonly session: string | null; readonly floor: number;
  readonly expected: RouteChoice;
}[] = [
  { name: "follows a sure pick", answers: pick("small", 0.9), session: null, floor: 0, expected: { profile: "small", reason: "model", picked: "small", confidence: 0.9 } },
  { name: "follows a pick at exactly the confidence asked", answers: pick("small", 0.6), session: null, floor: 0, expected: { profile: "small", reason: "model", picked: "small", confidence: 0.6 } },
  { name: "keeps the session's profile under the confidence asked", answers: pick("small", 0.59), session: "large", floor: 0, expected: { profile: "large", reason: "low-confidence", picked: "small", confidence: 0.59 } },
  { name: "keeps the host's default model under the confidence asked", answers: pick("small", 0.4), session: null, floor: 0, expected: { profile: null, reason: "low-confidence", picked: "small", confidence: 0.4 } },
  { name: "keeps the session's profile without an answer", answers: null, session: "medium", floor: 2, expected: { profile: "medium", reason: "no-answer" } },
  { name: "keeps the session's profile for a pick outside the ladder", answers: pick("opus", 0.9), session: "medium", floor: 0, expected: { profile: "medium", reason: "no-answer" } },
  { name: "keeps the session's profile for an answer that is no choice", answers: { profile: { type: "noul", probability: 0.9 } }, session: "medium", floor: 0, expected: { profile: "medium", reason: "no-answer" } },
  { name: "raises a pick to the floor", answers: pick("small", 0.9), session: null, floor: 1, expected: { profile: "medium", reason: "floor", picked: "small", confidence: 0.9 } },
  { name: "never goes above the session's rung, whatever the pick", answers: pick("large", 0.9), session: "medium", floor: 0, expected: { profile: "medium", reason: "ceiling", picked: "large", confidence: 0.9 } },
  { name: "never goes above the session's rung, whatever the floor", answers: pick("small", 0.9), session: "small", floor: 2, expected: { profile: "small", reason: "ceiling", picked: "small", confidence: 0.9 } },
  { name: "reads the bar on the probability of the pick, not on the provider's confidence figure", answers: SURE_PICK_LOW_FIGURE, session: null, floor: 0, expected: { profile: "small", reason: "model", picked: "small", confidence: 0.62 } },
  { name: "reads the bar on the confidence figure when the answer gives no probability", answers: PICK_WITHOUT_SHARES, session: null, floor: 0, expected: { profile: "small", reason: "model", picked: "small", confidence: 0.7 } },
  { name: "takes the floor's rung without an answer, on the host's default model", answers: null, session: null, floor: 1, expected: { profile: "medium", reason: "floor" } },
  { name: "takes the floor's rung under the bar, on the host's default model", answers: pick("small", 0.4), session: null, floor: 2, expected: { profile: "large", reason: "floor", picked: "small", confidence: 0.4 } },
  { name: "keeps a session's profile that is outside the ladder", answers: pick("small", 0.9), session: "guarded", floor: 0, expected: { profile: "guarded", reason: "ceiling" } },
  { name: "goes below the session's rung", answers: pick("small", 0.9), session: "large", floor: 0, expected: { profile: "small", reason: "model", picked: "small", confidence: 0.9 } },
];

export const ROUTABLE_CASES: readonly { readonly name: string; readonly session: string | null; readonly routable: boolean }[] = [
  { name: "routes a session on the host's default model", session: null, routable: true },
  { name: "routes a session on a rung of the ladder", session: "medium", routable: true },
  { name: "does not route a session on a profile outside the ladder", session: "guarded", routable: false },
];

export function record(n: number): RouteRecord {
  return { crew: `crew-${n}`, profile: "small", reason: "model", picked: "small", confidence: 0.9 };
}

export const LONG_BRIEF = `/dev-change ${"a".repeat(3_000)}${"z".repeat(3_000)}`;
