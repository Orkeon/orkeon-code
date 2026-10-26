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
