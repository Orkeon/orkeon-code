// The start of a dev step, in its command's dispatch: the host's gate must be on, then the gate is
// handed the session's rules and the step's rule sets (shared/domain/dev/step-rules.ts), just before
// the crew is launched; the /hooks registry is read for the crew's input (its tool callbacks run the hooks). Not a
// command file: the loader reads *.cmd.ts only.
import type { PermissionRules, SessionStore, ToolCatalogue } from "../../shared/application/ports.ts";
import type { ConfigStore } from "../../shared/application/config-store.ts";
import { configuredNames, resolveExtraTools } from "../../shared/application/extra-tools.ts";
import { syncStepRules } from "../../shared/application/permission-rules.ts";
import { readJsonArray } from "../../shared/application/session-state.ts";
import { HOOKS_STATE_KEY } from "../../shared/domain/session-keys.ts";
import { formatRule } from "../../shared/domain/agent-policy/permission.ts";
import type { RuleSetId } from "../../shared/domain/agent-policy/rule-sets.ts";
import { STEP_RULE_SETS, gateProblem, stepRules } from "../../shared/domain/dev/step-rules.ts";
import type { DevStep } from "../../shared/domain/dev/step-rules.ts";
import { isCode } from "../../shared/domain/dev/artefacts.ts";
import type { ActiveWorkflow } from "../../shared/domain/workflow/state-file.ts";
import { writeActiveWorkflow } from "../../shared/application/workflow/workflow-state.ts";

export interface DevStepDeps {
  session: Pick<SessionStore, "readState">;
  gate: PermissionRules;
  config: Pick<ConfigStore, "readValue" | "readFile">;
  catalogue: Pick<ToolCatalogue, "find">;
}

export type DevStepStart =
  | { ok: true; lines: string[]; sets: readonly RuleSetId[]; rules: number; hooks: unknown[] }
  | { ok: false; line: string };

/** The step /dev-verify runs: none with --gate-only, which runs no model. */
export function devVerifyStep(args: { gateOnly: boolean }): DevStep | null {
  return args.gateOnly ? null : "dev-verify";
}

/** Refuses when the host says its gate is off; otherwise puts the session's rules, then the step's
 *  rule sets, in the gate, and returns the warning lines the command prints before launching and the
 *  /hooks registry the crew's input carries. */
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
  const hooks = await readJsonArray(deps.session, HOOKS_STATE_KEY);
  return { ok: true, lines, sets: STEP_RULE_SETS[step], rules: sync.step.length, hooks };
}

/** The batch a step works on, for the state file a compaction writes: the code is the plan
 *  token when it is a code, the folder of a `.../<CODE>-PLAN.md` path, else null (the writer
 *  then looks for the batch's open sheet). */
export function activeWorkflowOf(args: { batch: string; plan: string | null }): ActiveWorkflow {
  const plan = args.plan;
  if (plan === null) return { code: null, phase: args.batch };
  if (!plan.endsWith("-PLAN.md")) return { code: isCode(plan) ? plan : null, phase: args.batch };
  const parts = plan.replace(/\\/g, "/").split("/").filter((p) => p.length > 0);
  const folder = parts.length >= 2 ? parts[parts.length - 2] : "";
  return { code: isCode(folder) ? folder : null, phase: args.batch };
}

/** Records the batch in progress in the session; a session that cannot keep it costs the
 *  state file only, so the failure comes back as a warning line, never a refusal. */
export async function markActiveWorkflow(
  session: Pick<SessionStore, "writeState">, args: { batch: string; plan: string | null },
): Promise<string | null> {
  try {
    await writeActiveWorkflow(session, activeWorkflowOf(args));
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `warning: the batch in progress could not be recorded (${reason}): a compaction will write no state file for it.`;
  }
}
