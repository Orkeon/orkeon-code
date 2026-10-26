// The charters charterCatalogue and charterProblems are tested on.
import { MAX_CHARTER_ITERATIONS } from "../../../../src/shared/domain/agents/charter.ts";
import type { Charter } from "../../../../src/shared/domain/agents/charter.ts";

/** A read-only code reader with four read tools; `over` replacing some fields. */
export const reader = (over: Partial<Charter> = {}): Charter => ({
  name: "code-reader", role: "Reader", goal: "Read the code it is pointed at",
  mode: "plan",
  tools: ["file_read", "codebase_search", "symbol_detail", "symbol_source"],
  disallowed: [],
  maxIterations: 30,
  ...over,
});

export const READ_ONLY_MODES: ReadonlyArray<Charter["mode"]> = ["plan", "dontAsk"];
export const REFUSED_ITERATIONS: readonly number[] = [0, 81, 2.5];
export const KEPT_ITERATIONS: readonly number[] = [1, MAX_CHARTER_ITERATIONS];
export const GOOD_NAMES: readonly string[] = ["dev-auditor", "x".repeat(40)];
export const BAD_NAMES: readonly string[] = ["a", "Dev-auditor", "1st", "dev_auditor", "x".repeat(41)];

/** The problems of a charter wrong in every way, in the frozen order. */
export const ALL_PROBLEMS = [
  "charter name 'X' is not a kebab-case name of 2 to 40 characters",
  "charter X: mode acceptEdits can write; a sub-agent runs read-only (plan or dontAsk) for now",
  "charter X: no tool left once the mode and the disallowed list apply",
  "charter X: maxIterations 0 is not between 1 and 80",
];
