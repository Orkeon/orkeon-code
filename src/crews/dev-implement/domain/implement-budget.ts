// The budget of one /dev-implement run, sized to the steps it has to run (temp/02 G-29): each step
// is two acts and two test runs; the batch ends with the build and the whole suite, each bounded
// by SUITE_LIMIT_SECONDS. The close run (commit, push, pull request) gets a fixed budget. Pure.
import type { StepBudget } from "../../../shared/domain/dev/step-budget.ts";

/** The longest a final build or suite may run before the batch stops, in seconds. */
export const SUITE_LIMIT_SECONDS = 3600;
/** One wait between two looks at a running suite, in seconds. */
export const SLICE_SECONDS = 20;
export const DEFAULT_STEPS = 3;
export const MAX_STEPS = 12;

export const CLOSE_BUDGET: StepBudget = { toolCalls: 40, wallTime: 900, tokens: 50_000, delegationDepth: 0 };

/** The steps to size for: a whole number from 1 to MAX_STEPS; DEFAULT_STEPS when not given or not a number. */
export function stepsToSize(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : DEFAULT_STEPS;
  return Math.max(1, Math.min(MAX_STEPS, n));
}

export function implementBudget(input: { steps?: unknown; close?: unknown }): StepBudget {
  if (input.close === true) return CLOSE_BUDGET;
  const s = stepsToSize(input.steps);
  return { toolCalls: 60 * s + 40, wallTime: 900 * s + 2 * SUITE_LIMIT_SECONDS, tokens: 150_000 * s, delegationDepth: 0 };
}
