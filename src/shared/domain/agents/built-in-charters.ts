// The charters Orkeon Code runs as children of its dev steps (A-3), by name: which step runs each one
// and whose rule sets apply to it. The charters themselves live beside their step (the reviewer in
// shared/domain/dev/, the auditor in crews/dev-verify/domain/); /agents lists these rows and the
// agent-run crew repairs an instance of one by a new run. Pure.

export interface BuiltInCharter {
  name: string;
  /** The dev step that runs it as a child, and whose rule sets apply to it. */
  step: "dev-plan" | "dev-verify";
  role: string;
}

export const BUILT_IN_CHARTERS: readonly BuiltInCharter[] = [
  { name: "dev-reviewer", step: "dev-plan", role: "Adversarial reviewer" },
  { name: "dev-auditor", step: "dev-verify", role: "Batch auditor" },
];

export function builtInCharter(name: string): BuiltInCharter | undefined {
  return BUILT_IN_CHARTERS.find((c) => c.name === name);
}

/** The rows /agents lists for the built-in charters, after the crews. */
export function builtInCharterRows(): Array<{ name: string; kind: string; detail: string }> {
  return BUILT_IN_CHARTERS.map((c) => ({
    name: c.name,
    kind: "charter (built-in)",
    detail: `${c.role} — runs as a background child of /${c.step}; /tasks lists, stops and repairs it`,
  }));
}
