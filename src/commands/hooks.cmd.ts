/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /hooks (E-1) — manage hook configuration (baseline 04 §/hooks). DEVIATION
// (recorded in RESULTS.md): Orkeon Code has no hook ENGINE yet (stop hooks are E-8,
// blocked on framework G-6) — this command manages the declarative registry
// (session state bag) that the engine will consume, so the management surface
// and its persistence semantics ship now.
import { rawTokens } from "./_lib/args.ts";
import { readJsonArray, writeJson } from "../shared/application/session-state.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

import { HOOKS_STATE_KEY } from "../shared/domain/session-keys.ts";

const session = orkeonSessionIo();
const EVENTS = ["pre-tool", "post-tool", "stop"] as const;

defineCommand({
  name: "hooks",
  description: "List, add or remove declarative hooks (pre-tool|post-tool|stop).",
  handler: async (args, ctx) => {
    const [sub, event, ...rest] = rawTokens(args);
    const hooks = (await readJsonArray(session, HOOKS_STATE_KEY)) as any[];
    switch ((sub ?? "list").toLowerCase()) {
      case "list":
        if (hooks.length === 0)
          return ctx.continue("no hooks configured. usage: /hooks add <pre-tool|post-tool|stop> <command>\n(note: the execution engine is pending — E-8/G-6; the registry persists now)");
        ctx.table(hooks.map((h: any, i: number) => ({ n: i + 1, event: h.event, command: h.command })));
        // B-13 acceptance 3: the status is stated on EVERY listing, not only on
        // the empty one. A populated registry is exactly when someone believes
        // the hooks are running.
        return ctx.continue(
          "execution engine: NOT wired (E-8, blocked on framework G-6) — these hooks are declared, not firing. " +
          "The assistant's prompt says the same, so the model does not reason about a guarantee it lacks.",
        );
      case "add": {
        const command = rest.join(" ");
        if (!EVENTS.includes(String(event) as any) || !command)
          return ctx.continue(`usage: /hooks add <${EVENTS.join("|")}> <command>`);
        hooks.push({ event, command });
        await writeJson(session, HOOKS_STATE_KEY, hooks);
        return ctx.continue(`hook #${hooks.length} added on '${event}' (engine pending — E-8/G-6; /reset-session clears).`);
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
