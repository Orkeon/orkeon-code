// Data of the review brief and answer prompt tests. The sample is written here, never borrowed from the prompt
// catalogue or tests/fixtures/.
import { readFileSync } from "node:fs";

import type { ReviewBriefInput } from "../../../../src/shared/domain/dev/review-brief.ts";

/** A line of material the brief carries. */
export const MARK = "probe-material-line";

/** The prompt markers of scripts/provenance-markers.json. */
export function promptMarkers(): RegExp[] {
  const url = new URL("../../../../scripts/provenance-markers.json", import.meta.url);
  const json = JSON.parse(readFileSync(url, "utf8")) as { promptMarkers: Array<{ source: string; flags: string }> };
  return json.promptMarkers.map((m) => new RegExp(m.source, m.flags));
}

export const INVENTORY = [
  `I1 src/prune/Pruner.ts:12 class Pruner — ${MARK}`,
  "I2 src/prune/Policy.ts:4 interface Policy",
  "I3 tests/prune/pruner.test.ts:8 describe Pruner",
].join("\n");

/** A plan brief of three files. */
export const INPUT: ReviewBriefInput = {
  mode: "plan",
  folder: "workbench/prune",
  files: ["workbench/prune/PRUNE-PLAN.md", "workbench/prune/PRUNE-PLAN-F1.md", "workbench/prune/PRUNE-PLAN-F2.md"],
  source: "workbench/prune/PRUNE-SPEC.md",
  inventory: INVENTORY,
  targets: ["plan", "F1", "F2"],
};

/** The brief INPUT gives. */
export const PLAN_BRIEF = [
  "mode: plan workbench/prune/",
  "Files to review, in this order (read each by section, a heading at a time):",
  "- workbench/prune/PRUNE-PLAN.md",
  "- workbench/prune/PRUNE-PLAN-F1.md",
  "- workbench/prune/PRUNE-PLAN-F2.md",
  "Source it was planned from: workbench/prune/PRUNE-SPEC.md",
  "Inventory the plan's anchors were chosen from (I<n> refs):",
  INVENTORY,
  "A row targets one of: plan, F1, F2.",
].join("\n");

/** A review the answer prompt carries. */
export const REVIEW = "GAPS. Is F1 idempotent? Major, src/a.ts:3, F1";

/** The targets the answer prompt may name. */
export const TARGETS: readonly string[] = ["plan", "F1", "F2"];

/** What the answer prompt asks for. */
export const ANSWER_ASKS: readonly string[] = [
  "invent no", "Blocking or Major", "ending with ?", "a path:line, a § n or a section heading",
  "its target is the id alone, one of", "never the id with a qualifier",
];

/** A problem of a refused answer. */
export const PROBLEM = "row 1: the question must be one closed question ending with ?";

/** A spec brief: an origin, the index's rows, its targets. */
export const SPEC_INPUT: ReviewBriefInput = {
  mode: "spec", folder: "workbench/prune", files: ["workbench/prune/SPEC-prune.md"], source: "docs/brief.md",
  inventory: "- src/memory.ts:12 — prune", targets: ["spec", "UC-01"],
};

/** A next-batch brief carrying nothing, its closed batch marked. */
export const NEXT_BATCH_INPUT: ReviewBriefInput = {
  mode: "next-batch", folder: "workbench/prune", files: ["workbench/prune/PRUNE-PLAN-F2.md"],
  source: "workbench/prune/PRUNE-PLAN.md", inventory: `F1 a1b2c3d: src/a.ts — ${MARK}`, targets: ["F2"],
};

/** A next-batch brief carrying the sheet, what F1 changed and the plan. */
export const CARRYING_INPUT: ReviewBriefInput = {
  mode: "next-batch", folder: "workbench/prune", files: ["workbench/prune/PRUNE-PLAN-F2.md"],
  source: "workbench/prune/PRUNE-PLAN.md", inventory: "F1 a1b2c3d: src/a.ts", targets: ["F2"],
  carried: [
    { title: "workbench/prune/PRUNE-PLAN-F2.md", path: "workbench/prune/PRUNE-PLAN-F2.md", text: `# PRUNE-PLAN-F2 — ${MARK}\n` },
    { title: "what F1 changed (git show a1b2c3d)", text: "diff --git a/src/a.ts b/src/a.ts\n+export const a = 1;\n" },
    { title: "workbench/prune/PRUNE-PLAN.md", path: "workbench/prune/PRUNE-PLAN.md", text: "# PRUNE-PLAN\n" },
  ],
};

/** What the brief of CARRYING_INPUT holds. */
export const CARRIED_PIECES: readonly string[] = [
  "Files to review, in this order (their text is in this brief: open none of them):\n- workbench/prune/PRUNE-PLAN-F2.md",
  "The plan: workbench/prune/PRUNE-PLAN.md (in this brief)",
  "In this brief, so that you open no file for them (the sheet, what each closed batch changed, then the plan):",
  "### workbench/prune/PRUNE-PLAN.md\n```text\n# PRUNE-PLAN\n```",
  `### workbench/prune/PRUNE-PLAN-F2.md\n\`\`\`text\n# PRUNE-PLAN-F2 — ${MARK}\n\`\`\``,
  "### what F1 changed (git show a1b2c3d)\n```text\ndiff --git a/src/a.ts b/src/a.ts\n+export const a = 1;\n```",
];

/** A next-batch brief carrying nothing. */
export const BARE_INPUT: ReviewBriefInput = {
  mode: "next-batch", folder: "w", files: ["w/X-PLAN-F2.md"], source: "w/X-PLAN.md", inventory: "", targets: ["F2"],
};

/** A next-batch brief carrying more than the room. */
export const OVERFULL_INPUT: ReviewBriefInput = {
  mode: "next-batch", folder: "workbench/prune", files: ["workbench/prune/PRUNE-PLAN-F2.md"],
  source: "workbench/prune/PRUNE-PLAN.md", inventory: "F1 a1b2c3d: src/a.ts", targets: ["F2"],
  carried: [{ title: "sheet", text: "s".repeat(10_000) }, { title: "diff F1", text: "d".repeat(30_000) }, { title: "diff F3", text: "x" }],
};

/** A next-batch brief whose sheet fills the room: the plan after it is left out. */
export const PLAN_PAST_THE_ROOM: ReviewBriefInput = {
  mode: "next-batch", folder: "workbench/prune", files: ["workbench/prune/PRUNE-PLAN-F2.md"],
  source: "workbench/prune/PRUNE-PLAN.md", inventory: "F1 a1b2c3d: src/a.ts", targets: ["F2"],
  carried: [
    { title: "workbench/prune/PRUNE-PLAN-F2.md", path: "workbench/prune/PRUNE-PLAN-F2.md", text: "s".repeat(60_000) },
    { title: "workbench/prune/PRUNE-PLAN.md", path: "workbench/prune/PRUNE-PLAN.md", text: "# PRUNE-PLAN\n" },
  ],
};
