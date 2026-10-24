// /hooks — the session's hook registry (session state): list, add, remove. The dev steps (/dev-spec, /dev-change,
// /dev-plan, /dev-implement, /dev-batches and /dev-verify, and a /tasks repair) hand it to their crew, whose tool callbacks
// (shared/infrastructure/orkeon/tool-callbacks.ts) run each pre-tool hook before a model's tool call the gate allowed
// (a failing hook refuses the call) and each post-tool hook after it (a failing one adds a line to the result). The
// assistant does not run them yet, and nothing runs a stop hook. Not a command file: the loader reads *.cmd.ts only.
import type { SessionStore } from "../../shared/application/ports.ts";
import { readJsonArray, writeJson } from "../../shared/application/session-state.ts";
import { shellOperatorIn } from "../../shared/domain/dev/call-guard.ts";
import { HOOKS_STATE_KEY } from "../../shared/domain/session-keys.ts";

export const HOOK_EVENTS = ["pre-tool", "post-tool", "stop"] as const;

/** Where the hooks run, said on every listing: a populated registry is exactly when someone
 *  believes they all run. */
export const HOOKS_STATUS =
  "pre-tool and post-tool hooks run around each tool call the model makes in the dev steps (/dev-spec, /dev-change, " +
  "/dev-plan, /dev-implement, /dev-batches, /dev-verify) and a /tasks repair (a failing pre-tool hook refuses the call); " +
  "the assistant does not run " +
  "them yet, and no stop hook runs.";

export interface HookRow { n: number; event: string; command: string }

/** What /hooks shows: a table of the hooks when it lists some, then its text. */
export interface HooksOutcome { table?: HookRow[]; text: string }

export async function runHooks(tokens: readonly string[], session: Pick<SessionStore, "readState" | "writeState">): Promise<HooksOutcome> {
  const [sub, event, ...rest] = tokens;
  const hooks = (await readJsonArray(session, HOOKS_STATE_KEY)) as Array<{ event: string; command: string }>;
  switch ((sub ?? "list").toLowerCase()) {
    case "list":
      if (hooks.length === 0) return { text: `no hooks configured. usage: /hooks add <pre-tool|post-tool|stop> <command>\n${HOOKS_STATUS}` };
      return { table: hooks.map((h, i) => ({ n: i + 1, event: h.event, command: h.command })), text: HOOKS_STATUS };
    case "add": {
      const command = rest.join(" ");
      if (!(HOOK_EVENTS as readonly string[]).includes(String(event)) || !command) return { text: `usage: /hooks add <${HOOK_EVENTS.join("|")}> <command>` };
      // The shell tool runs one program and its arguments: the hook would fail at every call.
      const operator = shellOperatorIn(command);
      if (operator !== undefined) {
        return {
          text: `refused: the command holds '${operator.replace(/\n/g, "\\n")}', which the shell tool refuses: a hook is one program ` +
            "and its arguments. Put the steps in a script: /hooks add pre-tool node .orkeon/hooks/pre.mjs {tool} {path}",
        };
      }
      hooks.push({ event, command });
      await writeJson(session, HOOKS_STATE_KEY, hooks);
      return { text: `hook #${hooks.length} added on '${event}' (/clear clears). ${HOOKS_STATUS}` };
    }
    case "remove": {
      const n = Number(event);
      if (!Number.isInteger(n) || n < 1 || n > hooks.length) return { text: `usage: /hooks remove <1-${hooks.length || 1}>` };
      hooks.splice(n - 1, 1);
      await writeJson(session, HOOKS_STATE_KEY, hooks);
      return { text: `hook #${n} removed.` };
    }
    default:
      return { text: "usage: /hooks [list|add <event> <command>|remove <n>]" };
  }
}
