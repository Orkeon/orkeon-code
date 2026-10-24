// Unit tests for the planner's answer check: the golden answer passes, and each rule of the
// check fails alone with its own text. Run:
//   node --test src/crews/dev-plan/domain/plan-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { MAX_BATCHES, PLAN_ANSWER_SCHEMA, checkPlanAnswer } from "./plan-answer.ts";
import type { PlanAnswer, PlanCheckContext } from "./plan-answer.ts";
import { DESIGN_RULE_IDS } from "../../../shared/domain/dev/design-rules.ts";

const FIXTURES = new URL("../../../../tests/fixtures/dev/plan/", import.meta.url);
const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), "utf8");
const ANSWER: PlanAnswer = JSON.parse(fixture("answer.json"));
const BRIEF_ANSWER: PlanAnswer = JSON.parse(fixture("answer-cache.json"));
const INVENTORY: { entries: Array<{ ref: string; path: string; name: string }> } = JSON.parse(fixture("inventory.json"));

const CTX: PlanCheckContext = {
  sourceIds: ["UC-01", "BR-01", "BR-02", "BR-03"],
  shownRefs: new Set(INVENTORY.entries.map((e) => e.ref)),
  refPaths: new Map(INVENTORY.entries.map((e) => [e.ref, e.path])),
  refNames: new Map(INVENTORY.entries.map((e) => [e.ref, e.name])),
  kind: "spec",
  pinned: [],
  unpinned: [],
  workFolder: "workbench",
};
const BRIEF_CTX: PlanCheckContext = {
  sourceIds: ["CH-01", "CH-02"], shownRefs: new Set(), refPaths: new Map(), refNames: new Map(), kind: "change", changeKind: "refactor",
  pinned: ["loads the cached map once"], unpinned: ["U1", "U2"], workFolder: "workbench",
};

const copy = <T>(value: T): T => structuredClone(value);

function problemsOf(edit: (a: PlanAnswer) => void, base: PlanAnswer = ANSWER, ctx: PlanCheckContext = CTX): string[] {
  const a = copy(base);
  edit(a);
  const r = checkPlanAnswer(a, ctx);
  return r.ok ? [] : r.problems;
}

function failsWith(expected: string[], edit: (a: PlanAnswer) => void, base?: PlanAnswer, ctx?: PlanCheckContext): void {
  deepStrictEqual(problemsOf(edit, base, ctx), expected);
}

describe("checkPlanAnswer on the golden answers", () => {
  it("accepts answer.json (the plan of § 3)", () => {
    const r = checkPlanAnswer(copy(ANSWER), CTX);
    deepStrictEqual(r.ok ? [] : r.problems, []);
  });
  it("accepts answer-cache.json against the refactor brief", () => {
    const r = checkPlanAnswer(copy(BRIEF_ANSWER), BRIEF_CTX);
    deepStrictEqual(r.ok ? [] : r.problems, []);
  });
  it("trims every string and keeps a note's one line break", () => {
    const a = copy(ANSWER);
    a.feature = "  Prune old memory entries ";
    a.batches[0].steps[0].tests[0].name = " removes the entries saved before the cut-off\t";
    a.batches[0].steps[0].note = " first line  \n second line ";
    const r = checkPlanAnswer(a, CTX);
    if (!r.ok) throw new Error(r.problems.join("\n"));
    strictEqual(r.value.feature, "Prune old memory entries");
    strictEqual(r.value.batches[0].steps[0].tests[0].name, "removes the entries saved before the cut-off");
    strictEqual(r.value.batches[0].steps[0].note, "first line\n second line");
  });
});

describe("PLAN_ANSWER_SCHEMA", () => {
  const schema = PLAN_ANSWER_SCHEMA as { required: string[]; properties: Record<string, { items?: { properties: Record<string, unknown> } }> };
  it("requires every top-level field", () => {
    deepStrictEqual(schema.required, ["feature", "layers", "reuse", "outOfScope", "assumptions", "nonApplicable", "traceability", "design", "batches"]);
  });
  it("enumerates the design rule ids for a non-applicable row and the three anchor kinds", () => {
    const na = schema.properties.nonApplicable.items?.properties.id as { enum: string[] };
    deepStrictEqual(na.enum, [...DESIGN_RULE_IDS]);
    const text = JSON.stringify(PLAN_ANSWER_SCHEMA);
    ok(text.includes('"enum":["ref","create","existing"]'));
    ok(text.includes('"required":["kind"]'));
  });
});

describe("rule 1: the shape", () => {
  it("refuses a value that is not an object", () => {
    deepStrictEqual(checkPlanAnswer([], CTX), { ok: false, problems: ["the answer is not an object"] });
  });
  it("names a missing field and a level outside the enum", () => {
    failsWith(["feature is missing or not a string"], (a) => { delete (a as Partial<PlanAnswer>).feature; });
    failsWith(["batches[0].steps[0].tests[0].level is missing or not one of unit, integration, pinned"],
      (a) => { (a.batches[0].steps[0].tests[0] as { level: string }).level = "e2e"; });
    failsWith(["design[0].batch is missing or not an integer"], (a) => { (a.design[0] as { batch: unknown }).batch = "1"; });
    failsWith(["batches[1].steps[0].anchors.production[0].kind is missing or not one of ref, create, existing"],
      (a) => { (a.batches[1].steps[0].anchors.production[0] as { kind: string }).kind = "file"; });
  });
});

describe("cell kinds and labels", () => {
  it("refuses a backtick in a code cell and allows it in a prose cell", () => {
    failsWith(["B1 S1 T1: name holds a |, a backtick or a line break"],
      (a) => { a.batches[0].steps[0].tests[0].name = "removes `old` entries"; });
    failsWith(["plan: traceability[0].owners[0] holds a |, a backtick or a line break"],
      (a) => { a.traceability[0].owners[0] = "`runMemory()`"; });
    failsWith([], (a) => { a.batches[0].intent = "`/memory prune` removes the old entries"; });
  });
  it("refuses a pipe or a line break in a prose cell", () => {
    failsWith(["B1: intent holds a | or a line break"], (a) => { a.batches[0].intent = "removes | keeps"; });
    failsWith(["B1: reason holds a | or a line break"], (a) => { a.batches[0].reason = "one\ntwo"; });
  });
  it("lets a note hold one line break, not two", () => {
    failsWith([], (a) => { a.batches[0].steps[0].note = "one\ntwo"; });
    failsWith(["B1 S1: note holds a | or a line break"], (a) => { a.batches[0].steps[0].note = "one\ntwo\nthree"; });
  });
  it("refuses the capitalised classification labels in any string, never their lower case", () => {
    failsWith(["B1: decisions[0] holds the label Applied rules or Non-applicable rules"],
      (a) => { a.batches[0].decisions[0] = "Applied rules are those of the sheet"; });
    failsWith(["plan: nonApplicable[0].reason holds the label Applied rules or Non-applicable rules"],
      (a) => { a.nonApplicable[0].reason = "listed under Non-applicable rules already"; });
    failsWith([], (a) => { a.batches[0].decisions[0] = "the applied rules are those of the sheet"; });
  });
});

const extraStep = (n: number) => ({
  title: `Extra step ${n}`,
  tests: [{ name: `extra test ${n}`, level: "unit" as const, project: "tests", ids: ["BR-01"], covers: [] }],
  note: "",
  anchors: { tests: [{ kind: "create" as const, path: "src/shared/domain/memory-prune.test.ts" }], doubles: [], production: [{ kind: "create" as const, path: "src/shared/domain/memory-prune.ts" }] },
});

describe("rules 2 to 7: batches, steps and tests", () => {
  it("2: between 1 and 8 batches", () => {
    strictEqual(MAX_BATCHES, 8);
    ok(problemsOf((a) => { a.batches = []; }).includes("between 1 and 8 batches, not 0"));
    ok(problemsOf((a) => { a.batches = Array.from({ length: 9 }, () => copy(ANSWER.batches[1])); }).includes("between 1 and 8 batches, not 9"));
  });
  it("3: a printed field is empty", () => {
    failsWith(["B1: reason is empty"], (a) => { a.batches[0].reason = "  "; });
    failsWith(["B2: design.events is empty"], (a) => { a.batches[1].design.events = ""; });
  });
  it("4: 2 to 5 behaviour steps, 1 to 5 for documentation", () => {
    failsWith(["B1: 6 behaviour steps; 2 to 5 (1 to 5 for documentation)"],
      (a) => { a.batches[0].steps.push(extraStep(1), extraStep(2), extraStep(3)); });
  });
  it("5: a step title", () => {
    failsWith(["B1 S2: the title repeats step 1"], (a) => { a.batches[0].steps[1].title = a.batches[0].steps[0].title; });
    failsWith(["B1 S1: the title is Build and tests, the step code adds"], (a) => { a.batches[0].steps[0].title = "Build and tests"; });
    failsWith(["B1 S1: the title is longer than 100 characters"], (a) => { a.batches[0].steps[0].title = "t".repeat(101); });
    failsWith(["B1 S1: the title is empty"], (a) => { a.batches[0].steps[0].title = ""; });
  });
  it("6: a step without a test, a test name too long or repeated", () => {
    deepStrictEqual(problemsOf((a) => { a.batches[0].steps[1].tests = []; }), ["B1 S2: no test", "BR-02: no test carries it"]);
    failsWith(["B1 S1 T1: the name is longer than 120 characters"], (a) => { a.batches[0].steps[0].tests[0].name = "n".repeat(121); });
    failsWith(["B1 S1 T2: the name repeats B1 S1 T1"], (a) => { a.batches[0].steps[0].tests[1].name = a.batches[0].steps[0].tests[0].name; });
  });
  it("7: a test's ids belong to the source, and a test names one", () => {
    failsWith(["B1 S1 T2: BR-09 is not an id of the source"], (a) => { a.batches[0].steps[0].tests[1].ids.push("BR-09"); });
    failsWith(["B1 S1 T2: names no id"], (a) => { a.batches[0].steps[0].tests[1].ids = []; });
  });
});

describe("rules 8 to 12: ids, owners, design rules, dependencies", () => {
  it("8: every source id carried by a test", () => {
    failsWith(["BR-03: no test carries it"], (a) => { a.batches[0].steps[2].tests[0].ids = ["UC-01"]; });
  });
  it("9: every source id owned once, and only source ids", () => {
    failsWith(["BR-03: no code owner"], (a) => { a.traceability.pop(); });
    failsWith(["BR-03: no code owner"], (a) => { a.traceability[3].owners = []; });
    failsWith(["traceability: BR-09 is not an id of the source"], (a) => { a.traceability.push({ id: "BR-09", owners: ["x()"] }); });
    failsWith(["traceability: BR-01 appears twice"], (a) => { a.traceability.push({ id: "BR-01", owners: ["x()"] }); });
  });
  it("10: every design id applied or not applicable with a reason, never both", () => {
    failsWith(["DDD-04: neither applied nor non-applicable"], (a) => { a.nonApplicable.shift(); });
    failsWith(["DDD-01: applied and non-applicable"], (a) => { a.nonApplicable.push({ id: "DDD-01", reason: "a reason long enough" }); });
    failsWith(["DDD-05: N/A without a reason"], (a) => { a.nonApplicable[1].reason = "short"; });
  });
  it("10: a rule applied by two batches is fine", () => {
    failsWith([], (a) => { a.batches[1].design.appliedRules = ["DDD-01"]; });
  });
  it("11: applied rules are design rule ids", () => {
    failsWith(["B1: DDD-99 is not a design rule id"], (a) => { a.batches[0].design.appliedRules.push("DDD-99"); });
  });
  it("12: a batch depends on earlier batches only", () => {
    failsWith(["B2: depends on F2, which is not an earlier batch"], (a) => { a.batches[1].dependsOn = ["F2"]; });
    failsWith(["B2: depends on batch 1, which is not an earlier batch"], (a) => { a.batches[1].dependsOn = ["batch 1"]; });
  });
});

describe("rules 13 to 17 and 26: anchors", () => {
  it("13: a ref anchor names a shown entry and nothing else; a path anchor names a path only", () => {
    failsWith(["B1 S3: anchor I9 is not an inventory entry shown"], (a) => { a.batches[0].steps[2].anchors.tests[0].ref = "I9"; });
    failsWith(["B1 S3: a ref anchor needs a ref only"], (a) => { a.batches[0].steps[2].anchors.tests[0].path = "tests/x.test.ts"; });
    failsWith(["B1 S1: a create anchor needs a path only"], (a) => { a.batches[0].steps[0].anchors.tests[0] = { kind: "create", ref: "I1" }; });
    failsWith(["B2 S1: an existing anchor needs a path only"], (a) => { delete a.batches[1].steps[0].anchors.production[0].path; });
  });
  it("14: a path outside the reach of a plan", () => {
    for (const path of [".claude/x.ts", ".orkeon/x.ts", "workbench/prune/x.ts", "/workspace/src/x.ts", "src/../x.ts"]) {
      failsWith([`B1 S1: ${path} cannot be anchored there`], (a) => { a.batches[0].steps[0].anchors.production[0].path = path; });
    }
  });
  it("15: a test anchor and a production anchor per step; a documentation batch needs no test anchor", () => {
    failsWith(["B1 S1: no test anchor"], (a) => { a.batches[0].steps[0].anchors.tests = []; });
    failsWith(["B2 S1: no production anchor"], (a) => { a.batches[1].steps[0].anchors.production = []; });
  });
  it("16: documentation and code never share a batch", () => {
    failsWith(["B1: documentation and code in one batch"],
      (a) => { a.batches[0].steps[0].anchors.production.push({ kind: "existing", path: "README.md" }); });
    failsWith(["B2: documentation and code in one batch"],
      (a) => { a.batches[1].steps[0].anchors.production.push({ kind: "create", path: "src/x.ts" }); });
  });
  it("17: two batches sharing a path are ordered, directly or through others", () => {
    const third = (dependsOn: string[]) => (a: PlanAnswer): void => {
      const b = copy(a.batches[0]);
      b.dependsOn = dependsOn;
      b.steps.forEach((s) => s.tests.forEach((t) => { t.name = `${t.name} again`; }));
      a.batches.push(b);
    };
    failsWith(["B1 and B3 share src/commands/_lib/memory.ts and neither depends on the other"], third([]));
    failsWith([], third(["F1"]));
    failsWith([], third(["F2"]));
  });
  it("26: an existing anchor on a file the inventory holds", () => {
    failsWith(["B1 S2: src/shared/domain/memory.ts is in the inventory: use its ref"],
      (a) => { a.batches[0].steps[1].anchors.production.push({ kind: "existing", path: "src/shared/domain/memory.ts" }); });
  });
});

describe("rules 18 to 21 and 24: reuse, design rows, elements, feature", () => {
  it("18: reuse names shown entries", () => {
    failsWith(["reuse: I9 is not an inventory entry shown"], (a) => { a.reuse.push("I9"); });
  });
  it("19: a design row names a batch of the plan and ids of the source", () => {
    failsWith(["design row 1: batch 3 is not a batch of the plan"], (a) => { a.design[0].batch = 3; });
    failsWith(["design row 1: BR-09 is not an id of the source"], (a) => { a.design[0].ids.push("BR-09"); });
  });
  it("20: a code batch has an element; a signature is at most 200 characters", () => {
    failsWith(["B1: no code element"], (a) => { a.batches[0].elements = []; });
    failsWith(["B1: element 2 is longer than 200 characters"], (a) => { a.batches[0].elements[1].signature = "S".repeat(201); });
  });
  it("21: a signature holds no body", () => {
    failsWith(["B1: element 2 holds a body"], (a) => { a.batches[0].elements[1].signature = "PruneResult { kept }"; });
  });
  it("24: the feature and the layers", () => {
    failsWith(["feature is empty"], (a) => { a.feature = " "; });
    failsWith(["feature is longer than 80 characters"], (a) => { a.feature = "f".repeat(81); });
    failsWith(["layers is empty"], (a) => { a.layers = []; });
  });
});

describe("rules 22 and 23: a change brief", () => {
  it("22: every pinned behaviour keeps its pinned test", () => {
    failsWith(["pinned test loads the cached map once is not in the plan"],
      (a) => { a.batches[0].steps[0].tests[0].level = "unit"; }, BRIEF_ANSWER, BRIEF_CTX);
  });
  it("23: every unpinned row has a characterisation test in the first step", () => {
    failsWith(["U2: no characterisation test"],
      (a) => { a.batches[0].steps[0].tests.pop(); }, BRIEF_ANSWER, BRIEF_CTX);
    failsWith(["U1: its test is not in the first step"], (a) => {
      const moved = a.batches[0].steps[0].tests.splice(1, 1);
      a.batches[0].steps[1].tests.push(...moved);
    }, BRIEF_ANSWER, BRIEF_CTX);
  });
  it("covers names an unpinned row only", () => {
    failsWith(["B1 S1 T2: U7 is not an unpinned row"],
      (a) => { a.batches[0].steps[0].tests[1].covers.push("U7"); }, BRIEF_ANSWER, BRIEF_CTX);
  });
  it("a spec context has no pinned rule to apply", () => {
    failsWith([], () => undefined);
  });
});

describe("rule 25: the problem cap", () => {
  it("lists 60 problems and counts the rest", () => {
    const problems = problemsOf((a) => {
      a.batches[0].steps[0].tests[0].ids = Array.from({ length: 61 }, (_, i) => `BR-${100 + i}`);
    });
    strictEqual(problems.length, 61);
    strictEqual(problems[0], "B1 S1 T1: BR-100 is not an id of the source");
    strictEqual(problems[59], "B1 S1 T1: BR-159 is not an id of the source");
    strictEqual(problems[60], "… 1 more problems");
  });
});

describe("fix pass: what the plan's markdown and the harness would misread", () => {
  it("refuses a free-text value or one of its lines that starts with #, TDD:, |, - [ or >", () => {
    const head = "starts a line with one of #, TDD:, |, - [, >";
    failsWith([`B1 S1: note ${head}`], (a) => { a.batches[0].steps[0].note = "first line\n### Step 9 — sneaked in"; });
    failsWith([`B1 S1: note ${head}`], (a) => { a.batches[0].steps[0].note = "TDD: RED [x] GREEN [x] COST [x]"; });
    failsWith([`B1: decisions[0] ${head}`], (a) => { a.batches[0].decisions[0] = "- [ ] a box of our own"; });
    failsWith([`B1: intent ${head}`], (a) => { a.batches[0].intent = "> a quote"; });
    failsWith([`plan: assumptions[0] ${head}`], (a) => { a.assumptions = ["# a heading"]; });
    failsWith([], (a) => { a.batches[0].steps[0].note = "the C# client stays; a TDD: prefix inside a line is fine"; });
  });
  it("refuses a create or existing anchor path that holds a colon", () => {
    failsWith(['B1 S1: anchor path "src/shared/domain/memory-prune.ts:12" holds ":"'],
      (a) => { a.batches[0].steps[0].anchors.production[0] = { kind: "create", path: "src/shared/domain/memory-prune.ts:12" }; });
    failsWith(['B2 S1: anchor path "docs/commands.md:3" holds ":"'],
      (a) => { a.batches[1].steps[0].anchors.production[0] = { kind: "existing", path: "docs/commands.md:3" }; });
  });
  it("refuses a traceability owner that is a path or a path:line, keeps a member name", () => {
    failsWith(['traceability: owner "src/commands/_lib/memory.ts:40" is a path, name the type or member'],
      (a) => { a.traceability[0].owners[0] = "src/commands/_lib/memory.ts:40"; });
    failsWith(['traceability: owner "memory/prune" is a path, name the type or member'],
      (a) => { a.traceability[1].owners[0] = "memory/prune"; });
    failsWith([], (a) => { a.traceability[0].owners[0] = "MemoryStore.prune()"; });
  });
  it("checks a production ref anchor's member against the entry's name or its last dotted segment", () => {
    failsWith(['B1 S2: anchor I1: member "pruneBefore" is not MemoryEntry; use a path to create for a new member'],
      (a) => { a.batches[0].steps[1].anchors.production[1] = { kind: "ref", ref: "I1", member: "pruneBefore" }; });
    failsWith([], (a) => { a.batches[0].steps[1].anchors.production[1] = { kind: "ref", ref: "I1", member: "MemoryEntry" }; });
    const dotted: PlanCheckContext = { ...CTX, refNames: new Map([...CTX.refNames, ["I1", "MemoryEntry.age"]]) };
    failsWith([], (a) => { a.batches[0].steps[1].anchors.production[1] = { kind: "ref", ref: "I1", member: "age" }; }, ANSWER, dotted);
    failsWith([], (a) => { a.batches[0].steps[1].anchors.production[1] = { kind: "ref", ref: "I1", member: "MemoryEntry.age" }; }, ANSWER, dotted);
    // The doubles column names a member to add: not compared.
    failsWith([], (a) => { a.batches[0].steps[2].anchors.doubles[0] = { kind: "ref", ref: "I4", member: "prunes" }; });
  });
});
