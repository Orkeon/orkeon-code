/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /tasks (E-1, A-3) — the session task list (add, list, done, clear) and the agent instances the dev
// crews run as background children (show, stop, send, repair). Everything but a repair is answered
// here, from the state bag (_lib/tasks.ts); a repair launches crews/agent-run, whose completion
// prints the new run's answer.
import { rawTokens } from "./_lib/args.ts";
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { runTasks } from "./_lib/tasks.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const deps = { session: orkeonSessionIo(), clock: () => new Date() };

defineAsyncCommand({
  name: "tasks",
  description: "Session task list (add, done, clear) and the agent instances of the dev crews: list, show, stop, send, repair by a new run.",
  dispatch: async (args, ctx) => {
    const { view, launch } = await runTasks(rawTokens(args), deps);
    for (const line of view.lines ?? []) ctx.writeLine(line);
    if (view.table) ctx.table(view.table);
    if (launch === undefined) return { message: view.text ?? "" };
    if (view.text !== undefined) ctx.writeLine(view.text);
    return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, launch.crew, launch.input, launch.details);
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "tasks repair", "repair — "),
});
