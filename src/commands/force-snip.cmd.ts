/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /force-snip [keep] — fast destructive truncation of the buffer (SPEC §5.2).
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "force-snip",
  description: "Immediately truncate the conversation to the head plus the last N exchanges.",
  args: { keep: { type: "number", required: false, default: 3 } },
  handler: async (args, ctx) => {
    const { removed, retained } = await session.snip(args.keep ?? 3);
    return ctx.continue("snipped: " + removed + " removed, " + retained + " kept.");
  },
});
