/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /transcribe <file> [--lang] [--prompt] [--then "<instruction>"] | --list — speech-to-text
// through the Whisper MCP server (mcp/whisper), async.
//
// The call is the command's, made by a crew (a transcription outlasts the 10 s a
// handler may wait): the speech crew prints the text, or, with --then, the
// main loop runs the instruction on the transcription (commands/_lib/transcribe).
import { rawTokens } from "../_lib/args.ts";
import { withLlmProfile, writeCompleted } from "../_lib/dispatch.ts";
import { dispatchTranscribe } from "../_lib/speech/transcribe.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue,
} from "../../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

defineAsyncCommand({
  name: "transcribe",
  description: "Transcribe an audio or video file under /audio (Whisper MCP server); --then runs an instruction on the transcription, --list shows the files.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) =>
    await dispatchTranscribe(rawTokens(args), await withLlmProfile({
      ...deps, catalogue: orkeonToolCatalogue(ctx.services), crews: createCrewHost(ctx.services),
      gate: createPermissionRules(ctx.services), log: ctx.log,
    }, deps.config)),
  completed: (result, ctx) => writeCompleted(ctx, result, "transcribe"),
});
