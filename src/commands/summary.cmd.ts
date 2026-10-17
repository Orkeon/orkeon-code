/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /summary (E-1) — LLM-generated session summary WITHOUT rewriting the buffer
// (unlike /compact). Runs through the main-loop crew in plan mode (read-only
// catalogue), under the session's deny rules and with the extra tools of class
// read, like any main-loop launch: the crew's turn prompt already embeds the
// windowed history, so the model summarises exactly what the session holds.
import { launchMainLoop, writeCompleted } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue,
} from "../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

const SUMMARY_PROMPT =
  "Summarise this session so far for the user: key decisions, files touched, " +
  "open tasks, and where we left off. Be concise (a short bullet list). " +
  "Do NOT use any tools — answer from the conversation history alone.";

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
