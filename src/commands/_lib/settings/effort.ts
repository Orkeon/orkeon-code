// /effort [<level>]: the session's reasoning-effort level. It picks the act() iteration ladder of every later
// /assistant turn and reaches the provider as `act({effort})`.
import type { Chooser } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import {
  DEFAULT_EFFORT, EFFORT_LEVELS as LEVELS, EFFORT_MAX_ITERATIONS,
} from "../../../shared/domain/agent-policy/behavior-flags.ts";
import { EFFORT_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { CommandView } from "../view.ts";
import { optionsOf } from "./choices.ts";

export interface EffortDeps {
  session: Pick<SessionIo, "readState" | "writeState">;
  /** Where a bare /effort opens a panel, when it can. */
  chooser?: Chooser;
}

/** `/effort [<level>]`, from the command's raw tokens. No argument opens a panel, or without one shows the level. */
export async function runEffort(tokens: string[], deps: EffortDeps): Promise<CommandView> {
  const requested = (tokens[0] ?? "").toLowerCase();
  if (!requested) {
    const stored = await deps.session.readState(EFFORT_STATE_KEY).catch(() => null);
    if (deps.chooser?.interactive) {
      const answer = await deps.chooser.choose({
        message: "Reasoning effort for this session",
        options: LEVELS.map((level) => ({
          ...optionsOf([level], stored ?? DEFAULT_EFFORT)[0],
          description: `${EFFORT_MAX_ITERATIONS[level]} act() iterations`,
        })),
      });
      // Confirming the level marked changes nothing: with none stored, it would turn the provider's thinking on.
      if (!answer || answer.value === (stored ?? DEFAULT_EFFORT)) return { text: "reasoning effort unchanged." };
      return runEffort([answer.value], { session: deps.session });
    }
    const level = stored ?? `${DEFAULT_EFFORT} (default)`;
    const ladder = LEVELS.map((l) => `${l}=${EFFORT_MAX_ITERATIONS[l]}`).join(", ");
    return {
      text: `reasoning effort: ${level}\nact() iterations per level: ${ladder}\n` +
        `provider thinking: ${stored ? `at '${stored}' (act effort)` : "not requested (no level stored)"}\n` +
        `usage: /effort <${LEVELS.join("|")}>`,
    };
  }
  if (!LEVELS.includes(requested as (typeof LEVELS)[number])) {
    return { text: `unknown level '${requested}' — expected one of: ${LEVELS.join(", ")}.` };
  }
  await deps.session.writeState(EFFORT_STATE_KEY, requested);
  // Says what it buys: the iterations, and the provider's thinking at that level.
  return {
    text: `reasoning effort set to '${requested}' — the next /assistant turn gets ` +
      `${EFFORT_MAX_ITERATIONS[requested as (typeof LEVELS)[number]]} act() iterations and the provider's ` +
      `thinking at '${requested}' (act effort; the dev steps and their children too). Session-scoped; /clear clears it.`,
  };
}
