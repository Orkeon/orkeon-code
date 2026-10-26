// The sheet, facts and pointers the state file is tested on.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MAX_EVENT_LINES, MAX_TREE_LINES, boundLine, sheetStateSteps } from "../../../../src/shared/domain/workflow/state-file.ts";
import type { StateFacts } from "../../../../src/shared/domain/workflow/state-file.ts";
import { parseBatchSheet } from "../../../../src/shared/domain/dev/plan-format.ts";

/** The demo plan's sheet of batch F2. */
export const F2 = readFileSync(fileURLToPath(new URL("../../../fixtures/dev/workbench/demo/DEMO-PLAN-F2.md", import.meta.url)), "utf-8");

export interface PointerCase { name: string; raw: string; pointer: { code: string | null; phase: string } }

export const PHASE_ONLY: readonly PointerCase[] = [
  { name: "a null code", raw: `{"code":null,"phase":"F3"}`, pointer: { code: null, phase: "F3" } },
  { name: "a code that is no folder name", raw: `{"code":"../x","phase":"F3"}`, pointer: { code: null, phase: "F3" } },
];

export const NO_POINTERS: ReadonlyArray<string | null> = [null, "", "{", "[]", `{"phase":"2"}`, `{"code":"demo"}`];

/** The facts of batch F2 of demo, before a manual compaction; `over` replacing some. */
export const stateFacts = (over: Partial<StateFacts> = {}): StateFacts => ({
  code: "demo", phase: "F2", at: "2026-10-24T10:00:00Z", trigger: "manual", sheet: "workbench/demo/DEMO-PLAN-F2.md",
  steps: sheetStateSteps(parseBatchSheet(F2)),
  events: ["- 2026-10-21 08:30 F2 launched"],
  reports: ["F2-audit.md"],
  tree: { lines: [" M src/a.ts"] },
  ...over,
});

export const STATE_MENTIONS = [
  "`workbench/demo/DEMO-PLAN-F2.md`",
  "- Step 2 — Refuse a code that is not a plain folder name: RED [ ] GREEN [ ] COST [ ]\n",
  "\nFirst open: Step 1 — Print the batches of a plan with their state\n",
  "## Events of F2 in `.orkeon/dev/demo/batches-state.md`\n\n- 2026-10-21 08:30 F2 launched\n",
  "## Reports recorded for F2\n\n- F2-audit.md\n",
  "```text\n M src/a.ts\n```\n",
];

export const EMPTY_MENTIONS = [
  "(the sheet has no step with a TDD line)",
  "No open step: every TDD line is ticked.",
  "```text\n(clean)\n```",
];

/** Two tree lines more than the state file keeps. */
export const MANY_TREE_LINES = Array.from({ length: MAX_TREE_LINES + 2 }, (_, i) => `?? f${i}`);

export const LONG = "x".repeat(400);

/** One open step whose title was bounded. */
export const longSteps = () => [{ label: boundLine(`Step 1 — ${LONG}`), tdd: "RED [ ] GREEN [ ] COST [ ]", open: true }];

/** Five events more than the state file keeps, the last one long. */
export const MANY_EVENTS = Array.from(
  { length: MAX_EVENT_LINES + 5 },
  (_, i) => `- 2026-10-24 09:00 F2 launched ${i}${i === MAX_EVENT_LINES + 4 ? LONG : ""}`,
);
