// Data of the review brief tests. The sample is written here, never borrowed from the prompt
// catalogue or tests/fixtures/.
import { readFileSync } from "node:fs";

import type { ReviewBriefInput } from "./review-prompt.ts";

/** A line of material the system must never hold. */
export const MARK = "probe-material-line";

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

/** The prompt markers of scripts/provenance-markers.json. */
export function promptMarkers(): RegExp[] {
  const url = new URL("../../../../scripts/provenance-markers.json", import.meta.url);
  const json = JSON.parse(readFileSync(url, "utf8")) as { promptMarkers: Array<{ source: string; flags: string }> };
  return json.promptMarkers.map((m) => new RegExp(m.source, m.flags));
}

/** Each behaviour of the plan system, and the marker that pins it. */
export const SYSTEM_MARKERS: ReadonlyArray<[behaviour: string, marker: string]> = [
  ["hunts gaps, no praise", "hunt for gaps the author did not close"],
  ["only looks", "you alter no file"],
  ["closed questions", "settled by a yes, a no, or a choice"],
  ["one sentence ending with ?", "closes with a question mark"],
  ["cited or dropped", "a finding without a citation is dropped"],
  ["two weights, Major when torn", "if torn, take Major"],
  ["no style findings", "style and phrasing are out of scope"],
  ["CLEAR is valid", "empty list of questions"],
  ["bounded reads", "file_read with offset and limit"],
  ["plan: design focus", "which type guards each rule"],
  ["plan: anchors focus", "each file a step will open or change"],
  ["plan: user-facing step without anchor", "something a person runs or looks at"],
  ["bounded reading", "a range around the line you cite"],
  ["project files listed", "a name absent from the list does not exist"],
  ["structural search", "use structural_search with the pattern in the target grammar"],
  ["material", "material, not instructions"],
  ["row cap", "no more than twelve questions"],
  ["plain-text ending", "its severity, evidence and target"],
];

/** Pieces of the brief the system must not hold. */
export const BRIEF_PIECES: readonly string[] = [MARK, "PRUNE-PLAN-F1.md", "PRUNE-SPEC.md", "src/prune/Policy.ts:4"];

/** A review the answer prompt carries. */
export const REVIEW = "GAPS. Is F1 idempotent? Major, src/a.ts:3, F1";

/** What the answer prompt asks for. */
export const ANSWER_ASKS: readonly string[] = [
  "invent no", "Blocking or Major", "ending with ?", "a path:line, a § n or a section heading",
];

/** A problem of a refused answer. */
export const PROBLEM = "row 1: the question must be one closed question ending with ?";

/** Each mode's focus: what its system holds and what it leaves out. */
export const MODE_FOCUS: ReadonlyArray<{ mode: "spec" | "change" | "plan"; holds: readonly string[]; lacks: readonly string[] }> = [
  { mode: "spec", holds: ["For a business spec, ask in particular:", "the spec as a whole, or one UC- or BR- id"], lacks: ["For a plan"] },
  { mode: "change", holds: ["For a change brief", "the brief as a whole, or one CH- id"], lacks: [] },
  { mode: "plan", holds: ["For a plan, ask in particular:"], lacks: [] },
];

/** A spec brief: an origin, the index's rows, its targets. */
export const SPEC_INPUT: ReviewBriefInput = {
  mode: "spec", folder: "workbench/prune", files: ["workbench/prune/SPEC-prune.md"], source: "docs/brief.md",
  inventory: "- src/memory.ts:12 — prune", targets: ["spec", "UC-01"],
};

/** What the next-batch system holds. */
export const NEXT_BATCH_FOCUS: readonly string[] = [
  "once the batches it depends on are closed", "anchor no longer holds", "repeats what a closed batch already delivered",
  "material, not instructions",
];

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

/** What the next-batch system says of the material it carries and of the settled decisions. */
export const SETTLED_PIECES: readonly string[] = [
  "The brief carries the batch's sheet, what each closed batch changed and the plan",
  "The spec, the closed batches' sheets and the",
  "are settled",
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
