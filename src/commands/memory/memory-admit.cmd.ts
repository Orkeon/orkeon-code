/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /memory-admit [<id>…] | --refuse <id> [<motif>] | --list | --import — decide the shared memory's candidates
// (_lib/memory-admit.ts). An admission is confirmed here, then written and indexed by the crew
// shared-memory-admit; a refusal, the list and the import are answered here.
import { rawTokens } from "../_lib/args.ts";
import { MEMORY_ADMIT_CREW, parseMemoryAdmitArgs, runMemoryAdmit } from "../_lib/memory-admit.ts";
import { launchCrew, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonConfigStore, orkeonFiles, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";

const deps = { files: orkeonFiles(), shell: orkeonShell(), config: orkeonConfigStore(), clock: () => new Date() };

defineAsyncCommand({
  name: "memory-admit",
  description: "Admit the shared memory's pending candidates into entries/, one confirmation each (--list: the candidates; --refuse <id>: never again; --import: the harness's .claude/agent-memory as candidates).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseMemoryAdmitArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const result = await runMemoryAdmit(parsed.args, deps, {
      writeLine: (text) => ctx.writeLine(text),
      confirm: (message) => ctx.prompt({ type: "confirm", message, default: false }),
    });
    if ("admit" in result) {
      if (result.refusedQuestions !== undefined) ctx.writeLine(`✗ ${result.refusedQuestions}`);
      return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, MEMORY_ADMIT_CREW, { admit: result.admit });
    }
    if ("refused" in result) ctx.writeLine(`✗ ${result.refused}`);
    return result;
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "memory-admit"),
});
