/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /clear — clear the CONVERSATION buffer (plus the screen), the permission mode kept. Deliberately shadows the
// built-in screen-only clear: the scripted registry wins name resolution
// (InteractiveRunnerBase: Specific ?? Defaults). /reset-session, the historical
// dedicated name, is its alias.
import { runClear } from "../_lib/session/clear.ts";
import { orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "clear",
  aliases: ["reset-session"],
  description: "Clear the conversation buffer and the screen, the permission mode and the model kept.",
  handler: async (_args, ctx) => {
    const line = await runClear({ session });
    ctx.clear();
    return ctx.continue(line);
  },
});
