/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /tag <text> — tag a note for later recall (SPEC §7 / design 02).
// Backing: memory_store (reference category). No new tool/service.
import { rawText } from "./_lib/args.ts";
import { orkeonMemoryStore } from "../shared/infrastructure/orkeon/wiring.ts";

const memory = orkeonMemoryStore();

defineCommand({
  name: "tag",
  description: "Tag a note into typed memory for later recall.",
  handler: async (args, ctx) => {
    const text = rawText(args);
    if (!text) return ctx.continue("usage: /tag <text>");
    return ctx.continue("tagged → memory #" + (await memory.add("reference", text)));
  },
});
