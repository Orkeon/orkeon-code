/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /memory <list|add|delete|get> ... — typed memory CRUD (SPEC §5.2), answered here; /memory admit [<id>…] |
// --refuse <id> [<motif>] | --list | --import — decide the shared memory's candidates (_lib/memory/memory-admit.ts):
// the list, a refusal and the import are answered here, an admission is confirmed here, then written and indexed
// by the crew shared-memory-admit. Two aliases keep their own shape (_lib/memory/memory.ts): /feedback <text> is a
// 'feedback' memory, /memory-admit … the admit sub-verb.
import { rawTokens, typedCommand } from "../_lib/args.ts";
import { launchCrew, writeCompleted } from "../_lib/dispatch.ts";
import { admitTokens, runMemory } from "../_lib/memory/memory.ts";
import { MEMORY_ADMIT_CREW, parseMemoryAdmitArgs, runMemoryAdmit } from "../_lib/memory/memory-admit.ts";
import { showView } from "../_lib/view.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import {
  orkeonClock, orkeonConfigStore, orkeonFiles, orkeonMemoryStore, orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";

const memory = orkeonMemoryStore();
const admitDeps = { files: orkeonFiles(), shell: orkeonShell(), config: orkeonConfigStore(), clock: orkeonClock() };

defineAsyncCommand({
  name: "memory",
  aliases: ["feedback", "memory-admit"],
  description: "List, add, delete, or get typed memory entries (user/project/feedback/reference); admit decides the shared memory's candidates (--list, --refuse <id>, --import).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const tokens = rawTokens(args);
    const typed = typedCommand(ctx.command?.rawInput, "memory");
    const admit = admitTokens(tokens, typed);
    if (admit === null) return showView(ctx, await runMemory(tokens, { memory }, typed));
    const parsed = parseMemoryAdmitArgs(admit);
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const result = await runMemoryAdmit(parsed.args, admitDeps, {
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
  completed: (result, ctx) => writeCompleted(ctx, result, "memory admit"),
});
