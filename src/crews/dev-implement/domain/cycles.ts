// The cycles of a run: consecutive open steps whose `## Anchors` row names the same first test file are one
// behaviour, run as one cycle - every step's RED before any production line, then one GREEN and one Cost for
// them all (the harness groups the steps that share a test class; the file is what code can see). A step alone
// on its file is a cycle of one. Pure.
import type { ImplementStep } from "./step-section.ts";
import { testFileOf } from "./contracts.ts";

export interface Cycle { steps: ImplementStep[]; testFile: string | null }

export function cyclesOf(open: readonly ImplementStep[]): Cycle[] {
  const out: Cycle[] = [];
  for (const step of open) {
    const file = testFileOf(step);
    const last = out[out.length - 1];
    if (last !== undefined && file !== null && last.testFile === file && last.steps[last.steps.length - 1].number + 1 === step.number) {
      last.steps.push(step);
    } else {
      out.push({ steps: [step], testFile: file });
    }
  }
  return out;
}

/** `steps 1-2`, `step 3`, `steps 1, 3`. */
export function stepsLabel(steps: readonly ImplementStep[]): string {
  if (steps.length === 1) return `step ${steps[0].number}`;
  const numbers = steps.map((s) => s.number);
  const run = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  return run ? `steps ${numbers[0]}-${numbers[numbers.length - 1]}` : `steps ${numbers.join(", ")}`;
}

/** The line announcing the mapping, before the first RED. */
export function cyclesLine(cycles: readonly Cycle[]): string {
  return cycles.map((c, i) => `cycle ${i + 1}/${cycles.length} — ${stepsLabel(c.steps)} (${c.testFile ?? "no test file"})`).join("; ");
}
