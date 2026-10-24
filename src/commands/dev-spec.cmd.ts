/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /dev-spec <code> [<brief> | <path>.md | <revision request>] — write or revise a business spec, then settle its open
// questions with the person, one at a time. It runs in a crew of its own (crews/dev-spec), never in the
// conversation: a fresh context and the reviewer's read tools. The host's gate must be on; the dev rule sets are put
// in it before the crew (_lib/dev-step.ts), and the crew's tool callbacks check them again and run the /hooks.
import { rawTokens } from "./_lib/args.ts";
import { parseDevSpecArgs } from "./_lib/dev-source.ts";
import { startDevStep } from "./_lib/dev-step.ts";
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { storedEffort } from "./_lib/effort.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonSessionIo, orkeonShell, orkeonToolCatalogue,
} from "../shared/infrastructure/orkeon/wiring.ts";

const deps = { files: orkeonFiles(), shell: orkeonShell(), config: orkeonConfigStore(), session: orkeonSessionIo() };

defineAsyncCommand({
  name: "dev-spec",
  description: "Write or revise a business spec, ask its open questions one at a time, then a read-only review.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevSpecArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const start = await startDevStep("dev-spec", {
      ...deps, gate: createPermissionRules(ctx.services), catalogue: orkeonToolCatalogue(ctx.services),
    });
    if (!start.ok) {
      ctx.writeLine(start.line);
      return { refused: start.line };
    }
    for (const line of start.lines) ctx.writeLine(line);
    const details = { ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length };
    return launchCrew(
      { crews: createCrewHost(ctx.services), log: ctx.log }, "dev-spec",
      { ...parsed.args, ...start.input, effort: await storedEffort(deps.session) }, details,
    );
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "dev-spec"),
});
