/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /session — current session metadata (SPEC §7 / design 02).
// Backing: session_store get_metadata. No new tool/service.
import { orkeonTelemetry } from "../shared/infrastructure/orkeon/wiring.ts";

const telemetry = orkeonTelemetry();

defineCommand({
  name: "session",
  description: "Show the current session's metadata (title, model, message count).",
  handler: async (_args, ctx) => {
    const md = await telemetry.readMetadata();
    ctx.table([{
      title: md.title ?? "(untitled)",
      model: md.model ?? "?",
      messages: md.messageCount ?? 0,
      estTokens: md.estimatedTokens ?? 0,
    }]);
    return ctx.continue();
  },
});
