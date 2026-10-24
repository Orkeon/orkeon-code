// The start of a dev step, in its command's dispatch: the host's gate must be on, then the gate is
// handed the session's rules and the step's rule sets (shared/domain/dev/step-rules.ts), just before
// the crew is launched. Not a command file: the loader reads *.cmd.ts only.
import type { PermissionRules, SessionStore, ToolCatalogue } from "../../shared/application/ports.ts";
import type { ConfigStore } from "../../shared/application/config-store.ts";
import { configuredNames, resolveExtraTools } from "../../shared/application/extra-tools.ts";
import { syncStepRules } from "../../shared/application/permission-rules.ts";
import { formatRule } from "../../shared/domain/agent-policy/permission.ts";
import type { RuleSetId } from "../../shared/domain/agent-policy/rule-sets.ts";
import { STEP_RULE_SETS, gateProblem, stepRules } from "../../shared/domain/dev/step-rules.ts";
import type { DevStep } from "../../shared/domain/dev/step-rules.ts";

export interface DevStepDeps {
  session: Pick<SessionStore, "readState">;
  gate: PermissionRules;
  config: Pick<ConfigStore, "readValue" | "readFile">;
  catalogue: Pick<ToolCatalogue, "find">;
}

export type DevStepStart =
  | { ok: true; lines: string[]; sets: readonly RuleSetId[]; rules: number }
  | { ok: false; line: string };

/** The step /dev-verify runs: none with --gate-only, which runs no model. */
export function devVerifyStep(args: { gateOnly: boolean }): DevStep | null {
  return args.gateOnly ? null : "dev-verify";
}

/** Refuses when the host says its gate is off; otherwise puts the session's rules, then the step's
 *  rule sets, in the gate, and returns the warning lines the command prints before launching. */
export async function startDevStep(step: DevStep, deps: DevStepDeps): Promise<DevStepStart> {
  const problem = gateProblem(deps.gate.enabled(), step);
  if (problem?.refuse) return { ok: false, line: problem.line };
  const lines = problem ? [problem.line] : [];
  const extras = await resolveExtraTools(deps);
  const sync = await syncStepRules({
    session: deps.session, gate: deps.gate, extraNames: configuredNames(extras), rules: stepRules(step),
  });
  if (!sync.applied) {
    lines.push(`warning: the host keeps no session rules: /${step}'s rule sets are not in force, the mode alone decides each call.`);
  }
  for (const r of sync.overridden) {
    lines.push(`warning: the session's rule '${formatRule(r)}' is left out of the gate during /${step}: the step denies the same calls.`);
  }
  return { ok: true, lines, sets: STEP_RULE_SETS[step], rules: sync.step.length };
}
