/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /dev-verify F<n> [...] — audit one dev batch: the gate, the capture, a read-only auditor, the verdict file.
// Parses the arguments here and hands the work to crews/dev-verify (a build can take minutes). Unless --gate-only,
// the host's gate must be on, and the dev rule sets are put in it first (_lib/dev-step.ts). The batch is
// recorded as the one in progress: a compaction writes its state file (.orkeon/dev/<code>/state-F<n>.md).
import { rawTokens } from "../_lib/args.ts";
import { parseDevVerifyArgs } from "../_lib/dev.ts";
import { devVerifyStep, markActiveWorkflow, startDevStep } from "../_lib/dev-step.ts";
import { launchCrew, writeCompleted } from "../_lib/dispatch.ts";
import { storedEffort } from "../_lib/effort.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import { orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue } from "../../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

defineAsyncCommand({
  name: "dev-verify",
  description: "Audit a dev batch: gate, capture, a read-only auditor and the verdict file (--gate-only: the gate alone, no model call).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevVerifyArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const step = devVerifyStep(parsed.args);
    let details: Record<string, unknown> = {};
    let crewInput: Record<string, unknown> = { hooks: [] };
    if (step !== null) {
      const start = await startDevStep(step, {
        ...deps, gate: createPermissionRules(ctx.services), catalogue: orkeonToolCatalogue(ctx.services),
      });
      if (!start.ok) {
        ctx.writeLine(start.line);
        return { refused: start.line };
      }
      for (const line of start.lines) ctx.writeLine(line);
      details = { ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length };
      crewInput = start.input;
    }
    const unrecorded = await markActiveWorkflow(deps.session, parsed.args);
    if (unrecorded !== null) ctx.writeLine(unrecorded);
    return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "dev-verify",
      { ...parsed.args, ...crewInput, effort: await storedEffort(deps.session) }, details);
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "dev-verify"),
});
