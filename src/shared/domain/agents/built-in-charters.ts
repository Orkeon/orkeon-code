// The charters Orkeon Code runs as children of its dev steps (A-3), by name: which step runs each one
// and whose rule sets apply to it. The charters themselves live beside their step (the reviewer in
// shared/domain/dev/, the auditor in crews/dev-verify/domain/); /agents lists these rows and the
// agent-run crew repairs an instance of one by a new run. Pure.
import { stepCommand } from "../dev/step-rules.ts";

export interface BuiltInCharter {
  name: string;
  /** The dev step that runs it as a child, and whose rule sets apply to a repair its run does not name. */
  step: "dev-plan" | "dev-verify";
  /** Every step that runs it as a child. */
  steps: readonly string[];
  role: string;
}

export const BUILT_IN_CHARTERS: readonly BuiltInCharter[] = [
  { name: "dev-reviewer", step: "dev-plan", steps: ["dev-spec", "dev-change", "dev-plan"], role: "Adversarial reviewer" },
  { name: "dev-auditor", step: "dev-verify", steps: ["dev-verify"], role: "Batch auditor" },
];

export function builtInCharter(name: string): BuiltInCharter | undefined {
  return BUILT_IN_CHARTERS.find((c) => c.name === name);
}

/** The steps a repair can run under: those that run a charter as a child. */
export type RepairStep = "dev-plan" | "dev-verify" | "dev-spec" | "dev-change";
const REPAIR_STEPS: readonly string[] = ["dev-plan", "dev-verify", "dev-spec", "dev-change"];

/** The step a repair of `charter` runs under: the one the instance's run named (a reviewer of /dev-spec repairs under
 *  dev-spec's rule sets and budget), else the charter's own, else dev-plan's. */
export function repairStep(charter: string, runStep: unknown): RepairStep {
  if (typeof runStep === "string" && REPAIR_STEPS.includes(runStep)) return runStep as RepairStep;
  return builtInCharter(charter)?.step ?? "dev-plan";
}

/** The rows /agents lists for the built-in charters, after the crews. */
export function builtInCharterRows(): Array<{ name: string; kind: string; detail: string }> {
  return BUILT_IN_CHARTERS.map((c) => ({
    name: c.name,
    kind: "charter (built-in)",
    detail: `${c.role} — runs as a background child of ${[...new Set(c.steps.map((s) => `/${stepCommand(s)}`))].join(", ")}; /tasks lists, stops and repairs it`,
  }));
}
