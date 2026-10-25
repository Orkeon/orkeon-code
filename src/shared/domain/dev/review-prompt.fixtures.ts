// Data of the review brief tests.
import type { ReviewBriefInput } from "./review-prompt.ts";

/** A next-batch brief whose sheet fills the room: the plan after it is left out. */
export const PLAN_PAST_THE_ROOM: ReviewBriefInput = {
  mode: "next-batch", folder: "workbench/prune", files: ["workbench/prune/PRUNE-PLAN-F2.md"],
  source: "workbench/prune/PRUNE-PLAN.md", inventory: "F1 a1b2c3d: src/a.ts", targets: ["F2"],
  carried: [
    { title: "workbench/prune/PRUNE-PLAN-F2.md", path: "workbench/prune/PRUNE-PLAN-F2.md", text: "s".repeat(60_000) },
    { title: "workbench/prune/PRUNE-PLAN.md", path: "workbench/prune/PRUNE-PLAN.md", text: "# PRUNE-PLAN\n" },
  ],
};
