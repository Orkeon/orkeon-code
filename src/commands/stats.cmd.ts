/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /stats — full session telemetry (SPEC §5.2), with the prompt-cache columns of /usage (_lib/cache.ts).
import { statsRow } from "./_lib/cache.ts";
import { orkeonTelemetry } from "../shared/infrastructure/orkeon/wiring.ts";

const telemetry = orkeonTelemetry();

defineCommand({
  name: "stats",
  description: "Show full session telemetry: message count, tokens, cost, calls.",
  handler: async (_args, ctx) => {
    ctx.table([statsRow(await telemetry.readStats())]);
    return ctx.continue();
  },
});
