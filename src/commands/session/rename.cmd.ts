/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /rename <title> — set the session title (SPEC §5.2).
import { rawText } from "../_lib/args.ts";
import { orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "rename",
  description: "Set the current session's title.",
  handler: async (args, ctx) => {
    const title = rawText(args);
    if (!title) return ctx.continue("usage: /rename <title>");
    await session.setTitle(title);
    return ctx.continue("renamed session to: " + title);
  },
});
