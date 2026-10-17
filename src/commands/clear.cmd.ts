/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /clear (E-1) — original semantics: clear the CONVERSATION buffer (plus the
// screen). Deliberately shadows the built-in screen-only clear: the scripted
// registry wins name resolution (InteractiveRunnerBase: Specific ?? Defaults).
// /reset-session remains as the historical dedicated name.
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "clear",
  description: "Clear the conversation buffer and the screen.",
  handler: async (_args, ctx) => {
    const removed = await session.reset();
    ctx.clear();
    return ctx.continue("conversation cleared (" + removed + " messages removed).");
  },
});
