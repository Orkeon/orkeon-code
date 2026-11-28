// The approval of a plan: a turn of /assistant that ran in plan mode ends on a question, and the plan the user
// approves is carried out by a following turn in the mode picked. The dispatch notes that the turn is a plan turn,
// the completion reads the note, asks, and says in which mode to launch the turn that carries the plan out.
//
// One note for the session (PLAN_TURN_STATE_KEY), not one per ticket: the completion is not told its ticket
// (CommandResponse has none), and two turns of /assistant never run at once. A typed line meets the command's
// quota (`maxConcurrent: 1`, refused while an instance is in flight), the next dispatch of the script waits for the
// promise of a `completed` (orkeon-cli.d.ts, `completed`), and every turn of /assistant, the one a `completed`
// launches included, is an exclusive launch of main-loop (`exclusive: true`): a turn launched while another runs is
// refused with the running ticket, and the note it wrote goes back to what it was. The other commands that launch
// main-loop (/summary, /verify, /voice, /transcribe --then) neither read nor write the note.
//
// The note is best-effort: a state bag that cannot be written means no question after the turn, never a turn not
// launched nor a completion that fails.

import type { Chooser } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { DEFAULT_MODE_STATE_KEY, PLAN_TURN_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CrewCompletion, LaunchResult, MainLoopLaunchDeps } from "../dispatch.ts";
import { launchMainLoop } from "../dispatch.ts";
import type { StartOutput } from "../../../shared/domain/session-start.ts";
import {
  APPROVE_ACCEPTING_EDITS, APPROVE_ASKING_EACH_EDIT, KEEP_PLANNING_ANSWER, PLAN_APPROVAL, PLAN_KEPT, PLAN_NOT_OFFERED,
  planApproved,
} from "./messages.ts";
import { CARRY_OUT_PLAN } from "./prompts.ts";

export const PLAN_MODE = "plan";

/** What the state bag holds while the last turn launched is a plan turn. */
export const PLAN_TURN_NOTED = "true";

/** The answer that leaves the session in plan mode. */
export const KEEP_PLANNING = PLAN_MODE;

/** The answers, each a permission mode: the one the plan is carried out in, or plan to stay in it. */
export const APPROVAL_OPTIONS: readonly { value: string; label: string; description: string }[] = [
  { value: "acceptEdits", ...APPROVE_ACCEPTING_EDITS },
  { value: "default", ...APPROVE_ASKING_EACH_EDIT },
  { value: KEEP_PLANNING, ...KEEP_PLANNING_ANSWER },
];

type PlanSession = Pick<SessionIo, "resolveEffectiveSessionMode" | "readState" | "writeState">;

export interface PlanApprovalDeps {
  session: PlanSession;
  chooser: Chooser;
}

/** What launching a turn of /assistant reads and drives: the main loop's deps, over a session that keeps the note. */
export type AssistantLaunchDeps = MainLoopLaunchDeps & { session: PlanSession };

export interface PlanDecision {
  /** What the user reads after the plan. */
  lines: string[];
  /** The mode of the turn that carries the plan out; absent when no turn is to follow. */
  carryOut?: string;
}

/** What notePlanTurn wrote: whether the note now says the turn is a plan turn, and what it held before. */
export interface PlanTurnNote {
  planTurn: boolean;
  previous: string | null;
}

/** Before a launch: notes whether the turn about to run is a plan turn, from its prefix, else the session's mode.
 *  A note that cannot be written notes nothing: the turn is no plan turn for its completion. */
export async function notePlanTurn(session: PlanSession, permissionMode: string | null): Promise<PlanTurnNote> {
  try {
    const previous = await session.readState(PLAN_TURN_STATE_KEY).catch(() => null);
    const mode = permissionMode ?? (await session.resolveEffectiveSessionMode()).mode;
    const planTurn = mode === PLAN_MODE;
    await session.writeState(PLAN_TURN_STATE_KEY, planTurn ? PLAN_TURN_NOTED : null);
    return { planTurn, previous };
  } catch {
    return { planTurn: false, previous: null };
  }
}

/** A turn of /assistant: noted, then launched, exclusive; told of the approval when the console can ask it. A
 *  launch refused (another turn runs) puts the note back as it was, for the turn that runs. */
export async function launchAssistantTurn(
  deps: AssistantLaunchDeps,
  input: { prompt: string; permissionMode: string | null; sessionStart?: StartOutput | null },
  interactive: boolean,
): Promise<LaunchResult> {
  const note = await notePlanTurn(deps.session, input.permissionMode);
  const launched = await launchMainLoop(deps, { ...input, planApproval: note.planTurn && interactive, exclusive: true });
  if ("refused" in launched) await deps.session.writeState(PLAN_TURN_STATE_KEY, note.previous).catch(() => undefined);
  return launched;
}

/** The turn that carries an approved plan out, in the mode picked, exclusive like every turn of /assistant. */
export function carryOutPlan(deps: AssistantLaunchDeps, mode: string): Promise<LaunchResult> {
  return launchMainLoop(deps, { prompt: CARRY_OUT_PLAN, permissionMode: mode, exclusive: true });
}

/** After a turn: nothing unless it was a plan turn that succeeded with an answer; then the question, on a console
 *  that has panels, the line saying how to carry the plan out elsewhere. An approval moves a session whose mode is
 *  plan to the mode picked. A note that cannot be read or cleared asks nothing: the turn that would carry the plan
 *  out would read it again. */
export async function approvePlan(
  result: Pick<CrewCompletion, "success" | "payload">,
  deps: PlanApprovalDeps,
): Promise<PlanDecision> {
  const noted = await deps.session.readState(PLAN_TURN_STATE_KEY).catch(() => null);
  if (noted !== PLAN_TURN_NOTED) return { lines: [] };
  const cleared = await deps.session.writeState(PLAN_TURN_STATE_KEY, null).then(() => true, () => false);
  if (!cleared || !result.success || (result.payload ?? "").trim() === "") return { lines: [] };
  if (!deps.chooser.interactive) return { lines: [PLAN_NOT_OFFERED] };

  const answer = await deps.chooser.choose({ message: PLAN_APPROVAL, options: APPROVAL_OPTIONS });
  if (answer === null || answer.value === KEEP_PLANNING) return { lines: [PLAN_KEPT] };
  const session = await deps.session.resolveEffectiveSessionMode().catch(() => null);
  if (session?.mode === PLAN_MODE) {
    await deps.session.writeState(DEFAULT_MODE_STATE_KEY, answer.value).catch(() => undefined);
  }
  return { lines: [planApproved(answer.value)], carryOut: answer.value };
}
