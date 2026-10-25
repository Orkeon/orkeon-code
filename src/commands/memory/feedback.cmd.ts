/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /feedback (E-1) — record user feedback as a durable typed memory (category
// "feedback", ICategoryMemoryStore). DEVIATION (recorded in RESULTS.md): the
// original submits to Anthropic; Orkeon Code has no telemetry endpoint, so feedback
// lands in the same store the agent replays each turn — it directly shapes
// subsequent behavior.
import { rawText } from "../_lib/args.ts";
import { orkeonMemoryStore } from "../../shared/infrastructure/orkeon/wiring.ts";

const memory = orkeonMemoryStore();

defineCommand({
  name: "feedback",
  description: "Record feedback for the agent (stored as a durable 'feedback' memory).",
  handler: async (args, ctx) => {
    const content = rawText(args);
    if (!content) return ctx.continue("usage: /feedback <what should change or keep happening>");
    await memory.add("feedback", content);
    return ctx.continue("feedback recorded — the agent replays feedback memories on every /assistant turn.");
  },
});
