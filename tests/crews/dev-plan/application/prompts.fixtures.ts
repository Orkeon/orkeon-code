// The planner inputs, the instruction markers and the host vocabulary the dev-plan prompts tests read.
import { readFileSync } from "node:fs";

import type { PlanPromptInput } from "../../../../src/crews/dev-plan/application/prompts.ts";
import { DESIGN_RULES } from "../../../../src/shared/domain/dev/design-rules.ts";
import type { DesignRule } from "../../../../src/shared/domain/dev/design-rules.ts";

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
  ["23 design row ids", "never a design rule id"],
  ["24 a code file the inventory does not show", "existing only when the source names its path"],
  ["25 a documentation step's test", "named by the repository's documentation command (else its test command) followed by what the step documents"],
  ["25 two documentation tests never share a name", "so two documentation steps never share a name"],
];

/** Each behaviour the head of the design-rules block states and the words that pin it. */
export const RULES_HEAD_MARKERS: ReadonlyArray<[string, string]> = [
  ["sets a rule aside when its condition is not met, the condition as the reason", "is set aside in nonApplicable with that condition as its reason"],
  ["never adds an element to apply a rule", "applying a rule is never a reason to add an element"],
];

const ruleOf = (id: string): DesignRule => DESIGN_RULES.find((r) => r.id === id) as DesignRule;

export interface RuleCloseCase { name: string; rule: DesignRule; close: string }

/** A rule set aside under a condition, and one that never is: how each line closes. */
export const RULE_CLOSE_CASES: readonly RuleCloseCase[] = [
  { name: "closes a rule's line on the condition that sets it aside", rule: ruleOf("DDD-02"),
    close: `, not when ${ruleOf("DDD-02").notApplicableWhen}.` },
  { name: "closes the line of a rule with no such condition by saying it applies to every change it names",
    rule: ruleOf("DDD-01"), close: "; it applies to every change it names." },
];

/** The block of design rules a prompt holds: from its head to the last rule line. */
export function rulesBlockOf(text: string): string {
  const start = text.indexOf("Design rules to classify");
  const end = text.indexOf("\n", text.indexOf("\nPERF-01 — ") + 1);
  return text.slice(start, end);
}

/** The host's vocabulary, as the provenance check reads it. */
export function hostVocabulary(): RegExp[] {
  const file = JSON.parse(readFileSync(new URL("../../../../scripts/provenance-markers.json", import.meta.url), "utf8"));
  return [...file.markers, ...(file.promptMarkers ?? [])].map((m: { source: string; flags: string }) => new RegExp(m.source, m.flags));
}

/** 61 problems: one past the 60 a re-ask lists. */
export const SIXTY_ONE_PROBLEMS: readonly string[] = Array.from({ length: 61 }, (_, i) => `B1 S1: problem ${i + 1}`);

/** 200 inventory lines of some 80 characters, I1 to I200. */
export const INVENTORY_200: string = Array.from({ length: 200 }, (_, i) => `I${i + 1} · src/a${i}.ts:1 · ${"y".repeat(60)}`).join("\n");
