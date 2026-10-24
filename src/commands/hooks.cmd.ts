/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /hooks — the session's hook registry (session state). The dev steps (/dev-plan, /dev-verify)
// hand it to their crew, whose tool callbacks (shared/infrastructure/orkeon/tool-callbacks.ts) run
// each pre-tool hook before a model's tool call the gate allowed (a failing hook refuses the call)
// and each post-tool hook after it (a failing one adds a line to the result). The assistant does not
// run them yet, and nothing runs a stop hook.
import { rawTokens } from "./_lib/args.ts";
import { shellOperatorIn } from "../shared/domain/dev/call-guard.ts";
import { readJsonArray, writeJson } from "../shared/application/session-state.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

import { HOOKS_STATE_KEY } from "../shared/domain/session-keys.ts";

const session = orkeonSessionIo();
const EVENTS = ["pre-tool", "post-tool", "stop"] as const;

/** Where the hooks run, said on every listing: a populated registry is exactly when someone
 *  believes they all run. */
const STATUS =
  "pre-tool and post-tool hooks run around each tool call the model makes in /dev-plan and /dev-verify " +
  "(a failing pre-tool hook refuses the call); the assistant does not run them yet, and no stop hook runs.";

defineCommand({
  name: "hooks",
  description: "List, add or remove declarative hooks (pre-tool|post-tool|stop).",
  handler: async (args, ctx) => {
    const [sub, event, ...rest] = rawTokens(args);
    const hooks = (await readJsonArray(session, HOOKS_STATE_KEY)) as any[];
    switch ((sub ?? "list").toLowerCase()) {
      case "list":
        if (hooks.length === 0)
          return ctx.continue(`no hooks configured. usage: /hooks add <pre-tool|post-tool|stop> <command>\n${STATUS}`);
        ctx.table(hooks.map((h: any, i: number) => ({ n: i + 1, event: h.event, command: h.command })));
        return ctx.continue(STATUS);
      case "add": {
        const command = rest.join(" ");
        if (!EVENTS.includes(String(event) as any) || !command)
          return ctx.continue(`usage: /hooks add <${EVENTS.join("|")}> <command>`);
        // The shell tool runs one program and its arguments: the hook would fail at every call.
        const operator = shellOperatorIn(command);
        if (operator !== undefined)
          return ctx.continue(
            `refused: the command holds '${operator.replace("\n", "\\n")}', which the shell tool refuses: a hook is one program ` +
            "and its arguments. Put the steps in a script: /hooks add pre-tool node .orkeon/hooks/pre.mjs {tool} {path}",
          );
        hooks.push({ event, command });
        await writeJson(session, HOOKS_STATE_KEY, hooks);
        return ctx.continue(`hook #${hooks.length} added on '${event}' (/clear clears). ${STATUS}`);
      }
      case "remove": {
        const n = Number(event);
        if (!Number.isInteger(n) || n < 1 || n > hooks.length)
          return ctx.continue(`usage: /hooks remove <1-${hooks.length || 1}>`);
        hooks.splice(n - 1, 1);
        await writeJson(session, HOOKS_STATE_KEY, hooks);
        return ctx.continue(`hook #${n} removed.`);
      }
      default:
        return ctx.continue("usage: /hooks [list|add <event> <command>|remove <n>]");
    }
  },
});
