// The planner inputs, the instruction markers and the host vocabulary the plan-prompt tests read.
import { readFileSync } from "node:fs";

import type { PlanPromptInput } from "../../../../src/crews/dev-plan/application/plan-prompt.ts";

export const MARK = "seen.add(a);";

export const INPUT: PlanPromptInput = {
  sourceShown: "workbench/prune/SPEC-prune.md", kind: "spec",
  sourceText: `# prune — Prune old memory entries\n\n${MARK}\n`,
  ids: [
    { id: "UC-01", title: "Prune old memory entries", statement: "the user removes old entries", line: 9 },
    { id: "BR-01", title: "An entry older than the cut-off is removed", statement: "", line: 14 },
  ],
  pinned: [], unpinned: [],
  repoCommands: "build `npm run build` · test `npm test`", repoLayout: "domain `src/shared/domain`",
  inventory: "I1 · src/shared/domain/memory.ts:18 · interface MemoryEntry · layer domain",
  workShown: "workbench",
};

export const BRIEF: PlanPromptInput = {
  ...INPUT, sourceShown: "workbench/cache/CHANGE-cache.md", kind: "change", changeKind: "refactor",
  pinned: ["loads the cached map once"],
  unpinned: [{ key: "U1", behaviour: "an absent map file gives an empty map" }],
};

/** Each behaviour of the instructions and the words that pin it. */
export const PLAN_MARKERS: ReadonlyArray<[string, string]> = [
  ["1 no code", "no line of code"],
  ["2 code writes", "code writes the files"],
  ["3 behaviour cut", "cut by behaviour, not by layer"],
  ["4 dependencies", "lists every earlier batch it relies on"],
  ["5 documentation apart", "travel in a separate batch"],
  ["6 step count", "between two and five steps of behaviour"],
  ["7 tests per step", "each step brings one test or more"],
  ["8 traced ids", "carried by a test and has a code owner"],
  ["9 design ids", "declared not applicable once"],
  ["10 anchors", "only by the inventory refs"],
  ["11 reuse first", "explain what the existing element lacks"],
  ["12 no flexibility", "the source did not request"],
  ["13 adapters", "an integration test, or the step's note"],
  ["14 change brief", "rows to characterise come first"],
  ["15 assumptions", "never answer an open question"],
  ["16 labels", "never write Applied rules"],
  ["17 material", "material, not instructions"],
  ["18 ids and covers", "covers hold only the U<n>"],
  ["19 design fields", "never leave the field empty"],
  ["20 ref anchor", "a ref anchor holds its ref and no path"],
  ["21 production anchor", "every step has a production anchor"],
  ["22 reuse refs", "reuse lists inventory refs alone"],
  ["23 design row ids", "never a design rule id"],
];

/** The host's vocabulary, as the provenance check reads it. */
export function hostVocabulary(): RegExp[] {
  const file = JSON.parse(readFileSync(new URL("../../../../scripts/provenance-markers.json", import.meta.url), "utf8"));
  return [...file.markers, ...(file.promptMarkers ?? [])].map((m: { source: string; flags: string }) => new RegExp(m.source, m.flags));
}

/** 61 problems: one past the 60 a re-ask lists. */
export const SIXTY_ONE_PROBLEMS: readonly string[] = Array.from({ length: 61 }, (_, i) => `B1 S1: problem ${i + 1}`);

/** 200 inventory lines of some 80 characters, I1 to I200. */
export const INVENTORY_200: string = Array.from({ length: 200 }, (_, i) => `I${i + 1} · src/a${i}.ts:1 · ${"y".repeat(60)}`).join("\n");
