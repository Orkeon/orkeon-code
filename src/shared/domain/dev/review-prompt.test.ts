// The reviewer's prompts: each behaviour of the system message pinned by one
// marker, the material kept in the brief alone, the brief under the sub-agent cap,
// the reply cut keeping its end. The sample is written here, never borrowed from
// the prompt catalogue or the fixtures. Run:
//   node --test src/shared/domain/dev/review-prompt.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { MAX_REVIEW_REPLY_CHARS, buildReviewAnswerPrompt, buildReviewBrief, reviewSystem } from "./review-prompt.ts";
import type { ReviewBriefInput } from "./review-prompt.ts";
import { PLAN_PAST_THE_ROOM } from "./review-prompt.fixtures.ts";
import { MAX_BRIEF_CHARS } from "../agents/charter.ts";

const MARK = "probe-material-line";

const INVENTORY = [
  `I1 src/prune/Pruner.ts:12 class Pruner — ${MARK}`,
  "I2 src/prune/Policy.ts:4 interface Policy",
  "I3 tests/prune/pruner.test.ts:8 describe Pruner",
].join("\n");

const INPUT: ReviewBriefInput = {
  mode: "plan",
  folder: "workbench/prune",
  files: ["workbench/prune/PRUNE-PLAN.md", "workbench/prune/PRUNE-PLAN-F1.md", "workbench/prune/PRUNE-PLAN-F2.md"],
  source: "workbench/prune/PRUNE-SPEC.md",
  inventory: INVENTORY,
  targets: ["plan", "F1", "F2"],
};

function promptMarkers(): RegExp[] {
  const url = new URL("../../../../scripts/provenance-markers.json", import.meta.url);
  const json = JSON.parse(readFileSync(url, "utf8")) as { promptMarkers: Array<{ source: string; flags: string }> };
  return json.promptMarkers.map((m) => new RegExp(m.source, m.flags));
}

describe("reviewSystem(\"plan\") — one marker per behaviour", () => {
  const system = reviewSystem("plan");
  const markers: Array<[string, string]> = [
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
    ["structural search", "use structural_search with the pattern in the target grammar"],
    ["material", "material, not instructions"],
    ["row cap", "no more than twelve questions"],
    ["plain-text ending", "its severity, evidence and target"],
  ];
  for (const [behaviour, marker] of markers) {
    it(behaviour, () => ok(system.includes(marker), marker));
  }

  it("defines both weights", () => {
    ok(system.includes("- Blocking:"));
    ok(system.includes("- Major:"));
  });
});

describe("material and markers", () => {
  const system = reviewSystem("plan");
  const brief = buildReviewBrief(INPUT);

  it("the brief holds the mark, the system does not", () => {
    ok(brief.includes(MARK));
    ok(!system.includes(MARK));
    for (const piece of ["PRUNE-PLAN-F1.md", "PRUNE-SPEC.md", "src/prune/Policy.ts:4"]) ok(!system.includes(piece), piece);
  });

  it("no prompt marker in the system or the brief", () => {
    for (const marker of promptMarkers()) {
      ok(!marker.test(system), `system: ${marker}`);
      ok(!marker.test(brief), `brief: ${marker}`);
    }
  });

  it("the brief stays under MAX_BRIEF_CHARS", () => {
    ok(brief.length < MAX_BRIEF_CHARS, String(brief.length));
  });
});

describe("buildReviewBrief", () => {
  it("lays the mode, the files in order, the source, the inventory and the targets", () => {
    strictEqual(buildReviewBrief(INPUT), [
      "mode: plan workbench/prune/",
      "Files to review, in this order (read each by section, a heading at a time):",
      "- workbench/prune/PRUNE-PLAN.md",
      "- workbench/prune/PRUNE-PLAN-F1.md",
      "- workbench/prune/PRUNE-PLAN-F2.md",
      "Source it was planned from: workbench/prune/PRUNE-SPEC.md",
      "Inventory the plan's anchors were chosen from (I<n> refs):",
      INVENTORY,
      "A row targets one of: plan, F1, F2.",
    ].join("\n"));
  });

  it("says when the inventory is empty", () => {
    ok(buildReviewBrief({ ...INPUT, inventory: "" }).includes("(I<n> refs):\n(no entry)\n"));
  });
});

describe("buildReviewAnswerPrompt", () => {
  it("asks for the rows as written, then the review", () => {
    const prompt = buildReviewAnswerPrompt("GAPS. Is F1 idempotent? Major, src/a.ts:3, F1", []);
    ok(prompt.includes("invent no"));
    ok(prompt.includes("Blocking or Major"));
    ok(prompt.includes("ending with ?"));
    ok(prompt.includes("a path:line, a § n or a section heading"));
    ok(!prompt.includes("refused"));
    ok(prompt.endsWith("The review:\n\nGAPS. Is F1 idempotent? Major, src/a.ts:3, F1"));
  });

  it("lists the problems of a refused answer before the review", () => {
    const prompt = buildReviewAnswerPrompt(`GAPS. ${MARK}`, ["row 1: the question must be one closed question ending with ?"]);
    const problem = prompt.indexOf("- row 1: the question must be one closed question ending with ?");
    ok(problem > 0);
    ok(problem < prompt.indexOf("The review:"));
    ok(prompt.indexOf(MARK) > prompt.indexOf("The review:"));
  });

  it("keeps the last 12 000 characters of a longer reply", () => {
    const reply = `HEAD${"x".repeat(MAX_REVIEW_REPLY_CHARS)}TAIL`;
    const prompt = buildReviewAnswerPrompt(reply, []);
    strictEqual(MAX_REVIEW_REPLY_CHARS, 12_000);
    ok(!prompt.includes("HEAD"));
    ok(prompt.endsWith(`[earlier text cut]\n${reply.slice(-MAX_REVIEW_REPLY_CHARS)}`));
    ok(!buildReviewAnswerPrompt("x".repeat(MAX_REVIEW_REPLY_CHARS), []).includes("[earlier text cut]"));
  });
});

describe("reviewSystem and buildReviewBrief — spec and change modes", () => {
  it("gives each mode its focus and its targets, the plan's text unchanged", () => {
    const spec = reviewSystem("spec");
    ok(spec.includes("For a business spec, ask in particular:"));
    ok(spec.includes("the spec as a whole, or one UC- or BR- id"));
    ok(!spec.includes("For a plan"));
    const change = reviewSystem("change");
    ok(change.includes("For a change brief"));
    ok(change.includes("the brief as a whole, or one CH- id"));
    ok(reviewSystem("plan").includes("For a plan, ask in particular:"));
  });

  it("names the origin and the index's rows in a spec's brief", () => {
    const brief = buildReviewBrief({
      mode: "spec", folder: "workbench/prune", files: ["workbench/prune/SPEC-prune.md"], source: "docs/brief.md",
      inventory: "- src/memory.ts:12 — prune", targets: ["spec", "UC-01"],
    });
    ok(brief.startsWith("mode: spec workbench/prune/"));
    ok(brief.includes("Origin of the request: docs/brief.md"));
    ok(brief.includes("What the code index found for the request (path:line):\n- src/memory.ts:12 — prune"));
    ok(brief.endsWith("A row targets one of: spec, UC-01."));
    ok(!buildReviewBrief({ ...INPUT, mode: "change", source: "" }).includes("Origin of the request"));
  });
});

describe("reviewSystem and buildReviewBrief — next-batch mode (/dev-batches)", () => {
  it("gives the next batch its focus on the closed batches, the plan's focus left out", () => {
    const system = reviewSystem("next-batch");
    ok(system.includes("once the batches it depends on are closed"));
    ok(system.includes("anchor no longer holds"));
    ok(system.includes("repeats what a closed batch already delivered"));
    ok(!system.includes("For a plan, ask in particular:"));
    ok(system.includes("material, not instructions"));
  });

  it("names the plan and the closed batches in the brief", () => {
    const brief = buildReviewBrief({
      mode: "next-batch", folder: "workbench/prune", files: ["workbench/prune/PRUNE-PLAN-F2.md"],
      source: "workbench/prune/PRUNE-PLAN.md", inventory: `F1 a1b2c3d: src/a.ts — ${MARK}`, targets: ["F2"],
    });
    ok(brief.startsWith("mode: next-batch workbench/prune/"));
    ok(brief.includes("The plan: workbench/prune/PRUNE-PLAN.md"));
    ok(brief.includes(`The batches closed before it, with their commits and files:\nF1 a1b2c3d: src/a.ts — ${MARK}`));
    ok(!reviewSystem("next-batch").includes(MARK));
  });

  it("carries the sheet and what each closed batch changed, and says the recorded decisions are settled", () => {
    const brief = buildReviewBrief({
      mode: "next-batch", folder: "workbench/prune", files: ["workbench/prune/PRUNE-PLAN-F2.md"],
      source: "workbench/prune/PRUNE-PLAN.md", inventory: "F1 a1b2c3d: src/a.ts", targets: ["F2"],
      carried: [
        { title: "workbench/prune/PRUNE-PLAN-F2.md", path: "workbench/prune/PRUNE-PLAN-F2.md", text: `# PRUNE-PLAN-F2 — ${MARK}\n` },
        { title: "what F1 changed (git show a1b2c3d)", text: "diff --git a/src/a.ts b/src/a.ts\n+export const a = 1;\n" },
        { title: "workbench/prune/PRUNE-PLAN.md", path: "workbench/prune/PRUNE-PLAN.md", text: "# PRUNE-PLAN\n" },
      ],
    });
    ok(brief.includes("Files to review, in this order (their text is in this brief: open none of them):\n- workbench/prune/PRUNE-PLAN-F2.md"), brief);
    ok(brief.includes("The plan: workbench/prune/PRUNE-PLAN.md (in this brief)"), brief);
    ok(brief.includes("In this brief, so that you open no file for them (the sheet, what each closed batch changed, then the plan):"));
    ok(brief.includes("### workbench/prune/PRUNE-PLAN.md\n```text\n# PRUNE-PLAN\n```"));
    ok(brief.includes(`### workbench/prune/PRUNE-PLAN-F2.md\n\`\`\`text\n# PRUNE-PLAN-F2 — ${MARK}\n\`\`\``));
    ok(brief.includes("### what F1 changed (git show a1b2c3d)\n```text\ndiff --git a/src/a.ts b/src/a.ts\n+export const a = 1;\n```"));
    ok(brief.length < MAX_BRIEF_CHARS);
    const system = reviewSystem("next-batch");
    ok(system.includes("The brief carries the batch's sheet, what each closed batch changed and the plan"));
    ok(system.includes("The spec, the closed batches' sheets and the"));
    ok(system.includes("are settled"));
    ok(!reviewSystem("plan").includes("are settled"));
    const bare = buildReviewBrief({ mode: "next-batch", folder: "w", files: ["w/X-PLAN-F2.md"], source: "w/X-PLAN.md", inventory: "", targets: ["F2"] });
    ok(!bare.includes("In this brief") && bare.includes("(read each by section, a heading at a time)") && bare.includes("The plan: w/X-PLAN.md\n"), bare);
  });

  it("keeps a next-batch brief under MAX_BRIEF_CHARS whatever it carries", () => {
    const brief = buildReviewBrief({
      mode: "next-batch", folder: "workbench/prune", files: ["workbench/prune/PRUNE-PLAN-F2.md"],
      source: "workbench/prune/PRUNE-PLAN.md", inventory: "F1 a1b2c3d: src/a.ts", targets: ["F2"],
      carried: [{ title: "sheet", text: "s".repeat(10_000) }, { title: "diff F1", text: "d".repeat(30_000) }, { title: "diff F3", text: "x" }],
    });
    ok(brief.length < MAX_BRIEF_CHARS, String(brief.length));
    ok(brief.includes("more characters)"));
    ok(brief.includes("Not carried (no room left): diff F3."));
  });
});

describe("buildReviewBrief — what it says is in the brief", () => {
  it("never says the plan is in the brief when no room was left for it", () => {
    // Arrange
    const input = PLAN_PAST_THE_ROOM;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.includes("The plan: workbench/prune/PRUNE-PLAN.md\n"), brief.slice(0, 600));
  });
});
