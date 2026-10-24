// The interoperability test of the plan renderer: what /dev-plan writes is what the
// harness's implement, verify and batches steps read, and what L-1 parses back. The
// golden renders are byte for byte; the patterns below are a file format. Run:
//   node --test src/crews/dev-plan/domain/plan-render-interop.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { checkPlanAnswer } from "./plan-answer.ts";
import type { PlanAnswer, PlanCheckContext } from "./plan-answer.ts";
import { renderPlan, repoLines } from "./plan-render.ts";
import type { RenderedPlan } from "./plan-render.ts";
import type { Inventory } from "./inventory-model.ts";
import { runGateChecks } from "../../dev-verify/domain/gate.ts";
import { parseBatchSheet, parseGlobalPlan, sheetProgress } from "../../../shared/domain/dev/plan-format.ts";
import { planSelfCheck } from "../../../shared/domain/dev/plan-checks.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { ReviewAnswer } from "../../../shared/domain/dev/review-answer.ts";
import { sheetFacts } from "../../../shared/domain/dev/sheet-facts.ts";
import { blockingRows, parsePlanSource } from "../../../shared/domain/dev/spec-format.ts";
import type { PlanSource, SourceKind } from "../../../shared/domain/dev/spec-format.ts";
import { traitMarker } from "../../../shared/domain/dev/trait-pattern.ts";

/** The headings and lines the harness's implement, verify and batches steps read from a plan (IM, AC, DB). A file format. */
export const HARNESS_PLAN_LINES: { plan: readonly RegExp[]; sheet: readonly RegExp[] } = {
  plan: [
    /^# \S+-PLAN — .+$/m, /^## 0\. Summary$/m, /^\| Batch \| Intent \| Ids \| Depends on \| Reason \|$/m,
    /^### Batch F\d+ — .+ — open$/m, /^- \[ \] \d+\. .+$/m, /^- \[ \] \d+\. Build and tests — scope: .+$/m, /^## 1\. Scope$/m,
    /^- \*\*(Spec|Change)\*\*: /m, /^- \*\*Commands\*\*: /m, /^- \*\*Layout\*\*: /m, /^- \*\*Non-applicable rules\*\*: /m,
    /^## 2\. Traceability$/m, /^## 3\. Design$/m,
  ],
  sheet: [
    /^# \S+-PLAN-F\d+ — .+$/m, /^## Intent$/m, /\*\*Ids\*\*: /m, /\*\*Depends on\*\*: /m, /^## Design$/m,
    /^\| *Applied rules *\|/m, /^## TDD sequence$/m, /^### Step \d+ — .+$/m,
    /^\| # \| Test \| Level \| Project \| Ids \|$/m, /^TDD: RED \[ \] GREEN \[ \] COST \[ \]$/m,
    /^### Step \d+ — Build and tests$/m, /^## Test policy and scopes$/m, /^## Code elements$/m, /^## Anchors$/m,
    /^\| Step \| Test class \/ fixture \| Shared doubles and builders \| Production filled or created \|$/m,
    /^## Assumptions$/m, /^\| # \| Assumption \| To be validated by \|$/m,
  ],
};

const SHEET_SECTIONS = ["## Intent", "## Design", "## Decisions", "## TDD sequence", "## Test policy and scopes", "## Code elements", "## Anchors", "## Assumptions"];

const FIXTURES = new URL("../../../../tests/fixtures/dev/plan/", import.meta.url);
const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), "utf8");
const json = <T>(name: string): T => JSON.parse(fixture(name)) as T;

function readPack(): RepoPack {
  const r = parseRepoPack(fixture("pack.yaml"));
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

const PACK = readPack();
const INVENTORY = json<Inventory>("inventory.json");
const BY_REF = new Map(INVENTORY.entries.map((e) => [e.ref, e]));
const DATE = "2026-10-22";

function contextOf(source: PlanSource, kind: SourceKind): PlanCheckContext {
  const unpinned = source.mustNotChange.filter((r) => r.pinnedBy === null).map((_, i) => `U${i + 1}`);
  return {
    sourceIds: source.ids.map((i) => i.id),
    shownRefs: new Set(BY_REF.keys()),
    refPaths: new Map(INVENTORY.entries.map((e) => [e.ref, e.path])),
    refNames: new Map(INVENTORY.entries.map((e) => [e.ref, e.name])),
    kind, changeKind: source.changeKind,
    pinned: source.mustNotChange.flatMap((r) => (r.pinnedBy === null ? [] : [r.pinnedBy])),
    unpinned,
    workFolder: "workbench",
  };
}

function checked(answerFile: string, ctx: PlanCheckContext): PlanAnswer {
  const r = checkPlanAnswer(json<unknown>(answerFile), ctx);
  if (!r.ok) throw new Error(r.problems.join("\n"));
  return r.value;
}

const SPEC = parsePlanSource(fixture("SPEC-prune.md"), "spec");
const ANSWER = checked("answer.json", contextOf(SPEC, "spec"));

function renderSpec(review: ReviewAnswer | null): RenderedPlan {
  return renderPlan({
    prefix: "PRUNE", sourceShown: "workbench/prune/SPEC-prune.md", kind: "spec", sourceIds: SPEC.ids,
    repo: repoLines(PACK, ".orkeon/repo.yaml"), inventory: BY_REF, answer: ANSWER, review, date: DATE,
  });
}

const RENDERED = renderSpec(json<ReviewAnswer>("review.json"));
const files = (r: RenderedPlan): Array<{ name: string; text: string }> => [r.plan, ...r.sheets];
const sortedIds = (): string[] => SPEC.ids.map((i) => i.id).sort();

describe("the fixtures", () => {
  it("the spec has its four ids and no Blocking question; the blocked spec has four, each caught", () => {
    deepStrictEqual(SPEC.ids.map((i) => i.id), ["UC-01", "BR-01", "BR-02", "BR-03"]);
    deepStrictEqual([SPEC.blocking.length, SPEC.openQuestions.length], [0, 1]);
    const text = fixture("SPEC-blocked.md");
    const rows = blockingRows(text).map((r) => r.raw);
    deepStrictEqual(rows, [
      "| 1 | Blocking | Which date counts, the saved one or the edited one? | the rule | saved / edited |",
      "2 | Blocking | Is the cut-off a date or an age? | the command line | date / age",
      "| 3 | **Blocking** | Are feedback entries kept? | the rule | yes / no |",
      "Blocking | 4 | Does a prune need a confirmation? | the command | yes / no",
    ]);
  });
  it("the capture changes every anchor path of F1, and carries each of its ids once", () => {
    const capture = json<{ changedFiles: string[]; traitHits: string[] }>("capture.json");
    const paths = ANSWER.batches[0].steps.flatMap((s) => [...s.anchors.tests, ...s.anchors.doubles, ...s.anchors.production])
      .map((a) => (a.kind === "ref" ? BY_REF.get(a.ref ?? "")?.path : a.path));
    deepStrictEqual([...new Set(paths)].sort(), capture.changedFiles);
    strictEqual(capture.traitHits.length, sheetFacts(RENDERED.sheets[0].text).ids.length);
  });
});

describe("case 1: the golden renders", () => {
  for (const name of ["PRUNE-PLAN.md", "PRUNE-PLAN-F1.md", "PRUNE-PLAN-F2.md"]) {
    it(`renders ${name} byte for byte`, () => {
      const file = files(RENDERED).find((f) => f.name === name);
      strictEqual(file?.text, fixture(`expected/${name}`));
    });
  }
});

describe("case 2: L-1 parses every file back", () => {
  it("the global plan: no problem, the batches, their boxes and dependencies", () => {
    const plan = parseGlobalPlan(RENDERED.plan.text);
    deepStrictEqual(plan.problems, []);
    deepStrictEqual([plan.prefix, plan.feature], ["PRUNE", "Prune old memory entries"]);
    deepStrictEqual(plan.batches.map((b) => [b.id, b.name, b.state.kind, b.steps.length]), [
      ["F1", "Prune by age", "open", 4], ["F2", "Command reference", "open", 2],
    ]);
    deepStrictEqual(plan.summary.map((r) => [r.id, r.ids, r.dependsOn]), [
      ["F1", "BR-01, BR-02, BR-03 / UC-01", []], ["F2", "UC-01", ["F1"]],
    ]);
  });
  it("the sheets: no problem, the steps, the behaviour steps and the dependencies", () => {
    const [f1, f2] = RENDERED.sheets.map((s) => parseBatchSheet(s.text));
    deepStrictEqual([f1.problems, f2.problems], [[], []]);
    deepStrictEqual([f1.batch, f1.name, f1.dependsOn, f2.batch, f2.dependsOn], ["F1", "Prune by age", [], "F2", ["F1"]]);
    deepStrictEqual(f1.steps.map((s) => [s.number, s.tdd === null]), [[1, false], [2, false], [3, false], [4, true]]);
    strictEqual(f1.steps[3].title, "Build and tests");
    deepStrictEqual([sheetProgress(f1).behaviourSteps, sheetProgress(f2).behaviourSteps], [3, 1]);
  });
  it("a blocked plan parses its batches as state other", () => {
    const plan = parseGlobalPlan(renderSpec(json<ReviewAnswer>("review-blocking.json")).plan.text);
    deepStrictEqual(plan.batches.map((b) => b.state), [{ kind: "other", text: "blocked" }, { kind: "other", text: "blocked" }]);
  });
});

describe("case 3: the /dev-verify gate on F1 once delivered", () => {
  it("is green with F1's capture, the pack's trait and the plan folder", () => {
    const capture = json<{ changedFiles: string[]; traitHits: string[]; diffCheckExit: number }>("capture.json");
    const sheet = RENDERED.sheets[0].text.split("TDD: RED [ ] GREEN [ ] COST [ ]").join("TDD: RED [x] GREEN [x] COST [x]");
    const sheets = [sheet, RENDERED.sheets[1].text];
    const layout = PACK.layout;
    const report = runGateChecks({
      batch: "F1",
      sheetShown: "workbench/prune/PRUNE-PLAN-F1.md",
      sheet,
      facts: sheetFacts(sheet),
      plan: { sheets, plans: [RENDERED.plan.text], all: [RENDERED.plan.text, ...sheets] },
      planDirShown: "workbench/prune",
      planDirAbsolute: "/workspace/workbench/prune",
      roots: [layout.domain, layout.application, layout.infrastructure, layout.tests].filter((r): r is string => r !== undefined),
      changedFiles: capture.changedFiles,
      trait: traitMarker(PACK.tests.ruleTrait, PACK.tests.traitPattern),
      traitHits: capture.traitHits,
      diffCheckExit: capture.diffCheckExit,
    });
    deepStrictEqual([report.green, report.missingDesignIds, report.untested, report.outside, report.stray], [true, [], [], [], []]);
  });
});

describe("case 4: the lines the harness reads", () => {
  it("every plan pattern matches the global plan", () => {
    for (const re of HARNESS_PLAN_LINES.plan) ok(re.test(RENDERED.plan.text), String(re));
  });
  for (const s of RENDERED.sheets) {
    it(`every sheet pattern matches ${s.name}, and its sections come in order`, () => {
      for (const re of HARNESS_PLAN_LINES.sheet) ok(re.test(s.text), String(re));
      const headings = s.text.split("\n").filter((l) => l.startsWith("## "));
      deepStrictEqual(headings, SHEET_SECTIONS.filter((h) => headings.includes(h)));
    });
  }
});

describe("case 5: the plan's self-check", () => {
  it("passes on the reviewed renders", () => {
    deepStrictEqual(planSelfCheck({ plan: RENDERED.plan, sheets: RENDERED.sheets, sourceIds: sortedIds() }), { ok: true, problems: [] });
  });
  it("passes on the blocked renders and the unreviewed ones", () => {
    for (const review of [json<ReviewAnswer>("review-blocking.json"), null]) {
      const r = renderSpec(review);
      deepStrictEqual(planSelfCheck({ plan: r.plan, sheets: r.sheets, sourceIds: sortedIds() }), { ok: true, problems: [] });
    }
  });
});

describe("case 6: a render from a change brief", () => {
  const brief = parsePlanSource(fixture("CHANGE-cache.md"), "change");
  const ctx = contextOf(brief, "change");
  it("reads the brief: two CH ids, one pinned row, two unpinned", () => {
    deepStrictEqual([brief.changeKind, ctx.sourceIds, ctx.pinned, ctx.unpinned],
      ["refactor", ["CH-01", "CH-02"], ["loads the cached map once"], ["U1", "U2"]]);
  });
  it("writes the Change line and a pinned row, and parses back clean", () => {
    const out = renderPlan({
      prefix: "CACHE", sourceShown: "workbench/cache/CHANGE-cache.md", kind: "change", changeKind: brief.changeKind,
      sourceIds: brief.ids, repo: repoLines(PACK, ".orkeon/repo.yaml"), inventory: BY_REF,
      answer: checked("answer-cache.json", ctx), review: null, date: DATE,
    });
    ok(out.plan.text.includes("\n- **Change**: `workbench/cache/CHANGE-cache.md` (`refactor`)\n"));
    ok(out.sheets[0].text.includes("\n| 1 | `loads the cached map once` | pinned | `tests` | CH-01 |\n"));
    ok(out.sheets[0].text.includes("\n| 2 | `an absent map file gives an empty map` | unit | `tests` | — |\n"));
    strictEqual(out.plan.text.includes("U1"), false);
    for (const re of HARNESS_PLAN_LINES.plan) ok(re.test(out.plan.text), String(re));
    deepStrictEqual(planSelfCheck({ plan: out.plan, sheets: out.sheets, sourceIds: ["CH-01", "CH-02"] }), { ok: true, problems: [] });
  });
});
