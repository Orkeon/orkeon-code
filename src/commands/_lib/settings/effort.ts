// /effort [<level>|show]: the session's reasoning-effort level. It picks the act() iteration ladder of every later
// /assistant turn and reaches the provider as `act({effort})`.
import type { Chooser } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import {
  DEFAULT_EFFORT, EFFORT_LEVELS as LEVELS, EFFORT_MAX_ITERATIONS,
} from "../../../shared/domain/agent-policy/behavior-flags.ts";
import { EFFORT_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CommandView } from "../view.ts";
import { optionsOf } from "./choices.ts";
import {
  EFFORT_CHOICE, EFFORT_UNCHANGED, actIterations, defaultLevel, effortSet, effortShown, effortUnchangedNoneStored,
  unknownEffort,
} from "./messages.ts";

export interface EffortDeps {
  session: Pick<SessionIo, "readState" | "writeState">;
  /** Where a bare /effort opens a panel, when it can. */
  chooser?: Chooser;
}

/** `/effort [<level>|show]`, from the command's raw tokens. No argument opens a panel, or without one shows the level,
 *  as `show` does. */
export async function runEffort(tokens: string[], deps: EffortDeps): Promise<CommandView> {
  const requested = (tokens[0] ?? "").toLowerCase();
  if (!requested || requested === "show") {
    const stored = await deps.session.readState(EFFORT_STATE_KEY).catch(() => null);
    if (!requested && deps.chooser?.interactive) {
      const answer = await deps.chooser.choose({
        message: EFFORT_CHOICE,
        options: LEVELS.map((level) => ({
          ...optionsOf([level], stored ?? DEFAULT_EFFORT)[0],
          description: actIterations(EFFORT_MAX_ITERATIONS[level]),
        })),
      });
      if (!answer) return { text: EFFORT_UNCHANGED };
      // Confirming the level marked changes nothing: with none stored, it would turn the provider's thinking on.
      if (answer.value === (stored ?? DEFAULT_EFFORT)) {
        return {
          text: stored ? EFFORT_UNCHANGED : effortUnchangedNoneStored(answer.value),
        };
      }
      return runEffort([answer.value], { session: deps.session });
    }
    const level = stored ?? defaultLevel(DEFAULT_EFFORT);
    const ladder = LEVELS.map((l) => `${l}=${EFFORT_MAX_ITERATIONS[l]}`).join(", ");
    return { text: effortShown(level, ladder, stored, LEVELS) };
  }
  if (!LEVELS.includes(requested as (typeof LEVELS)[number])) {
    return { text: unknownEffort(requested, LEVELS) };
  }
  await deps.session.writeState(EFFORT_STATE_KEY, requested);
  // Says what it buys: the iterations, and the provider's thinking at that level.
  return { text: effortSet(requested, EFFORT_MAX_ITERATIONS[requested as (typeof LEVELS)[number]]) };
}
