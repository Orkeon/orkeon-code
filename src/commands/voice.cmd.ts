/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /voice [--go] [--lang] [--prompt] [--max] [--silence] | send — dictate a request through the
// Whisper MCP server's microphone tool (mcp/whisper), async.
//
// /voice records and shows the text; /voice send sends it to the assistant;
// --go sends at once (commands/_lib/voice). The recording is made by a crew: it
// outlasts the 10 s a handler may wait.
import { rawTokens } from "./_lib/args.ts";
import { dispatchVoice, renderVoiceCompletion } from "./_lib/voice.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonSessionIo, orkeonToolCatalogue,
} from "../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore(), files: orkeonFiles() };

defineAsyncCommand({
  name: "voice",
  description: "Dictate a request: record the microphone until a silence and show the text; /voice send sends it, --go sends at once.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) =>
    await dispatchVoice(rawTokens(args), {
      ...deps, catalogue: orkeonToolCatalogue(ctx.services), crews: createCrewHost(ctx.services),
      gate: createPermissionRules(ctx.services), log: ctx.log, out: ctx,
    }),
  completed: (result, ctx) => {
    for (const line of renderVoiceCompletion(result)) ctx.writeLine(line);
  },
});
