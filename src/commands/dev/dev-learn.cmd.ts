/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /dev-learn [<axis>] [--list] | --accept <ids> | --refuse <id | text> — turn gaps that recur across dev batches into
// proposals. Proposing and listing read every verdict file, so they run in crews/dev-learn; --accept and --refuse are a
// few reads and one write, answered here.
import { rawTokens } from "../_lib/args.ts";
import { parseDevLearnArgs, runDevLearnDecision } from "../_lib/dev/dev.ts";
import { launchCrew, withLlmProfile, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonClock, orkeonConfigStore, orkeonFiles, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";

const deps = { files: orkeonFiles(), shell: orkeonShell(), config: orkeonConfigStore(), clock: orkeonClock() };

defineAsyncCommand({
  name: "dev-learn",
  description: "Turn gaps that recur across dev batches into proposals (--list: the backlog; --accept/--refuse: decide).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevLearnArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const a = parsed.args;
    if (a.kind === "accept" || a.kind === "refuse") return { message: await runDevLearnDecision(a, deps) };
    return launchCrew(await withLlmProfile({ crews: createCrewHost(ctx.services), log: ctx.log }, orkeonConfigStore()), "dev-learn",
      { axis: a.axis, list: a.kind === "list" });
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "dev-learn"),
});
