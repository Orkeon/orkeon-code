// The approval of a plan: a turn of /assistant that ran in plan mode ends on a question, and the plan the user
// approves is carried out by a following turn in the mode picked. The launch of a plan turn attaches a state
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
  planApproved,
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

type PlanSession = Pick<SessionIo, "resolveEffectiveSessionMode" | "writeState">;

export interface PlanApprovalDeps {
  session: PlanSession;
  chooser: Chooser;
}

/** What launching a turn of /assistant reads and drives: the main loop's deps. */
export type AssistantLaunchDeps = MainLoopLaunchDeps;

export interface PlanDecision {
  /** What the user reads after the plan. */
  lines: string[];
  /** The mode of the turn that carries the plan out; absent when no turn is to follow. */
  carryOut?: string;
}

/** A turn of /assistant: a plan turn, from its prefix, else the session's mode, attaches the plan turn's state
 *  and is told of the approval when the console can ask it. A mode that cannot be resolved makes no plan turn. */
export async function launchAssistantTurn(
  deps: AssistantLaunchDeps,
  input: { prompt: string; permissionMode: string | null; sessionStart?: StartOutput | null },
  interactive: boolean,
): Promise<LaunchResult> {
  const mode = input.permissionMode ?? (await deps.session.resolveEffectiveSessionMode().catch(() => null))?.mode;
  const planTurn = mode === PLAN_MODE;
  return launchMainLoop(deps, {
    ...input, planApproval: planTurn && interactive, ...(planTurn ? { state: PLAN_TURN_STATE } : {}),
  });
}

/** The turn that carries an approved plan out, in the mode picked, with no state: its completion asks nothing. */
export function carryOutPlan(deps: AssistantLaunchDeps, mode: string): Promise<LaunchResult> {
  return launchMainLoop(deps, { prompt: CARRY_OUT_PLAN, permissionMode: mode });
}

/** After a turn: nothing unless its launch's state says plan turn and the turn succeeded with an answer; then the
 *  question, on a console that has panels, the line saying how to carry the plan out elsewhere. An approval moves a
 *  session whose mode is plan to the mode picked. */
export async function approvePlan(
  result: Pick<CrewCompletion, "success" | "payload" | "state">,
  deps: PlanApprovalDeps,
): Promise<PlanDecision> {
  if (!isPlanTurnState(result.state) || !result.success || (result.payload ?? "").trim() === "") return { lines: [] };
  if (!deps.chooser.interactive) return { lines: [PLAN_NOT_OFFERED] };

  const answer = await deps.chooser.choose({ message: PLAN_APPROVAL, options: APPROVAL_OPTIONS });
  if (answer === null || answer.value === KEEP_PLANNING) return { lines: [PLAN_KEPT] };
  const session = await deps.session.resolveEffectiveSessionMode().catch(() => null);
  if (session?.mode === PLAN_MODE) {
    await deps.session.writeState(DEFAULT_MODE_STATE_KEY, answer.value).catch(() => undefined);
  }
  return { lines: [planApproved(answer.value)], carryOut: answer.value };
}
