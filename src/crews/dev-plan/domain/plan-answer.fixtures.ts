// The golden answers, their contexts and the case tables of the checkPlanAnswer tests: each case edits a copy of a
// golden answer and names the problems the check answers.
import { readFileSync } from "node:fs";

import type { AnchorRef, PlanAnswer, PlanCheckContext } from "./plan-answer.ts";
import { WORKSPACE } from "../../../shared/domain/dev/path-rebase.ts";

const FIXTURES = new URL("../../../../tests/fixtures/dev/plan/", import.meta.url);
const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), "utf8");
export const ANSWER: PlanAnswer = JSON.parse(fixture("answer.json"));
export const BRIEF_ANSWER: PlanAnswer = JSON.parse(fixture("answer-cache.json"));
const INVENTORY: { entries: Array<{ ref: string; path: string; name: string }> } = JSON.parse(fixture("inventory.json"));

export const CTX: PlanCheckContext = {
  sourceIds: ["UC-01", "BR-01", "BR-02", "BR-03"],
  shownRefs: new Set(INVENTORY.entries.map((e) => e.ref)),
  refPaths: new Map(INVENTORY.entries.map((e) => [e.ref, e.path])),
  refNames: new Map(INVENTORY.entries.map((e) => [e.ref, e.name])),
  kind: "spec",
  pinned: [],
  unpinned: [],
  workFolder: "workbench",
};
export const BRIEF_CTX: PlanCheckContext = {
  sourceIds: ["CH-01", "CH-02"], shownRefs: new Set(), refPaths: new Map(), refNames: new Map(), kind: "change", changeKind: "refactor",
  pinned: ["loads the cached map once"], unpinned: ["U1", "U2"], workFolder: "workbench",
};

/** The spec context, I1 named with a dotted name. */
const DOTTED_CTX: PlanCheckContext = { ...CTX, refNames: new Map([...CTX.refNames, ["I1", "MemoryEntry.age"]]) };

export const copy = <T>(value: T): T => structuredClone(value);

/** One edit of a golden answer and the problems the check answers for it. */
export interface RuleCase {
  name: string;
  edit: (a: PlanAnswer) => void;
  problems: string[];
  base?: PlanAnswer;
  ctx?: PlanCheckContext;
}

/** A copy of the case's golden answer (ANSWER by default), the case's edit applied. */
export function edited(c: Pick<RuleCase, "edit" | "base">): PlanAnswer {
  const a = copy(c.base ?? ANSWER);
  c.edit(a);
  return a;
}

/** The plan answer's schema, read as the tests read it. */
export type SchemaView = { required: string[]; properties: Record<string, { items?: { properties: Record<string, unknown> } }> };

export const TOP_LEVEL_FIELDS = ["feature", "layers", "reuse", "outOfScope", "assumptions", "nonApplicable", "traceability", "design", "batches"];

/** The golden answer with padded strings and a padded two-line note. */
export function paddedAnswer(): PlanAnswer {
  const a = copy(ANSWER);
  a.feature = "  Prune old memory entries ";
  a.batches[0].steps[0].tests[0].name = " removes the entries saved before the cut-off\t";
  a.batches[0].steps[0].note = " first line  \n second line ";
  return a;
}

export const SHAPE_CASES: readonly RuleCase[] = [
  { name: "names a missing field", problems: ["feature is missing or not a string"], edit: (a) => { delete (a as Partial<PlanAnswer>).feature; } },
  {
    name: "names a level outside the enum", problems: ["batches[0].steps[0].tests[0].level is missing or not one of unit, integration, pinned"],
    edit: (a) => { (a.batches[0].steps[0].tests[0] as { level: string }).level = "e2e"; },
  },
  { name: "names a design batch that is not an integer", problems: ["design[0].batch is missing or not an integer"], edit: (a) => { (a.design[0] as { batch: unknown }).batch = "1"; } },
  {
    name: "names an anchor kind outside the enum", problems: ["batches[1].steps[0].anchors.production[0].kind is missing or not one of ref, create, existing"],
    edit: (a) => { (a.batches[1].steps[0].anchors.production[0] as { kind: string }).kind = "file"; },
  },
];

export const CELL_CASES: readonly RuleCase[] = [
  {
    name: "refuses a backtick in a code cell: a test name", problems: ["B1 S1 T1: name holds a |, a backtick or a line break"],
    edit: (a) => { a.batches[0].steps[0].tests[0].name = "removes `old` entries"; },
  },
  {
    name: "refuses a backtick in a code cell: an owner", problems: ["plan: traceability[0].owners[0] holds a |, a backtick or a line break"],
    edit: (a) => { a.traceability[0].owners[0] = "`runMemory()`"; },
  },
  { name: "allows a backtick in a prose cell", problems: [], edit: (a) => { a.batches[0].intent = "`/memory prune` removes the old entries"; } },
  { name: "refuses a pipe in a prose cell", problems: ["B1: intent holds a | or a line break"], edit: (a) => { a.batches[0].intent = "removes | keeps"; } },
  { name: "refuses a line break in a prose cell", problems: ["B1: reason holds a | or a line break"], edit: (a) => { a.batches[0].reason = "one\ntwo"; } },
  { name: "lets a note hold one line break", problems: [], edit: (a) => { a.batches[0].steps[0].note = "one\ntwo"; } },
  { name: "refuses a note holding two line breaks", problems: ["B1 S1: note holds a | or a line break"], edit: (a) => { a.batches[0].steps[0].note = "one\ntwo\nthree"; } },
  {
    name: "refuses the capitalised label Applied rules in a decision", problems: ["B1: decisions[0] holds the label Applied rules or Non-applicable rules"],
    edit: (a) => { a.batches[0].decisions[0] = "Applied rules are those of the sheet"; },
  },
  {
    name: "refuses the capitalised label Non-applicable rules in a reason",
    problems: ["plan: nonApplicable[0].reason holds the label Applied rules or Non-applicable rules"],
    edit: (a) => { a.nonApplicable[0].reason = "listed under Non-applicable rules already"; },
  },
  { name: "never refuses the labels in lower case", problems: [], edit: (a) => { a.batches[0].decisions[0] = "the applied rules are those of the sheet"; } },
];

const extraStep = (n: number) => ({
  title: `Extra step ${n}`,
  tests: [{ name: `extra test ${n}`, level: "unit" as const, project: "tests", ids: ["BR-01"], covers: [] }],
  note: "",
  anchors: { tests: [{ kind: "create" as const, path: "src/shared/domain/memory-prune.test.ts" }], doubles: [], production: [{ kind: "create" as const, path: "src/shared/domain/memory-prune.ts" }] },
});

/** A batch count out of 1 to 8, and the problem the check answers among others. */
export const BATCH_COUNT_CASES: ReadonlyArray<{ name: string; edit: (a: PlanAnswer) => void; problem: string }> = [
  { name: "2: between 1 and 8 batches, not none", problem: "between 1 and 8 batches, not 0", edit: (a) => { a.batches = []; } },
  {
    name: "2: between 1 and 8 batches, not 9", problem: "between 1 and 8 batches, not 9",
    edit: (a) => { a.batches = Array.from({ length: 9 }, () => copy(ANSWER.batches[1])); },
  },
];

export const RULES_2_TO_7_CASES: readonly RuleCase[] = [
  { name: "3: a printed field is empty: the reason", problems: ["B1: reason is empty"], edit: (a) => { a.batches[0].reason = "  "; } },
  { name: "3: a printed field is empty: the design events", problems: ["B2: design.events is empty"], edit: (a) => { a.batches[1].design.events = ""; } },
  {
    name: "4: 2 to 5 behaviour steps, 1 to 5 for documentation", problems: ["B1: 6 behaviour steps; 2 to 5 (1 to 5 for documentation)"],
    edit: (a) => { a.batches[0].steps.push(extraStep(1), extraStep(2), extraStep(3)); },
  },
  { name: "5: a step title that repeats another", problems: ["B1 S2: the title repeats step 1"], edit: (a) => { a.batches[0].steps[1].title = a.batches[0].steps[0].title; } },
  { name: "5: a step title that is Build and tests", problems: ["B1 S1: the title is Build and tests, the step code adds"], edit: (a) => { a.batches[0].steps[0].title = "Build and tests"; } },
  { name: "5: a step title longer than 100 characters", problems: ["B1 S1: the title is longer than 100 characters"], edit: (a) => { a.batches[0].steps[0].title = "t".repeat(101); } },
  { name: "5: an empty step title", problems: ["B1 S1: the title is empty"], edit: (a) => { a.batches[0].steps[0].title = ""; } },
  { name: "6: a step without a test", problems: ["B1 S2: no test", "BR-02: no test carries it"], edit: (a) => { a.batches[0].steps[1].tests = []; } },
  { name: "6: a test name too long", problems: ["B1 S1 T1: the name is longer than 120 characters"], edit: (a) => { a.batches[0].steps[0].tests[0].name = "n".repeat(121); } },
  {
    name: "6: a test name repeated", problems: ["B1 S1 T2: the name repeats B1 S1 T1"],
    edit: (a) => { a.batches[0].steps[0].tests[1].name = a.batches[0].steps[0].tests[0].name; },
  },
  { name: "7: a test's ids belong to the source", problems: ["B1 S1 T2: BR-09 is not an id of the source"], edit: (a) => { a.batches[0].steps[0].tests[1].ids.push("BR-09"); } },
  { name: "7: a test names one id", problems: ["B1 S1 T2: names no id"], edit: (a) => { a.batches[0].steps[0].tests[1].ids = []; } },
];

export const RULES_8_TO_12_CASES: readonly RuleCase[] = [
  { name: "8: every source id carried by a test", problems: ["BR-03: no test carries it"], edit: (a) => { a.batches[0].steps[2].tests[0].ids = ["UC-01"]; } },
  { name: "9: every source id owned: a row missing", problems: ["BR-03: no code owner"], edit: (a) => { a.traceability.pop(); } },
  { name: "9: every source id owned: a row without owner", problems: ["BR-03: no code owner"], edit: (a) => { a.traceability[3].owners = []; } },
  { name: "9: only source ids are owned", problems: ["traceability: BR-09 is not an id of the source"], edit: (a) => { a.traceability.push({ id: "BR-09", owners: ["x()"] }); } },
  { name: "9: every source id owned once", problems: ["traceability: BR-01 appears twice"], edit: (a) => { a.traceability.push({ id: "BR-01", owners: ["x()"] }); } },
  { name: "10: a design id neither applied nor not applicable", problems: ["DDD-04: neither applied nor non-applicable"], edit: (a) => { a.nonApplicable.shift(); } },
  {
    name: "10: a design id applied and not applicable", problems: ["DDD-01: applied and non-applicable"],
    edit: (a) => { a.nonApplicable.push({ id: "DDD-01", reason: "a reason long enough" }); },
  },
  { name: "10: a design id not applicable without a reason", problems: ["DDD-05: N/A without a reason"], edit: (a) => { a.nonApplicable[1].reason = "short"; } },
  { name: "10: a rule applied by two batches is fine", problems: [], edit: (a) => { a.batches[1].design.appliedRules = ["DDD-01"]; } },
  { name: "11: applied rules are design rule ids", problems: ["B1: DDD-99 is not a design rule id"], edit: (a) => { a.batches[0].design.appliedRules.push("DDD-99"); } },
  { name: "12: a batch depends on earlier batches only", problems: ["B2: depends on F2, which is not an earlier batch"], edit: (a) => { a.batches[1].dependsOn = ["F2"]; } },
  {
    name: "12: a batch depends on batches named F<n> only", problems: ["B2: depends on batch 1, which is not an earlier batch"],
    edit: (a) => { a.batches[1].dependsOn = ["batch 1"]; },
  },
];

/** Adds a third batch, a copy of the first with its tests renamed, depending on `dependsOn`. */
const third = (dependsOn: string[]) => (a: PlanAnswer): void => {
  const b = copy(a.batches[0]);
  b.dependsOn = dependsOn;
  b.steps.forEach((s) => s.tests.forEach((t) => { t.name = `${t.name} again`; }));
  a.batches.push(b);
};

/** Adds the same third batch, depending on nothing, its production paths spelt with a leading ./. */
const thirdDotted = (a: PlanAnswer): void => {
  const b = copy(a.batches[0]);
  b.dependsOn = [];
  b.steps.forEach((s) => s.tests.forEach((t) => { t.name = `${t.name} again`; }));
  for (const s of b.steps) for (const x of s.anchors.production) if (x.path !== undefined) x.path = `./${x.path}`;
  a.batches.push(b);
};

const UNREACHABLE_PATHS = [".claude/x.ts", ".orkeon/x.ts", "workbench/prune/x.ts", `${WORKSPACE}/src/x.ts`, "src/../x.ts"];
const SPELT_PATHS = [["./.claude/hooks/x.sh", ".claude/hooks/x.sh"], [".//workbench/prune/x.ts", "workbench/prune/x.ts"], ["src/./../x.ts", "src/../x.ts"]];

export const ANCHOR_CASES: readonly RuleCase[] = [
  { name: "13: a ref anchor names a shown entry", problems: ["B1 S3: anchor I9 is not an inventory entry shown"], edit: (a) => { a.batches[0].steps[2].anchors.tests[0].ref = "I9"; } },
  { name: "13: a ref anchor names nothing else", problems: ["B1 S3: a ref anchor needs a ref only"], edit: (a) => { a.batches[0].steps[2].anchors.tests[0].path = "tests/x.test.ts"; } },
  { name: "13: a create anchor names a path only", problems: ["B1 S1: a create anchor needs a path only"], edit: (a) => { a.batches[0].steps[0].anchors.tests[0] = { kind: "create", ref: "I1" }; } },
  { name: "13: an existing anchor names a path", problems: ["B2 S1: an existing anchor needs a path only"], edit: (a) => { delete a.batches[1].steps[0].anchors.production[0].path; } },
  ...UNREACHABLE_PATHS.map((path): RuleCase => ({
    name: `14: a path outside the reach of a plan: ${path}`, problems: [`B1 S1: ${path} cannot be anchored there`],
    edit: (a) => { a.batches[0].steps[0].anchors.production[0].path = path; },
  })),
  { name: "15: a test anchor per step", problems: ["B1 S1: no test anchor"], edit: (a) => { a.batches[0].steps[0].anchors.tests = []; } },
  { name: "15: a production anchor per step, a documentation batch needing no test anchor", problems: ["B2 S1: no production anchor"], edit: (a) => { a.batches[1].steps[0].anchors.production = []; } },
  {
    name: "16: documentation and code never share a batch: documentation in a code batch", problems: ["B1: documentation and code in one batch"],
    edit: (a) => { a.batches[0].steps[0].anchors.production.push({ kind: "existing", path: "README.md" }); },
  },
  {
    name: "16: documentation and code never share a batch: code in a documentation batch", problems: ["B2: documentation and code in one batch"],
    edit: (a) => { a.batches[1].steps[0].anchors.production.push({ kind: "create", path: "src/x.ts" }); },
  },
  { name: "17: two batches sharing a path and not ordered", problems: ["B1 and B3 share src/commands/_lib/memory.ts and neither depends on the other"], edit: third([]) },
  { name: "17: two batches sharing a path, ordered directly", problems: [], edit: third(["F1"]) },
  { name: "17: two batches sharing a path, ordered through others", problems: [], edit: third(["F2"]) },
  ...SPELT_PATHS.map(([path, shown]): RuleCase => ({
    name: `checks a path spelt with ./, a doubled / or a \\ as the path it names: ${path}`, problems: [`B1 S1: ${shown} cannot be anchored there`],
    edit: (a) => { a.batches[0].steps[0].anchors.production[0] = { kind: "create", path }; },
  })),
  {
    name: "checks a path spelt with a \\ as the path it names", problems: ["B1 S1: src\\x.ts cannot be anchored there"],
    edit: (a) => { a.batches[0].steps[0].anchors.production[0].path = "src\\x.ts"; },
  },
  {
    name: "checks an existing path spelt with ./ and a doubled / against the inventory", problems: ["B1 S2: src/shared/domain/memory.ts is in the inventory: use its ref"],
    edit: (a) => { a.batches[0].steps[1].anchors.production.push({ kind: "existing", path: "./src//shared/domain/memory.ts" }); },
  },
  {
    name: "checks shared paths spelt with ./ as the paths they name", problems: ["B1 and B3 share src/commands/_lib/memory.ts and neither depends on the other"],
    edit: thirdDotted,
  },
  {
    name: "26: an existing anchor on a file the inventory holds", problems: ["B1 S2: src/shared/domain/memory.ts is in the inventory: use its ref"],
    edit: (a) => { a.batches[0].steps[1].anchors.production.push({ kind: "existing", path: "src/shared/domain/memory.ts" }); },
  },
];

export const RULES_18_TO_24_CASES: readonly RuleCase[] = [
  { name: "18: reuse names shown entries", problems: ["reuse: I9 is not an inventory entry shown"], edit: (a) => { a.reuse.push("I9"); } },
  { name: "19: a design row names a batch of the plan", problems: ["design row 1: batch 3 is not a batch of the plan"], edit: (a) => { a.design[0].batch = 3; } },
  { name: "19: a design row names ids of the source", problems: ["design row 1: BR-09 is not an id of the source"], edit: (a) => { a.design[0].ids.push("BR-09"); } },
  { name: "20: a code batch has an element", problems: ["B1: no code element"], edit: (a) => { a.batches[0].elements = []; } },
  { name: "20: a signature is at most 200 characters", problems: ["B1: element 2 is longer than 200 characters"], edit: (a) => { a.batches[0].elements[1].signature = "S".repeat(201); } },
  { name: "21: a signature holds no body", problems: ["B1: element 2 holds a body"], edit: (a) => { a.batches[0].elements[1].signature = "PruneResult { kept }"; } },
  { name: "24: the feature is not empty", problems: ["feature is empty"], edit: (a) => { a.feature = " "; } },
  { name: "24: the feature is at most 80 characters", problems: ["feature is longer than 80 characters"], edit: (a) => { a.feature = "f".repeat(81); } },
  { name: "24: the layers are not empty", problems: ["layers is empty"], edit: (a) => { a.layers = []; } },
];

export const BRIEF_CASES: readonly RuleCase[] = [
  {
    name: "22: every pinned behaviour keeps its pinned test", problems: ["pinned test loads the cached map once is not in the plan"],
    edit: (a) => { a.batches[0].steps[0].tests[0].level = "unit"; }, base: BRIEF_ANSWER, ctx: BRIEF_CTX,
  },
  {
    name: "23: every unpinned row has a characterisation test", problems: ["U2: no characterisation test"],
    edit: (a) => { a.batches[0].steps[0].tests.pop(); }, base: BRIEF_ANSWER, ctx: BRIEF_CTX,
  },
  {
    name: "23: every unpinned row has its characterisation test in the first step", problems: ["U1: its test is not in the first step"],
    edit: (a) => {
      const moved = a.batches[0].steps[0].tests.splice(1, 1);
      a.batches[0].steps[1].tests.push(...moved);
    },
    base: BRIEF_ANSWER, ctx: BRIEF_CTX,
  },
  {
    name: "covers names an unpinned row only", problems: ["B1 S1 T2: U7 is not an unpinned row"],
    edit: (a) => { a.batches[0].steps[0].tests[1].covers.push("U7"); }, base: BRIEF_ANSWER, ctx: BRIEF_CTX,
  },
  { name: "a spec context has no pinned rule to apply", problems: [], edit: () => undefined },
];

/** The golden answer, the source id of its first test moved from ids to covers; the id moved. */
export function answerWithIdInCovers(): { answer: PlanAnswer; id: string } {
  const answer = copy(ANSWER);
  const t = answer.batches[0].steps[0].tests[0];
  const id = t.ids[0];
  t.ids = [];
  t.covers = [id];
  return { answer, id };
}

type Column = "tests" | "doubles" | "production";

/** Where the first ref anchor without member of the first batch sits; throws when the golden answer holds none. */
function refAnchorWithoutMember(a: PlanAnswer): { j: number; column: Column; i: number } {
  const [j, column, i] = a.batches[0].steps.flatMap((s, j) => (["tests", "doubles", "production"] as const)
    .flatMap((c) => s.anchors[c].map((x: AnchorRef, i) => [j, c, i, x] as const)))
    .find(([, , , x]) => x.kind === "ref" && x.member === undefined) ?? [];
  if (j === undefined || column === undefined || i === undefined) throw new Error("the golden answer holds a ref anchor without member");
  return { j, column, i };
}

/** The golden answer, a ref anchor given its ref's own path and a reuse entry given words after its ref. */
export function answerWithRefPathAndWordyReuse(): { answer: PlanAnswer; j: number; column: Column; i: number; ref: string } {
  const answer = copy(ANSWER);
  const { j, column, i } = refAnchorWithoutMember(answer);
  const anchor = answer.batches[0].steps[j].anchors[column][i];
  const ref = anchor.ref as string;
  anchor.path = CTX.refPaths.get(ref);
  answer.reuse.push(`${ref} class Something`);
  return { answer, j, column, i, ref };
}

/** 61 ids out of the source on the first test. */
export const SIXTY_ONE_UNKNOWN_IDS = (a: PlanAnswer): void => {
  a.batches[0].steps[0].tests[0].ids = Array.from({ length: 61 }, (_, i) => `BR-${100 + i}`);
};

const head = "starts a line with one of #, TDD:, |, - [, >";

export const FIX_PASS_CASES: readonly RuleCase[] = [
  { name: "refuses a note line that starts with #", problems: [`B1 S1: note ${head}`], edit: (a) => { a.batches[0].steps[0].note = "first line\n### Step 9 — sneaked in"; } },
  { name: "refuses a note that starts with TDD:", problems: [`B1 S1: note ${head}`], edit: (a) => { a.batches[0].steps[0].note = "TDD: RED [x] GREEN [x] COST [x]"; } },
  { name: "refuses a decision that starts with - [", problems: [`B1: decisions[0] ${head}`], edit: (a) => { a.batches[0].decisions[0] = "- [ ] a box of our own"; } },
  { name: "refuses an intent that starts with >", problems: [`B1: intent ${head}`], edit: (a) => { a.batches[0].intent = "> a quote"; } },
  { name: "refuses an assumption that starts with #", problems: [`plan: assumptions[0] ${head}`], edit: (a) => { a.assumptions = ["# a heading"]; } },
  { name: "accepts # and TDD: inside a line", problems: [], edit: (a) => { a.batches[0].steps[0].note = "the C# client stays; a TDD: prefix inside a line is fine"; } },
  {
    name: "refuses a create anchor path that holds a colon", problems: ['B1 S1: anchor path "src/shared/domain/memory-prune.ts:12" holds ":"'],
    edit: (a) => { a.batches[0].steps[0].anchors.production[0] = { kind: "create", path: "src/shared/domain/memory-prune.ts:12" }; },
  },
  {
    name: "refuses an existing anchor path that holds a colon", problems: ['B2 S1: anchor path "docs/commands.md:3" holds ":"'],
    edit: (a) => { a.batches[1].steps[0].anchors.production[0] = { kind: "existing", path: "docs/commands.md:3" }; },
  },
  {
    name: "refuses a traceability owner that is a path:line", problems: ['traceability: owner "src/commands/_lib/memory.ts:40" is a path, name the type or member'],
    edit: (a) => { a.traceability[0].owners[0] = "src/commands/_lib/memory.ts:40"; },
  },
  {
    name: "refuses a traceability owner that is a path", problems: ['traceability: owner "memory/prune" is a path, name the type or member'],
    edit: (a) => { a.traceability[1].owners[0] = "memory/prune"; },
  },
  { name: "keeps a traceability owner that is a member name", problems: [], edit: (a) => { a.traceability[0].owners[0] = "MemoryStore.prune()"; } },
  {
    name: "refuses a production ref anchor's member that is not the entry's name",
    problems: ['B1 S2: anchor I1: member "pruneBefore" is not MemoryEntry; leave member out to add a member to it'],
    edit: (a) => { a.batches[0].steps[1].anchors.production[1] = { kind: "ref", ref: "I1", member: "pruneBefore" }; },
  },
  { name: "accepts a production ref anchor's member that is the entry's name", problems: [], edit: (a) => { a.batches[0].steps[1].anchors.production[1] = { kind: "ref", ref: "I1", member: "MemoryEntry" }; } },
  {
    name: "accepts a production ref anchor's member that is the last dotted segment of the entry's name", problems: [], ctx: DOTTED_CTX,
    edit: (a) => { a.batches[0].steps[1].anchors.production[1] = { kind: "ref", ref: "I1", member: "age" }; },
  },
  {
    name: "accepts a production ref anchor's member that is the entry's dotted name", problems: [], ctx: DOTTED_CTX,
    edit: (a) => { a.batches[0].steps[1].anchors.production[1] = { kind: "ref", ref: "I1", member: "MemoryEntry.age" }; },
  },
  {
    name: "never compares the member of a doubles ref anchor: it names a member to add", problems: [],
    edit: (a) => { a.batches[0].steps[2].anchors.doubles[0] = { kind: "ref", ref: "I4", member: "prunes" }; },
  },
];
