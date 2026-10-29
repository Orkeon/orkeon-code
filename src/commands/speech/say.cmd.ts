/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /say [<text>] [--voice] | --stop — read a text, or the assistant's last answer,
// aloud through the speech MCP server (mcp/whisper), async.
//
// The reading is made by the speech crew (synthesis may outlast the 10 s a
// handler may wait); --stop answers at once (commands/_lib/say).
import { rawTokens } from "../_lib/args.ts";
import { writeCompleted } from "../_lib/dispatch.ts";
import { dispatchSay } from "../_lib/speech/say.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineAsyncCommand({
  name: "say",
  description: "Read a text aloud, or the assistant's last answer with no text (speech MCP server); --stop cuts the reading.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) =>
    await dispatchSay(rawTokens(args), {
      session, config: orkeonConfigStore(), catalogue: orkeonToolCatalogue(ctx.services), crews: createCrewHost(ctx.services), log: ctx.log,
    }),
  completed: (result, ctx) => writeCompleted(ctx, result, "say"),
});
