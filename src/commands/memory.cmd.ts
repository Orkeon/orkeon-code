/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /memory <list|add|delete|get> ... — typed memory CRUD (SPEC §5.2). Entry point:
// wires the memory store into _lib/memory.ts (runMemory), which holds the
// sub-commands.
import { rawTokens } from "./_lib/args.ts";
import { runMemory } from "./_lib/memory.ts";
import { showView } from "./_lib/view.ts";
import { orkeonMemoryStore } from "../shared/infrastructure/orkeon/wiring.ts";

const memory = orkeonMemoryStore();

defineCommand({
  name: "memory",
  description: "List, add, delete, or get typed memory entries (user/project/feedback/reference).",
  handler: async (args, ctx) => showView(ctx, await runMemory(rawTokens(args), { memory })),
});
