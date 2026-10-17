/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /btw <note> — inject a side note into the session context (SPEC §7 / design 02).
// Backing: the session service (appends to the buffer). No new tool/service.
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";
import { rawText } from "./_lib/args.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "btw",
  description: "Inject a side note into the session context (\"by the way…\").",
  handler: async (args, ctx) => {
    const note = rawText(args);
    if (!note) return ctx.continue("usage: /btw <note>");
    await session.appendMessage("system", "[note] " + note);
    return ctx.continue("noted.");
  },
});
