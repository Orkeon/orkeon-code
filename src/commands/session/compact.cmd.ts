/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /compact [<focus> | --snip [N]] — summarise + shrink the conversation buffer via the session-compact
// crew; the text after the command is what the summary must keep above all, and --snip only truncates.
import { launchCrew, withLlmProfile, writeCompleted } from "../_lib/dispatch.ts";
import { parseCompactArgs, rawTokens } from "../_lib/args.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonConfigStore } from "../../shared/infrastructure/orkeon/wiring.ts";

defineAsyncCommand({
  name: "compact",
  description: "Compact the session buffer to free up context; text after it names what the summary must keep; --snip [N] only keeps the head and the last N exchanges.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) =>
    launchCrew(await withLlmProfile({ crews: createCrewHost(ctx.services), log: ctx.log }, orkeonConfigStore()), "session-compact", parseCompactArgs(rawTokens(args))),
  completed: (result, ctx) => writeCompleted(ctx, result, "compact", "✓ "),
});
