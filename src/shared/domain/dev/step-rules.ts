// Which rule sets each dev step puts in the gate before its crew runs (and its crew's callback checks
// again, call-guard.ts), the rules of a role on the repository pack's roots, and what a step does when
// the host's gate is off — pure, no IO.
import { pathRules, rulesOf } from "../agent-policy/rule-sets.ts";
import type { PathRules, RuleSetId } from "../agent-policy/rule-sets.ts";
import type { PermissionRule } from "../agent-policy/permission.ts";
import type { RepoPackLayout } from "./repo-pack.ts";

/** A dev step whose crew runs a model under the gate and its callback. */
export type DevStep = "dev-verify" | "dev-plan" | "dev-spec" | "dev-change" | "dev-implement";
export const DEV_STEPS: readonly DevStep[] = ["dev-verify", "dev-plan", "dev-spec", "dev-change", "dev-implement"];

/** The sets every dev step holds today. */
export const DEV_STEP_RULE_SETS: readonly RuleSetId[] = [
  "git-readonly", "inline-interpreters", "read-noise", "secrets", "state-files",
];
export const STEP_RULE_SETS: Readonly<Record<DevStep, readonly RuleSetId[]>> = {
  "dev-verify": DEV_STEP_RULE_SETS,
  "dev-plan": DEV_STEP_RULE_SETS,
  "dev-spec": DEV_STEP_RULE_SETS,
  "dev-change": DEV_STEP_RULE_SETS,
  "dev-implement": DEV_STEP_RULE_SETS,
};

/** The calls a step lets run without a question. /dev-implement's roles act in acceptEdits, where a tool
 *  declared `execute` would be asked at every test run: run_tests and run_build check their own commands
 *  (application/dev/wrapped-tools.ts). The gate is cleared at every command, so these never outlive the step;
 *  the crews' callback reads deny rules only. */
export const STEP_ALLOW_RULES: Readonly<Record<DevStep, readonly PermissionRule[]>> = {
  "dev-verify": [],
  "dev-plan": [],
  "dev-spec": [],
  "dev-change": [],
  "dev-implement": [{ effect: "allow", tool: "run_tests" }, { effect: "allow", tool: "run_build" }],
};

/** rulesOf(STEP_RULE_SETS[step]) then the step's allow rules: 407 deny rules for each step today (the deny on
 *  edit_batch that secrets and state-files both hold is kept once), and two allow rules for /dev-implement. */
export function stepRules(step: DevStep): PermissionRule[] {
  return [...rulesOf(STEP_RULE_SETS[step]), ...STEP_ALLOW_RULES[step]];
}

/** A role of a batch (L-6): the pilot reads no source or test file, the test author writes no
 *  source file, the implementer writes no test file. */
export type DevRole = "pilot" | "test-author" | "implementer";
export type LayoutRootKey = "domain" | "application" | "infrastructure" | "tests";
export const ROLE_ROOTS: Readonly<Record<DevRole, { access: "read" | "write"; keys: readonly LayoutRootKey[] }>> = {
  pilot: { access: "read", keys: ["domain", "application", "infrastructure", "tests"] },
  "test-author": { access: "write", keys: ["domain", "application", "infrastructure"] },
  implementer: { access: "write", keys: ["tests"] },
};

/** pathRules over the role's roots the pack gives, and the pack keys it lacks (`layout.tests`). */
export interface RoleRules extends PathRules { missing: string[] }

export function roleRules(role: DevRole, layout: Pick<RepoPackLayout, LayoutRootKey>): RoleRules {
  const { access, keys } = ROLE_ROOTS[role];
  const roots: string[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const value = layout[key];
    if (value === undefined || value === "") missing.push(`layout.${key}`);
    else roots.push(value);
  }
  return { ...pathRules(access, roots), missing };
}

export const GATE_SETTING = "Orkeon:Security:PermissionGate:Enabled";

/** What the step says before launching: refuse (no crew), or warn and launch. */
export interface GateProblem { refuse: boolean; line: string }

/** null when the host's gate is on, or when the host keeps no session rules (undefined), which the
 *  command reports itself. */
export function gateProblem(enabled: boolean | undefined, step: DevStep): GateProblem | null {
  if (enabled !== false) return null;
  const gateOnly = step === "dev-verify" ? " /dev-verify F<n> --gate-only runs no model and needs no gate." : "";
  return {
    refuse: true,
    line: `${step}: refused: the host's permission gate is off (${GATE_SETTING} is not true), so the step's rule ` +
      `sets and its read-only mode would check nothing. The launcher turns the gate on unless a settings file turns ` +
      `it off: remove that setting, restart the REPL and run /${step} again.${gateOnly}`,
  };
}
