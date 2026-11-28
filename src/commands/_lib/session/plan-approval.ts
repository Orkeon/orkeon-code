// The approval of a plan: a turn of /assistant that ran in plan mode ends on a question, and the plan the user
// approves is carried out by a following turn in the mode picked, launched here; a session in plan moves to that
// mode only once the launch returned its ticket. The launch of a plan turn attaches a state
// (`CrewLaunchOptions.state`) that the runtime hands back to that launch's own `completed` as `result.state`; the
// completion asks only when that state says plan turn. The turn that carries the plan out attaches none, so its
// own completion asks nothing; the other commands that launch main-loop (/summary, /verify, /voice,
// /transcribe --then) attach none either.

import type { Chooser } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { DEFAULT_MODE_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CrewCompletion, LaunchResult, MainLoopLaunchDeps } from "../dispatch.ts";
import { launchMainLoop } from "../dispatch.ts";
import type { StartOutput } from "../../../shared/domain/session-start.ts";
import {
  APPROVE_ACCEPTING_EDITS, APPROVE_ASKING_EACH_EDIT, KEEP_PLANNING_ANSWER, PLAN_APPROVAL, PLAN_KEPT, PLAN_NOT_OFFERED,
  planApproved, planModeNotKept, planNotCarriedOut, turnRunning,
} from "./messages.ts";
import { CARRY_OUT_PLAN } from "./prompts.ts";

export const PLAN_MODE = "plan";

/** The state a plan turn's launch attaches, handed back to its own completion. */
export interface PlanTurnState {
  planTurn: true;
}

export const PLAN_TURN_STATE: PlanTurnState = { planTurn: true };

/** Whether the state a completion received is a plan turn's: any other value, of any shape, is not. */
export function isPlanTurnState(state: unknown): state is PlanTurnState {
  return typeof state === "object" && state !== null && (state as { planTurn?: unknown }).planTurn === true;
}

/** The answer that leaves the session in plan mode. */
export const KEEP_PLANNING = PLAN_MODE;

/** The answers, each a permission mode: the one the plan is carried out in, or plan to stay in it. */
export const APPROVAL_OPTIONS: readonly { value: string; label: string; description: string }[] = [
  { value: "acceptEdits", ...APPROVE_ACCEPTING_EDITS },
  { value: "default", ...APPROVE_ASKING_EACH_EDIT },
  { value: KEEP_PLANNING, ...KEEP_PLANNING_ANSWER },
];

/** What launching a turn of /assistant reads and drives: the main loop's deps. */
export type AssistantLaunchDeps = MainLoopLaunchDeps;

/** What the approval reads and drives: the main loop's deps, to launch the carry-out turn, over a session that also
 *  writes the mode picked, and the chooser. */
export type PlanApprovalDeps = AssistantLaunchDeps & {
  session: Pick<SessionIo, "resolveEffectiveSessionMode" | "writeState">;
  chooser: Chooser;
};

/** A turn of /assistant: its mode is its prefix, else the session's, resolved here once and handed to the launch.
 *  A plan turn attaches the plan turn's state and is told of the approval when the console can ask it. The launch
 *  is exclusive: a line typed while a turn runs is refused, with a line that says it was not sent. */
export async function launchAssistantTurn(
  deps: AssistantLaunchDeps,
  input: { prompt: string; permissionMode: string | null; sessionStart?: StartOutput | null },
  interactive: boolean,
): Promise<LaunchResult> {
  const sessionMode = input.permissionMode === null ? await deps.session.resolveEffectiveSessionMode() : undefined;
  const planTurn = (sessionMode?.mode ?? input.permissionMode) === PLAN_MODE;
  return launchMainLoop(deps, {
    ...input, ...(sessionMode ? { sessionMode } : {}), planApproval: planTurn && interactive,
    ...(planTurn ? { state: PLAN_TURN_STATE } : {}), exclusive: true, busyLine: turnRunning,
  });
}

/** The turn that carries an approved plan out, in the mode picked, with no state: its completion asks nothing.
 *  Exclusive as any turn of /assistant: a line typed while the plan is carried out is refused. */
export function carryOutPlan(deps: AssistantLaunchDeps, mode: string): Promise<LaunchResult> {
  return launchMainLoop(deps, { prompt: CARRY_OUT_PLAN, permissionMode: mode, exclusive: true, busyLine: turnRunning });
}

/** After a turn, what the user reads: nothing unless its launch's state says plan turn and the turn succeeded with
 *  an answer; then the question, on a console that has panels, else the line saying how to carry the plan out. An
 *  approval launches the turn that carries the plan out in the mode picked. A refused launch changes nothing: its
 *  line, then the mode the session stays in. A launch that got its ticket moves a session whose mode is plan to the
 *  mode picked; a mode that cannot be written is said, the turn running in the mode picked all the same. */
export async function approvePlan(
  result: Pick<CrewCompletion, "success" | "payload" | "state">,
  deps: PlanApprovalDeps,
): Promise<string[]> {
  if (!isPlanTurnState(result.state) || !result.success || (result.payload ?? "").trim() === "") return [];
  if (!deps.chooser.interactive) return [PLAN_NOT_OFFERED];

  const answer = await deps.chooser.choose({ message: PLAN_APPROVAL, options: APPROVAL_OPTIONS });
  if (answer === null || answer.value === KEEP_PLANNING) return [PLAN_KEPT];
  const before = (await deps.session.resolveEffectiveSessionMode()).mode;
  const launched = await carryOutPlan(deps, answer.value);
  if ("refused" in launched) return [launched.message, planNotCarriedOut(before)];
  if (before !== PLAN_MODE) return [planApproved(answer.value)];
  const kept = await deps.session.writeState(DEFAULT_MODE_STATE_KEY, answer.value).then(() => true, () => false);
  return kept ? [planApproved(answer.value)] : [planApproved(answer.value), planModeNotKept(answer.value)];
}
