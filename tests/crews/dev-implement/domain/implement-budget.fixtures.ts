// The step counts the budget is sized on.

export interface StepsCase {
  name: string;
  value: unknown;
  expected: number;
}

export const STEPS_CASES: readonly StepsCase[] = [
  { name: "caps the steps at 12", value: 40, expected: 12 },
  { name: "sizes no step as one", value: 0, expected: 1 },
  { name: "sizes a step count given as text as the default three", value: "5", expected: 3 },
];

/** Inputs a run may be given: the close, the default, the bounds and the values the runtime would have refused. */
export const BUDGET_INPUTS: readonly { name: string; input: { steps?: unknown; close?: unknown } }[] = [
  { name: "the close", input: { close: true } },
  { name: "no steps given", input: {} },
  { name: "one step", input: { steps: 1 } },
  { name: "the most steps", input: { steps: 12 } },
  { name: "a fractional step count", input: { steps: 2.5 } },
  { name: "a negative step count", input: { steps: -3 } },
];
