/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /analyze — deterministic codebase analysis (crews/analyze).
//
// The complement of asking the assistant "analyse la codebase": the free-text
// path steers the model with the search playbook but cannot force a tool; this
// command's crew chains index → maps → dependency_graph ITSELF, so the
// RaggableTree is always the source, then makes exactly one no-tools LLM call
// to synthesize business objects and dependencies. `--raw` skips that call and
// prints the harvest (zero LLM cost).
import { launchCrew, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";

defineAsyncCommand({
  name: "analyze",
  description: "Analyze the codebase deterministically (index → maps → dependency graph) and synthesize business objects + dependencies; --raw prints the harvest without any LLM call.",
  maxConcurrent: 1,
  args: {
    raw: { type: "boolean", required: false, default: false },
  },
  dispatch: (args, ctx) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "analyze", { raw: args.raw === true }),
  completed: (result, ctx) => writeCompleted(ctx, result, "analyze", "✓ analyze →\n"),
});
