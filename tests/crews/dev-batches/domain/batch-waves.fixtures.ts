// Batches, plans and sheets for the batchWaves and sheetAnchorPaths tests.
import { readFileSync } from "node:fs";
import type { WaveBatch } from "../../../../src/crews/dev-batches/domain/batch-waves.ts";

/** A sheet of the plan fixtures, its `## Anchors` naming paths in every column. */
export const SHEET = readFileSync(new URL("../../../fixtures/dev/plan/expected/PRUNE-PLAN-F1.md", import.meta.url), "utf8");

/** The paths SHEET anchors: bare, unique, sorted. */
export const SHEET_ANCHOR_PATHS: readonly string[] = [
  "src/commands/_lib/memory.ts",
  "src/shared/domain/memory-prune.test.ts",
  "src/shared/domain/memory-prune.ts",
  "src/shared/domain/memory.ts",
  "tests/commands-memory.test.ts",
  "tests/support/fake-memory-store.ts",
];

/** A batch of a wave: no dependency and not done unless told. */
export const b = (id: string, anchors: string[], dependsOn: string[] = [], done = false): WaveBatch => ({ id, dependsOn, anchors, done });

/** A batch's sheet whose one anchor row names its own test and `Makefile`. */
export const makefileSheet = (id: string): string =>
  `# X-PLAN-${id} — x\n\n## TDD sequence\n\n### Step 1 — a\n\n## Anchors\n\n| Step | T | D | P |\n|---|---|---|---|\n| 1 — a | \`t/${id}.test.ts\` — to create | — | \`Makefile\` — existing |\n`;

/** Plans where a batch anchoring no path runs alone. */
export const NO_ANCHOR_PLANS: readonly { name: string; plan: WaveBatch[]; waves: string[][] }[] = [
  { name: "runs a batch that anchors no path alone, after the wave of the others",
    plan: [b("F1", ["a"]), b("F2", []), b("F3", ["c"])], waves: [["F1", "F3"], ["F2"]] },
  { name: "runs a first batch that anchors no path alone, before the next",
    plan: [b("F1", []), b("F2", ["b"])], waves: [["F1"], ["F2"]] },
];

/** Plans batchWaves refuses, as the sequential order does. */
export const REFUSED_PLANS: readonly { name: string; plan: WaveBatch[] }[] = [
  { name: "refuses an unknown dependency, as the sequential order does", plan: [b("F1", ["a"], ["F9"])] },
  { name: "refuses a cycle, as the sequential order does", plan: [b("F1", ["a"], ["F2"]), b("F2", ["b"], ["F1"])] },
];
