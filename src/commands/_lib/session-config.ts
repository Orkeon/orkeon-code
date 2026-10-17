// Session-scoped toggles shared by the slash commands (/fast, /proactive). Values
// live in the session state bag (session_store
// get_state/set_state) so they survive crew runs and are cleared by
// /reset-session. Each helper takes the session it works on, so a test runs it
// over FakeSessionStore; the entry points pass orkeonSessionIo(). Lives under
// commands/_lib/ — the loader's SearchPattern is "*.cmd.ts", so this file is
// never loaded as a command.

import type { SessionStore } from "../../shared/application/ports.ts";
import { rawTokens } from "./args.ts";

/** Read a boolean flag ("true"/"false" strings in the bag; default false). */
async function readFlag(session: Pick<SessionStore, "readState">, key: string): Promise<boolean> {
  try {
    return (await session.readState(key)) === "true";
  } catch {
    return false;
  }
}

/** A toggle command's descriptor, for its entry point to register with defineCommand. */
export interface ToggleCommand {
  name: string;
  description: string;
  handler<R>(args: { readonly raw?: unknown }, ctx: { continue(message: string): R }): Promise<R>;
}

/**
 * A `/name [on|off]` toggle command over one boolean state key — bare
 * invocation flips the flag, `on`/`off` set it explicitly. `note` is appended
 * to the confirmation so each command states what consumes the flag. The entry
 * point registers it: `defineCommand(toggleCommand(spec, session))`.
 */
export function toggleCommand(
  spec: { name: string; description: string; key: string; note: string },
  session: Pick<SessionStore, "readState" | "writeState">,
): ToggleCommand {
  return {
    name: spec.name,
    description: spec.description,
    async handler(args, ctx) {
      const token = String(rawTokens(args)[0] ?? "").toLowerCase();
      const current = await readFlag(session, spec.key);
      const next = token === "on" ? true : token === "off" ? false : !current;
      await session.writeState(spec.key, String(next));
      return ctx.continue(`${spec.name}: ${next ? "on" : "off"} (${spec.note}; /reset-session clears it).`);
    },
  };
}
