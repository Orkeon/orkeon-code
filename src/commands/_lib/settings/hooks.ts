// /hooks — the session's hook registry (session state): list, add, remove. The dev steps (/dev-spec, /dev-plan and
// /dev-batches, and a /tasks repair) hand it to their crew, whose tool callbacks
// (shared/application/dev/tool-callbacks.ts) run each pre-tool hook before a model's tool call, ahead of the host's gate
// (Orkeon #303; a failing hook refuses the call) and each post-tool hook after it (a failing one adds a line to the result). The
// assistant does not run them yet, and nothing runs a stop hook. Not a command file: the loader reads *.cmd.ts only.
import type { SessionStore } from "../../../shared/application/ports.ts";
import { readJsonArray, writeJson } from "../../../shared/application/session-state.ts";
import { shellOperatorIn } from "../../../shared/domain/dev/call-guard.ts";
import { HOOKS_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import {
  HOOKS_STATUS, HOOKS_USAGE, NO_HOOKS, hookAdded, hookOperatorRefused, hookRemoved, hooksAddUsage, hooksRemoveUsage,
} from "./messages.ts";

export const HOOK_EVENTS = ["pre-tool", "post-tool", "stop"] as const;

export interface HookRow { n: number; event: string; command: string }

/** What /hooks shows: a table of the hooks when it lists some, then its text. */
export interface HooksOutcome { table?: HookRow[]; text: string }

export async function runHooks(tokens: readonly string[], session: Pick<SessionStore, "readState" | "writeState">): Promise<HooksOutcome> {
  const [sub, event, ...rest] = tokens;
  const hooks = (await readJsonArray(session, HOOKS_STATE_KEY)) as Array<{ event: string; command: string }>;
  switch ((sub ?? "list").toLowerCase()) {
    case "list":
      if (hooks.length === 0) return { text: NO_HOOKS };
      return { table: hooks.map((h, i) => ({ n: i + 1, event: h.event, command: h.command })), text: HOOKS_STATUS };
    case "add": {
      const command = rest.join(" ");
      if (!(HOOK_EVENTS as readonly string[]).includes(String(event)) || !command) return { text: hooksAddUsage(HOOK_EVENTS) };
      // The shell tool runs one program and its arguments: the hook would fail at every call.
      const operator = shellOperatorIn(command);
      if (operator !== undefined) {
        return { text: hookOperatorRefused(operator.replace(/\n/g, "\\n")) };
      }
      hooks.push({ event, command });
      await writeJson(session, HOOKS_STATE_KEY, hooks);
      return { text: hookAdded(hooks.length, event) };
    }
    case "remove": {
      const n = Number(event);
      if (!Number.isInteger(n) || n < 1 || n > hooks.length) return { text: hooksRemoveUsage(hooks.length || 1) };
      hooks.splice(n - 1, 1);
      await writeJson(session, HOOKS_STATE_KEY, hooks);
      return { text: hookRemoved(n) };
    }
    default:
      return { text: HOOKS_USAGE };
  }
}
