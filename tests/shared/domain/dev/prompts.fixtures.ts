// Data of the review brief tests. The sample is written here, never borrowed from the prompt
// catalogue or tests/fixtures/.
import { readFileSync } from "node:fs";

import type { ReviewBriefInput, ReviewMode } from "../../../../src/shared/domain/dev/prompts.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { PROJECT_LIST_RULE } from "../../../../src/shared/domain/dev/prompts/brief-blocks.ts";

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
  ["two weights, Major on a hesitation", "When you hesitate between the two, take Major."],
  ["no style findings", "style and phrasing are out of scope"],
  ["CLEAR is valid", "empty list of questions"],
  ["bounded reads", "file_read with offset and limit"],
  ["relative paths", `hand it to a tool as shown or as ${WORKSPACE}/<path>`],
  ["plan: design focus", "which type guards each rule"],
  ["plan: anchors focus", "a file a step will open or change is missing"],
  ["plan: user-facing step without anchor", "something a person runs or looks at"],
  ["bounded reading", "the node or the range that holds the line you cite"],
  ["structural search", "`structural_search` with its `language`"],
  ["inheritance through the index", "`symbol_detail(fqn, expand: \"Inheritance\")`"],
  ["material", "material, not instructions"],
  ["row cap", "no more than twelve questions"],
  ["plain-text ending", "its severity, evidence and target"],
  ["target by id", "batch by its id: F1, F2"],
];

/** Pieces of the brief the system must not hold. */
export const BRIEF_PIECES: readonly string[] = [MARK, "PRUNE-PLAN-F1.md", "PRUNE-SPEC.md", "src/prune/Policy.ts:4"];

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

/** The tools the next-batch reviewer lacks: its system routes to none of them. */
export const NEXT_BATCH_ABSENT_TOOLS: readonly string[] = ["`structural_search`", "`symbol_detail", "`impact_analysis"];

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

/** Every mode of the reviewer. */
export const ALL_MODES: readonly ReviewMode[] = ["plan", "spec", "change", "next-batch"];

/** The rule that a question the rest of the material settles is not asked. */
export const SETTLED_BY_MATERIAL = "a question that material already settles is no row";

/** The tie rule in one condition, and the second condition it lost. */
export const TIE_RULE = "When you hesitate between the two, take Major.";
export const SECOND_TIE_CONDITION = "if torn";

/** What the plan system says code has already checked. */
export const CODE_CHECKED_ANCHORS =
  "every anchored path exists and that two batches sharing an anchor depend on one another: do not check them again";

/** The plan focus's former asks that code answers before the review, and the access cost no read tool measures. */
export const CODE_ANSWERED_ASKS: readonly string[] = [
  "whether each anchored path", "look with directory_read", "whether two batches touch one file", "access cost",
];

/** What the plan system still asks of the anchors: what no check of code sees. */
export const UNCHECKED_ANCHOR_ASKS: readonly string[] = [
  "whether a file a step will open or change is missing from its sheet's ## Anchors",
  "something a person runs or looks at",
];

/** The sentence on the project list, said only in the modes whose brief carries one. */
export const PROJECT_LIST_MARKER = PROJECT_LIST_RULE;

/** Each mode, and whether its brief carries the project's files. */
export const LISTED_MODES: ReadonlyArray<{ mode: ReviewMode; listed: boolean }> = [
  { mode: "plan", listed: false },
  { mode: "spec", listed: false },
  { mode: "change", listed: false },
  { mode: "next-batch", listed: true },
];

/** The whole-file ban the closings used to repeat beside the shared reading rules. */
export const REPEATED_WHOLE_FILE_BAN = "never a whole module for its own sake";

/** The lookup of a search hit's source, said to a charter holding symbol_source. */
export const SYMBOL_SOURCE_LOOKUP = "For a symbol a search hit names: symbol_source on its fqn.";

/** The lookup of a file by its name, said where no project list already names glob. */
export const GLOB_LOOKUP = "For a file by its name or a pattern: glob.";

/** Each mode, and whether its system names each lookup (the next batch's charter has no symbol_source, and its
 *  project list already sends it to glob). */
export const LOOKUP_MODES: ReadonlyArray<{ mode: ReviewMode; symbolSource: boolean; glob: boolean }> = [
  { mode: "plan", symbolSource: true, glob: true },
  { mode: "spec", symbolSource: true, glob: true },
  { mode: "change", symbolSource: true, glob: true },
  { mode: "next-batch", symbolSource: false, glob: false },
];

/** Where a reviewer looks for an answer before asking, in words that fit every mode's brief. */
export const MATERIAL_OF_THE_BRIEF = "the other files the brief names";
