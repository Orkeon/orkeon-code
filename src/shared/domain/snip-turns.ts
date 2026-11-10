// The turns of this harness as session_snip counts them. The runtime keeps the head message and the last N turns, a
// turn opening at each user message (Orkeon #287); a turn here stores its [turn-context] as a user message just before
// the request, so one turn of this harness can be two of the runtime's. The cut asks for as many of the runtime's turns
// as the last turns of this harness hold, so none of them loses its [turn-context].

import { isMarkedMessage } from "./marked-message.ts";
import { TURN_CONTEXT_MARKER } from "./markers.ts";
import type { SessionMsg } from "./types.ts";

const isUser = (m: SessionMsg): boolean => String(m.role).toLowerCase() === "user";

/** How many of the runtime's turns session_snip must keep for the last `turns` turns of `messages` to stay whole: the
 *  user messages from the first kept request (its [turn-context] included) to the end. A turn is a request the user
 *  typed with what follows it; the head (the first message) is never one. null when the buffer holds fewer turns
 *  than asked after its head: the runtime would remove nothing. */
export function runtimeTurnsToKeep(messages: readonly SessionMsg[], turns: number): number | null {
  if (turns <= 0) return 0;
  let users = 0;
  let found = 0;
  for (let i = messages.length - 1; i >= 1; i--) {
    const m = messages[i];
    if (!isUser(m)) continue;
    users++;
    if (isMarkedMessage(String(m.content))) continue;
    found++;
    if (found < turns) continue;
    const before = messages[i - 1];
    const hasContext = i >= 2 && isUser(before) && String(before.content).startsWith(TURN_CONTEXT_MARKER);
    return hasContext ? users + 1 : users;
  }
  return null;
}

