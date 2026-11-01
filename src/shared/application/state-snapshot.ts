// The state keys a use case reads many times, read once (Orkeon #263): one batch
// read of the session's state bag, then each read of those keys answered from it.
//
// A turn of the main loop reads about ten keys through readers that each take the
// SessionStore port (the behaviour flags, the output style, the hooks, the skills,
// the compaction breaker...). Rather than teach every reader a batch, the turn hands
// them a session whose readState answers the snapshot: the readers stay as they are.

import type { SessionStore } from "./ports.ts";

/** The state reads and writes of a session, the snapshot's keys answered without a call. */
export type StateSnapshot = Pick<SessionStore, "readState" | "writeState">;

/**
 * Reads `keys` in one call and answers them from then on; a key outside `keys` is
 * read from the session as before. A write goes to the session, then to the
 * snapshot, so a later read of the key sees it. A batch read that fails leaves the
 * snapshot empty: every read goes to the session, as without one (best-effort, like
 * the readers themselves).
 */
export async function stateSnapshot(
  session: Pick<SessionStore, "readState" | "readStates" | "writeState">,
  keys: readonly string[],
): Promise<StateSnapshot> {
  let values: Map<string, string | null>;
  try {
    values = new Map(Object.entries(await session.readStates(keys)));
  } catch {
    values = new Map();
  }
  return {
    readState: async (key) => (values.has(key) ? values.get(key) ?? null : session.readState(key)),
    async writeState(key, value) {
      await session.writeState(key, value);
      if (values.has(key)) values.set(key, value);
    },
  };
}
