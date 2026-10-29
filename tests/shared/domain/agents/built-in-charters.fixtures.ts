// The charters and runs the built-in charters are looked up with.

export interface StepCase {
  charter: string;
  step: string | undefined;
}

/** The reviewer belongs to /dev-plan, the auditor to /dev-verify, an unknown charter to none. */
export const CHARTER_STEPS: readonly StepCase[] = [
  { charter: "dev-reviewer", step: "dev-plan" },
  { charter: "dev-auditor", step: "dev-verify" },
  { charter: "tester", step: undefined },
];

export interface RepairCase {
  name: string;
  charter: string;
  run: unknown;
  step: string;
}

export const REPAIR_STEPS: readonly RepairCase[] = [
  { name: "the step of the instance's run: dev-spec", charter: "dev-reviewer", run: "dev-spec", step: "dev-spec" },
  { name: "the step of the instance's run: dev-change", charter: "dev-reviewer", run: "dev-change", step: "dev-change" },
  { name: "the charter's step when the run names none", charter: "dev-auditor", run: undefined, step: "dev-verify" },
  { name: "the charter's step when the run's step is no charter step", charter: "dev-reviewer", run: "dev-implement", step: "dev-plan" },
  { name: "dev-plan's for an unknown charter and a run that is no step", charter: "tester", run: 3, step: "dev-plan" },
];

export const REVIEWER_ROW = "Adversarial reviewer — runs as a background child of /dev-spec, /dev-plan; /tasks lists, stops and repairs it";
