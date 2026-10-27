/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /context — the session's context: metadata, buffer size, the tokens used against the window,
// the pressure tier, the count of compaction boundaries, the tokens by kind of entry and the
// prompt-cache tokens read and written. /ctx-viz, which showed the window alone, is its alias.
// Entry point: wires the session and the telemetry into _lib/status/context.ts (runContext).
import { runContext } from "../_lib/status/context.ts";
import { showView } from "../_lib/view.ts";
import { orkeonSessionIo, orkeonTelemetry } from "../../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), telemetry: orkeonTelemetry() };

defineCommand({
  name: "context",
  aliases: ["ctx-viz"],
  description: "Show the current session context: title, model, messages, tokens (by kind when the host reports them), pressure, cache tokens.",
  handler: async (_args, ctx) => showView(ctx, await runContext(deps)),
});
