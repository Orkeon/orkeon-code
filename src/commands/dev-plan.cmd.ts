/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /dev-plan [<code> | <path>] [--replace] — turn a settled spec or change brief into a plan of batches. A Blocking
// open question stops it here, with no crew; the inventory, the model and the review run in crews/dev-plan.
// The host's gate must be on; the dev rule sets are put in it before the crew (_lib/dev-step.ts), and the crew's
// tool callbacks check them again and run the /hooks the input carries.
import { rawTokens } from "./_lib/args.ts";
import { devPlanGate, parseDevPlanArgs } from "./_lib/dev.ts";
import { readWriteModeRefusal, startDevStep } from "./_lib/dev-step.ts";
import { storedEffort } from "./_lib/effort.ts";
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonSessionIo, orkeonShell, orkeonToolCatalogue,
} from "../shared/infrastructure/orkeon/wiring.ts";

const deps = { files: orkeonFiles(), shell: orkeonShell(), config: orkeonConfigStore(), session: orkeonSessionIo() };

defineAsyncCommand({
  name: "dev-plan",
  description: "Plan a settled spec or change brief as batches: plan, one sheet per batch, a read-only review (--replace: plan again).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevPlanArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const stop = await devPlanGate(parsed.args, deps);
    if (stop !== null) return { message: stop };
    // The crew writes files through its own port, which no mode gates: a read-only mode refuses it here.
    const readOnly = await readWriteModeRefusal(deps.session, "dev-plan", "writes files");
    if (readOnly !== null) {
      ctx.writeLine(readOnly);
      return { refused: readOnly };
    }
    const start = await startDevStep("dev-plan", {
      ...deps, gate: createPermissionRules(ctx.services), catalogue: orkeonToolCatalogue(ctx.services),
    });
    if (!start.ok) {
      ctx.writeLine(start.line);
      return { refused: start.line };
    }
    for (const line of start.lines) ctx.writeLine(line);
    const details = { ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length };
    return launchCrew(
      { crews: createCrewHost(ctx.services), log: ctx.log }, "dev-plan",
      { ...parsed.args, ...start.input, effort: await storedEffort(deps.session) }, details,
    );
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "dev-plan"),
});
