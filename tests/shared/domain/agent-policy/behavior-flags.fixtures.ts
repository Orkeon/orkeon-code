// The raw values the behavior flags are resolved from, and what each resolves to.
import type { EffortLevel } from "../../../../src/shared/domain/agent-policy/behavior-flags.ts";

/** Each effort level and the act() iterations it allows. */
export const LEVEL_RUNGS: readonly { level: EffortLevel; iterations: number }[] = [
  { level: "low", iterations: 10 },
  { level: "medium", iterations: 40 },
  { level: "high", iterations: 80 },
  { level: "xhigh", iterations: 120 },
  { level: "max", iterations: 160 },
];

/** Stored effort values that name no level. */
export const EFFORT_JUNK: readonly unknown[] = ["extreme", "", null, undefined, 3, {}];

/** Stored pass counts out of range, and the bound each is clamped to. */
export const PASSES_OUT_OF_RANGE: readonly { name: string; raw: string; bound: "min" | "max" }[] = [
  { name: "a stored 0 to the minimum", raw: "0", bound: "min" },
  { name: "a stored 99 to the maximum", raw: "99", bound: "max" },
  { name: "a stored -4 to the minimum", raw: "-4", bound: "min" },
];

/** Stored pass counts that are no whole number. */
export const PASSES_JUNK: readonly unknown[] = ["two", "", "1.5", null, undefined];

/** The prompt blocks /fast must never drop. */
export const ESSENTIAL_BLOCKS: readonly string[] = ["staticHeader", "task", "preferences", "history"];

/** Stored effort values and the level forwarded to the provider: a level only, none for unset or junk. */
export const PROVIDER_EFFORT_CASES: readonly { raw: unknown; expected: EffortLevel | undefined }[] = [
  { raw: " LOW ", expected: "low" },
  { raw: "medium", expected: "medium" },
  { raw: undefined, expected: undefined },
  { raw: null, expected: undefined },
  { raw: "", expected: undefined },
  { raw: "max", expected: "max" },
  { raw: "XHIGH", expected: "xhigh" },
  { raw: 3, expected: undefined },
];

/** Settings bags and the provider thinking they resolve to. */
export const THINKING_CASES: readonly { name: string; bag: { effort?: string }; thinking: EffortLevel | null }[] = [
  { name: "an unset effort sends no thinking", bag: {}, thinking: null },
  { name: "a stored high effort sends high thinking", bag: { effort: "high" }, thinking: "high" },
];
