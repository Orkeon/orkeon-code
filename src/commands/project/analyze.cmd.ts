/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /analyze — deterministic codebase analysis (crews/analyze).
//
// The complement of asking the assistant "analyse la codebase": the free-text
// path steers the model with the search playbook but cannot force a tool; this
// command's crew chains index → package map → dependency_graph → package summaries ITSELF, so the
// RaggableTree is always the source, then makes exactly one no-tools LLM call
// to synthesize business objects and dependencies. `--raw` skips that call and
// prints the harvest (zero LLM cost). `--parallel N` parses N files at once when
// the session has no index yet (default: one per processor). `--rebuild` indexes
// again from scratch, ignoring the index of the session and the one saved on disk.
import { launchCrew, withLlmProfile, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonConfigStore } from "../../shared/infrastructure/orkeon/wiring.ts";

defineAsyncCommand({
  name: "analyze",
  description: "Analyze the codebase (index → packages → dependency graph), then synthesize business objects; --raw skips the LLM call; --parallel N parses N files at once; --rebuild reindexes from scratch.",
  maxConcurrent: 1,
  args: {
    raw: { type: "boolean", required: false, default: false },
    parallel: { type: "number", required: false, min: 1, max: 64 },
    rebuild: { type: "boolean", required: false, default: false },
  },
  dispatch: async (args, ctx) => launchCrew(await withLlmProfile({ crews: createCrewHost(ctx.services), log: ctx.log }, orkeonConfigStore()), "analyze", { raw: args.raw === true, parallel: args.parallel, rebuild: args.rebuild === true }),
  completed: (result, ctx) => writeCompleted(ctx, result, "analyze", "✓ analyze →\n"),
});
