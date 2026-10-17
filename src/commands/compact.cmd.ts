/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /compact [<focus>] — summarise + shrink the conversation buffer via the session-compact crew; the
// text after the command is what the summary must keep above all.
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { rawText } from "./_lib/args.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";

defineAsyncCommand({
  name: "compact",
  description: "Compact the session conversation buffer to free up context; text after it names what the summary must keep.",
  maxConcurrent: 1,
  dispatch: (args, ctx) =>
    launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "session-compact", { focus: rawText(args) }),
  completed: (result, ctx) => writeCompleted(ctx, result, "compact", "✓ "),
});
