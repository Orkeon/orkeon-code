/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /status — the session's status: model, provider, workspace, context, cost, crews,
// and the version, runtime and platform. /version, /env, /session and /upgrade, which showed those
// apart, are its aliases.
import { orkeonSessionIo, orkeonShell, orkeonTelemetry } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { readHostProvider } from "../../shared/infrastructure/orkeon/host-provider.ts";
import { runStatus } from "../_lib/status/status.ts";
import { showView } from "../_lib/view.ts";

const session = orkeonSessionIo();
const telemetry = orkeonTelemetry();
const shell = orkeonShell();

defineCommand({
  name: "status",
  aliases: ["version", "env", "session", "upgrade"],
  description: "Show the session status: model, provider, workspace, context, cost, crews, version, runtime and platform.",
  handler: async (_args, ctx) =>
    showView(ctx, await runStatus({
      session, telemetry, crews: createCrewHost(ctx.services), shell, provider: () => readHostProvider(ctx.services),
    })),
});
