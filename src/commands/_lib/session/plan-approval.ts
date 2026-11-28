// The approval of a plan: a turn that ran in plan mode ends on a question, and the plan the user approves is
// carried out by a following turn in the mode picked. The dispatch notes that the turn is a plan turn, the
// completion reads the note, asks, and says in which mode to launch the turn that carries the plan out.

import type { Chooser } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { DEFAULT_MODE_STATE_KEY, PLAN_TURN_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CrewCompletion } from "../dispatch.ts";
import {
  APPROVAL_OPTIONS, KEEP_PLANNING, PLAN_APPROVAL, PLAN_KEPT, PLAN_NOT_OFFERED, planApproved,
} from "./messages.ts";

export const PLAN_MODE = "plan";

/** What the state bag holds while the last turn launched is a plan turn. */
export const PLAN_TURN_NOTED = "true";

export interface PlanApprovalDeps {
  session: Pick<SessionIo, "resolveEffectiveSessionMode" | "readState" | "writeState">;
  chooser: Chooser;
}

export interface PlanDecision {
  /** What the user reads after the plan. */
  lines: string[];
  /** The mode of the turn that carries the plan out; absent when no turn is to follow. */
  carryOut?: string;
}

/** Before a launch: whether the turn about to run is a plan turn, from its prefix, else the session's mode. */
export async function notePlanTurn(session: PlanApprovalDeps["session"], permissionMode: string | null): Promise<void> {
  const mode = permissionMode ?? (await session.resolveEffectiveSessionMode()).mode;
  await session.writeState(PLAN_TURN_STATE_KEY, mode === PLAN_MODE ? PLAN_TURN_NOTED : null);
}

/** After a turn: nothing unless it was a plan turn that succeeded; then the question, on a console that has
 *  panels. An approval moves a session whose mode is plan to the mode picked. */
export async function approvePlan(result: Pick<CrewCompletion, "success">, deps: PlanApprovalDeps): Promise<PlanDecision> {
  const noted = await deps.session.readState(PLAN_TURN_STATE_KEY).catch(() => null);
  if (noted !== PLAN_TURN_NOTED) return { lines: [] };
  await deps.session.writeState(PLAN_TURN_STATE_KEY, null);
  if (!result.success) return { lines: [] };
  if (!deps.chooser.interactive) return { lines: [PLAN_NOT_OFFERED] };

  const answer = await deps.chooser.choose({ message: PLAN_APPROVAL, options: APPROVAL_OPTIONS });
  if (answer === null || answer.value === KEEP_PLANNING) return { lines: [PLAN_KEPT] };
  const session = await deps.session.resolveEffectiveSessionMode();
  if (session.mode === PLAN_MODE) await deps.session.writeState(DEFAULT_MODE_STATE_KEY, answer.value);
  return { lines: [planApproved(answer.value)], carryOut: answer.value };
}
