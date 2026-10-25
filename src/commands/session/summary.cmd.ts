/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /summary — LLM-generated session summary WITHOUT rewriting the buffer
// (unlike /compact). Runs through the main-loop crew in plan mode (read-only
// catalogue), under the session's deny rules and with the extra tools of class
// read, like any main-loop launch: the crew's turn prompt already embeds the
// windowed history, so the model summarises exactly what the session holds.
import { launchMainLoop, writeCompleted } from "../_lib/dispatch.ts";
import { SUMMARY_PROMPT } from "../../shared/domain/session-summary.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue,
} from "../../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

defineAsyncCommand({
  name: "summary",
  description: "Generate an LLM summary of the session (read-only; does not rewrite the buffer).",
  maxConcurrent: 1,
  dispatch: async (_args, ctx) =>
    await launchMainLoop({
      ...deps, catalogue: orkeonToolCatalogue(ctx.services), crews: createCrewHost(ctx.services),
      gate: createPermissionRules(ctx.services), log: ctx.log,
    }, { prompt: SUMMARY_PROMPT, permissionMode: "plan" }),
  completed: (result, ctx) => writeCompleted(ctx, result, "summary", "── session summary ──\n"),
});
