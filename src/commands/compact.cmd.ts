/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /compact — summarise + shrink the conversation buffer via the session-compact crew (SPEC §5.1).
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";

defineAsyncCommand({
  name: "compact",
  description: "Compact the session conversation buffer to free up context.",
  maxConcurrent: 1,
  dispatch: (_args, ctx) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "session-compact", {}),
  completed: (result, ctx) => writeCompleted(ctx, result, "compact", "✓ "),
});
