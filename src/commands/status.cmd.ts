/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /status — session status: model, workspace, cost and crew summary
// (baseline 04 §/status).
//
// B-11 deepening. The baseline names four things — model, cost, workspace, active
// crew summary — and the pre-B-11 table showed messages/tokens/cost/calls: the two
// an operator most often opens /status to check, the MODEL and the workspace, were
// the two missing. Today's session made that concrete: a REPL running with no `Llm`
// section answered every turn with silence, and /status could not have told anyone.
import { orkeonSessionIo, orkeonTelemetry } from "../shared/infrastructure/orkeon/wiring.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { runStatus } from "./_lib/status.ts";
import { showView } from "./_lib/view.ts";

const session = orkeonSessionIo();
const telemetry = orkeonTelemetry();

defineCommand({
  name: "status",
  description: "Show the session status: model, workspace, context, cost and crews.",
  handler: async (_args, ctx) =>
    showView(ctx, await runStatus({ session, telemetry, crews: createCrewHost(ctx.services) })),
});
