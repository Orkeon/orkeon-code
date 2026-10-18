/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /security-review — the code-review crew narrowed to the SECURITY lens, the same as
// `/review --lens security` under the name users look for.
//
// Not a second crew: one facet of the existing one, passed as a crew input so it
// outranks the `review.lenses` setting. Keeping it inside the review crew also means a
// security pass inherits the scope validation — a review asked to look at two paths
// looks at those two paths.
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
