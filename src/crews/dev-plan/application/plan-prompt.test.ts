// The planner's prompt: each behaviour pinned by one marker, the design rules listed, the
// material after the instructions, the re-ask with its problems before the material, the
// cap and its cut order, and no host vocabulary. Run:
//   node --test src/crews/dev-plan/application/plan-prompt.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { DESIGN_RULE_IDS } from "../../../shared/domain/dev/design-rules.ts";
import { MAX_PLAN_PROMPT_CHARS, PLAN_INSTRUCTIONS, SOURCE_CHARS, buildPlanPrompt } from "./plan-prompt.ts";
import type { PlanPromptInput } from "./plan-prompt.ts";

const MARK = "seen.add(a);";
const INPUT: PlanPromptInput = {
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
const BRIEF: PlanPromptInput = {
  ...INPUT, sourceShown: "workbench/cache/CHANGE-cache.md", kind: "change", changeKind: "refactor",
  pinned: ["loads the cached map once"],
  unpinned: [{ key: "U1", behaviour: "an absent map file gives an empty map" }],
};

describe("PLAN_INSTRUCTIONS — one marker per behaviour", () => {
  const markers: Array<[string, string]> = [
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
  ];
  for (const [behaviour, marker] of markers) {
    it(behaviour, () => ok(PLAN_INSTRUCTIONS.toLowerCase().includes(marker.toLowerCase()), marker));
  }

  it("names no word of the host's vocabulary", () => {
    const file = JSON.parse(readFileSync(new URL("../../../../scripts/provenance-markers.json", import.meta.url), "utf8"));
    const markers = [...file.markers, ...(file.promptMarkers ?? [])].map((m: { source: string; flags: string }) => new RegExp(m.source, m.flags));
    for (const text of [buildPlanPrompt(INPUT, []), buildPlanPrompt(BRIEF, ["B1 S1: no test"])]) {
      for (const m of markers) ok(!m.test(text), `matches ${m}`);
    }
  });
});

describe("buildPlanPrompt", () => {
  it("starts with the instructions, then one line per design rule, then the material", () => {
    const text = buildPlanPrompt(INPUT, []);
    ok(text.startsWith(PLAN_INSTRUCTIONS));
    for (const id of DESIGN_RULE_IDS) ok(new RegExp(`^${id} — .+\\. Applies when .+\\. Records .+\\.$`, "m").test(text), id);
    const rules = text.indexOf("Design rules to classify");
    const source = text.indexOf("Source (spec): workbench/prune/SPEC-prune.md");
    ok(rules > PLAN_INSTRUCTIONS.length && source > rules);
    ok(text.indexOf(MARK) > source, "the source text is material");
    ok(text.includes("UC-01 — Prune old memory entries: the user removes old entries"));
    ok(text.includes("\nBR-01 — An entry older than the cut-off is removed\n"));
    ok(text.includes("Repository commands: build `npm run build`"));
    ok(text.includes("Inventory (anchor refs I<n>):\nI1 · src/shared/domain/memory.ts:18"));
    ok(!text.includes("Pinned tests:"), "a spec has no brief rows");
    ok(!text.includes("previous answer was refused"));
  });

  it("gives a brief its kind, its pinned tests and its rows to characterise", () => {
    const text = buildPlanPrompt(BRIEF, []);
    ok(text.includes("Source (change, refactor): workbench/cache/CHANGE-cache.md"));
    ok(text.includes("Pinned tests:\n- loads the cached map once"));
    ok(text.includes("Rows to characterise first:\nU1 — an absent map file gives an empty map"));
  });

  it("lists the problems of a re-ask before the material, 60 at most", () => {
    const problems = Array.from({ length: 61 }, (_, i) => `B1 S1: problem ${i + 1}`);
    const text = buildPlanPrompt(INPUT, problems);
    const asked = text.indexOf("Your previous answer was refused; fix each of these:");
    ok(asked > text.indexOf("Design rules to classify"));
    ok(asked < text.indexOf("Source (spec)"));
    ok(text.includes("- B1 S1: problem 60\n- … 1 more"));
    ok(!text.includes("problem 61"));
  });

  it("cuts the source text to SOURCE_CHARS, head kept", () => {
    const text = buildPlanPrompt({ ...INPUT, sourceText: `HEAD${"x".repeat(SOURCE_CHARS)}TAIL` }, []);
    ok(text.includes("HEAD") && !text.includes("TAIL"));
    ok(text.includes("[the rest of the source is cut]"));
  });

  it("over the cap, cuts the source first, then inventory lines from the end", () => {
    const inventory = Array.from({ length: 200 }, (_, i) => `I${i + 1} · src/a${i}.ts:1 · ${"y".repeat(60)}`).join("\n");
    const big = buildPlanPrompt({ ...INPUT, inventory: inventory.split("\n").slice(0, 150).join("\n"), sourceText: "s".repeat(SOURCE_CHARS) }, []);
    ok(big.length <= MAX_PLAN_PROMPT_CHARS, `${big.length}`);
    ok(big.includes("\nI150 · "), "the inventory is whole while the source can give way");
    const huge = buildPlanPrompt({ ...INPUT, inventory: `${inventory}\n${inventory.replace(/I(\d+)/g, "J$1")}`, sourceText: "s".repeat(SOURCE_CHARS) }, []);
    ok(huge.length <= MAX_PLAN_PROMPT_CHARS, `${huge.length}`);
    ok(huge.includes("\nI1 · ") && !huge.includes("J200 · "), "lines leave from the end");
    ok(!huge.includes("sss"), "the source went first");
  });

  it("stays the same text for the same input", () => {
    strictEqual(buildPlanPrompt(INPUT, []), buildPlanPrompt(INPUT, []));
  });
});
