/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /assistant "<request>" — the interactive coding loop (main-loop crew), async (SPEC §5.2).
// Reads an optional leading permission mode (e.g. "plan: refactor X" → plan mode).
//
// launchMainLoop resolves what decides the crew's tool catalogue before the crew
// loads — the mode (the prefix, else the session's), the extra tools the host
// registers, the session's rules (handed to the host gate first) — and passes it
// in `inputs`: the crew builds its catalogue at MODULE scope, which is synchronous
// and cannot await the state bag.
import { parseAssistantInput, rawText } from "./_lib/args.ts";
import { launchMainLoop, writeCompleted } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue,
} from "../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

defineAsyncCommand({
  name: "assistant",
  description: "Ask the interactive coding agent to work on a request.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    // permissionMode is null when the prompt has no "mode:" prefix: launchMainLoop
    // then resolves the session's mode (/mode, else the fallback).
    const { prompt, permissionMode } = parseAssistantInput(rawText(args));
    return await launchMainLoop({
      ...deps, catalogue: orkeonToolCatalogue(ctx.services), crews: createCrewHost(ctx.services),
      gate: createPermissionRules(ctx.services), log: ctx.log,
    }, { prompt, permissionMode });
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "assistant"),
});
