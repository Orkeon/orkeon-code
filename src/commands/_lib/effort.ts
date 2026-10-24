// The effort level a command hands its crew (A-3): the one /effort stored, which the crew forwards to the
// provider (`act({effort})`, AgentBuilder.effort); null when none is stored or the session cannot say, so an
// unconfigured session turns no thinking on.
import type { SessionIo } from "../../shared/application/session-io.ts";
import { EFFORT_STATE_KEY } from "../../shared/domain/session-keys.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import type { EffortLevel } from "../../shared/domain/agent-policy/behavior-flags.ts";

export async function storedEffort(session: Pick<SessionIo, "readState">): Promise<EffortLevel | null> {
  try {
    return providerEffort(await session.readState(EFFORT_STATE_KEY)) ?? null;
  } catch {
    return null;
  }
}
