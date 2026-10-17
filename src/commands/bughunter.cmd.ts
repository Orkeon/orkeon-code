/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /bughunter (B-12) — the code-review crew narrowed to the CORRECTNESS lens
// (baseline 04 §/bughunter, reusing baseline 03 §CodeReview Crew).
//
// Not a second crew: the original's bug hunt is the same review machinery with a
// single facet, and duplicating the crew would mean two diff collectors, two
// dedup/rank paths and two report renderers drifting apart. The lens travels as a
// crew INPUT, which beats the standing `review.lenses` setting (B-9) — narrowing
// on purpose must not be overridden by a preference.
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";

defineAsyncCommand({
  name: "bughunter",
  description: "Hunt for bugs in the staged changes (code review, correctness lens only).",
  maxConcurrent: 1,
  args: {
    files: { type: "string[]", required: false },
    commit: { type: "string", required: false },
  },
  dispatch: (args, ctx) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "code-review", {
    files: args.files ?? [],
    commit: args.commit ?? "",
    lenses: "correctness",
  }),
  completed: (result, ctx) => writeCompleted(ctx, result, "bughunter", "✓ bughunter → "),
});
