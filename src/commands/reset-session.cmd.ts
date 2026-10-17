/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /reset-session — clear the conversation buffer (dedicated name; does not shadow /clear, SPEC §5.2).
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "reset-session",
  description: "Clear the current session conversation buffer.",
  handler: async (_args, ctx) => {
    const removed = await session.reset();
    return ctx.continue("session buffer reset (" + removed + " messages removed).");
  },
});
