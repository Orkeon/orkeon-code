/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /review [<path>…] [--commit <sha>] [--lens <lens>] [--passes <1-5>] — multi-lens code review of the staged changes
// via the code-review crew; --lens narrows it to one lens (correctness for a bug hunt), outranking the review.lenses
// setting, and --passes sets this run's round count, outranking the session's. Two aliases keep their own shape
// (_lib/git/review.ts): /security-review is the review narrowed to the security lens — not a second crew but one
// facet of this one, passed as a crew input so it outranks review.lenses, and so a security pass inherits the scope
// validation (a review asked to look at two paths looks at those two); /passes [n] shows or sets the session's pass
// count, answered here without launching a review. A review asked while one runs is refused here, crew by crew
// (reviewBusyText): the command has no instance quota, so /passes still answers while a review runs.
import { rawTokens, typedCommand } from "../_lib/args.ts";
import { launchCrew, writeCompleted } from "../_lib/dispatch.ts";
import { REVIEW_CREW, parseReviewArgs, reviewBusyText, runPasses } from "../_lib/git/review.ts";
import { showView } from "../_lib/view.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { createRunningCrews } from "../../shared/infrastructure/orkeon/running-crews.ts";
import { orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineAsyncCommand({
  name: "review",
  aliases: ["security-review", "passes"],
  description: "Run a multi-lens code review on staged changes; --lens correctness|security|style keeps one lens, --passes 1-5 sets this run's rounds.",
  dispatch: async (args, ctx) => {
    const parsed = parseReviewArgs(rawTokens(args), typedCommand(ctx.command?.rawInput, "review"));
    if (parsed.route === "refused") {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    if (parsed.route === "passes") return showView(ctx, await runPasses(parsed.token, { session }));
    const busy = reviewBusyText(createRunningCrews(ctx.services));
    if (busy !== undefined) {
      ctx.writeLine(busy);
      return { refused: busy };
    }
    return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, REVIEW_CREW, { ...parsed.input });
  },
  completed: (result, ctx) => {
    const name = typedCommand(ctx.command?.rawInput, "review");
    writeCompleted(ctx, result, name, `✓ ${name} → `);
  },
});
