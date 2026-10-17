/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /verify [<zone>] — check the project by running it: the main loop follows the
// verification skills /init-verifiers wrote (one zone's, or all of them), in the
// session's mode, and reports as each skill says. The request is built in
// shared/domain/verifiers.ts.
import { launchMainLoop, writeCompleted } from "./_lib/dispatch.ts";
import { rawText } from "./_lib/args.ts";
import { buildVerifyRequest } from "../shared/domain/verifiers.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue,
} from "../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

defineAsyncCommand({
  name: "verify",
  description: "Check the project by running it, following the verification skills /init-verifiers wrote (one zone, or all).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) =>
    await launchMainLoop({
      ...deps, catalogue: orkeonToolCatalogue(ctx.services), crews: createCrewHost(ctx.services),
      gate: createPermissionRules(ctx.services), log: ctx.log,
    }, { prompt: buildVerifyRequest(rawText(args)), permissionMode: null }),
  completed: (result, ctx) => writeCompleted(ctx, result, "verify"),
});
