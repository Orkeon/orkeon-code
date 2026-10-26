/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /plan — TOGGLE plan mode (baseline 04 §/plan: "Toggle plan mode … flip the
// boolean, persist the new value").
//
// B-11 deepening: this used to write "plan" unconditionally, so `/plan` twice left
// the session read-only and the only way out was `/mode` or `/clear` — with
// the command reporting success both times. A toggle that cannot un-toggle is the
// kind of defect that reads as a mode bug rather than a command bug.
//
// Leaving plan returns to `default`, not to whatever preceded it: the previous mode
// could have been `bypassPermissions`, and silently restoring that on a second
// `/plan` would hand back write access nobody asked for on that keystroke.
import { DEFAULT_MODE_STATE_KEY } from "../../shared/domain/session-keys.ts";
import { orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";
import { togglePlanMode } from "../_lib/settings/mode.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "plan",
  description: "Toggle plan mode (read-only session default).",
  handler: async (_args, ctx) => {
    const current = await session.readState(DEFAULT_MODE_STATE_KEY).catch(() => null);
    const { mode, entering } = togglePlanMode(current);
    await session.writeState(DEFAULT_MODE_STATE_KEY, mode);

    if (entering) {
      ctx.log.info("entering 'plan': the edit, network and shell tools stripped from the catalogue");
      return ctx.continue(
        "plan mode ON — prompts without a \"mode:\" prefix now run read-only. " +
        "/plan again to leave.",
      );
    }
    ctx.log.info("leaving 'plan': session default back to 'default' (asks on writes)");
    return ctx.continue(
      "plan mode OFF — the session default is 'default' (asks on writes). " +
      "It is NOT restored to whatever it was before /plan: use /mode to pick another.",
    );
  },
});
