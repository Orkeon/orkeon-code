/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /security-review (B-12) — the code-review crew narrowed to the SECURITY lens
// (baseline 04 §/security-review, reusing baseline 03 §CodeReview Crew).
//
// Same reasoning as /bughunter: one facet of the existing crew, passed as a crew
// input so it outranks the `review.lenses` setting. Keeping it inside the review
// crew also means a security pass inherits the scope validation (B-3) — a review
// asked to look at two paths looks at those two paths.
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";

defineAsyncCommand({
  name: "security-review",
  description: "Review the staged changes for security issues (security lens only).",
  maxConcurrent: 1,
  args: {
    files: { type: "string[]", required: false },
    commit: { type: "string", required: false },
  },
  dispatch: (args, ctx) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "code-review", {
    files: args.files ?? [],
    commit: args.commit ?? "",
    lenses: "security",
  }),
  completed: (result, ctx) => writeCompleted(ctx, result, "security-review", "✓ security-review → "),
});
