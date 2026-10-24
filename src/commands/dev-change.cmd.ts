/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /dev-change <code> [bug|refactor|perf] [--run "<command>"] [<origin>] — write or revise a change brief: the bug
// reproduced or the cost measured first, then its open questions settled one at a time. It runs in a crew of its own
// (crews/dev-change), never in the conversation: a fresh context and the reviewer's read tools. The host's gate must be on; the dev rule sets are put
// in it before the crew (_lib/dev-step.ts), and the crew's tool callbacks check them again and run the /hooks.
import { rawTokens } from "./_lib/args.ts";
import { parseDevChangeArgs } from "./_lib/dev-source.ts";
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
  name: "dev-change",
  description: "Write or revise a change brief (bug, refactor, perf): evidence by running, questions one at a time, a read-only review.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevChangeArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const start = await startDevStep("dev-change", {
      ...deps, gate: createPermissionRules(ctx.services), catalogue: orkeonToolCatalogue(ctx.services),
    });
    if (!start.ok) {
      ctx.writeLine(start.line);
      return { refused: start.line };
    }
    for (const line of start.lines) ctx.writeLine(line);
    const details = { ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length };
    return launchCrew(
      { crews: createCrewHost(ctx.services), log: ctx.log }, "dev-change",
      { ...parsed.args, ...start.input, effort: await storedEffort(deps.session) }, details,
    );
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "dev-change"),
});
