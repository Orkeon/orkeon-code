// What the plan renderer's interoperability tests read: the lines the harness reads from a plan (a file format), the
// golden spec, answer, pack and inventory, the renders built from them, and the gate input of F1 once delivered.
import { readFileSync } from "node:fs";

import { checkPlanAnswer } from "./plan-answer.ts";
import type { PlanAnswer, PlanCheckContext } from "./plan-answer.ts";
import { renderPlan, repoLines } from "./plan-render.ts";
import type { RenderedPlan } from "./plan-render.ts";
import type { Inventory } from "./inventory-model.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { ReviewAnswer } from "../../../shared/domain/dev/review-answer.ts";
import { sheetFacts } from "../../../shared/domain/dev/sheet-facts.ts";
import { parsePlanSource } from "../../../shared/domain/dev/spec-format.ts";
import type { PlanSource, SourceKind } from "../../../shared/domain/dev/spec-format.ts";
import { traitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import type { runGateChecks } from "../../dev-verify/domain/gate.ts";
import { WORKSPACE } from "../../../shared/domain/dev/path-rebase.ts";

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

export const SHEET_SECTIONS = ["## Intent", "## Design", "## Decisions", "## TDD sequence", "## Test policy and scopes", "## Code elements", "## Anchors", "## Assumptions"];

const FIXTURES = new URL("../../../../tests/fixtures/dev/plan/", import.meta.url);
export const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), "utf8");
export const json = <T>(name: string): T => JSON.parse(fixture(name)) as T;

function readPack(): RepoPack {
  const r = parseRepoPack(fixture("pack.yaml"));
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

export const PACK = readPack();
const INVENTORY = json<Inventory>("inventory.json");
export const BY_REF = new Map(INVENTORY.entries.map((e) => [e.ref, e]));
export const DATE = "2026-10-22";

/** The check context of a source against the golden inventory. */
export function contextOf(source: PlanSource, kind: SourceKind): PlanCheckContext {
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

/** The answer of `answerFile` once checked against `ctx`; throws with its problems when the check refuses it. */
export function checked(answerFile: string, ctx: PlanCheckContext): PlanAnswer {
  const r = checkPlanAnswer(json<unknown>(answerFile), ctx);
  if (!r.ok) throw new Error(r.problems.join("\n"));
  return r.value;
}

export const SPEC = parsePlanSource(fixture("SPEC-prune.md"), "spec");
export const ANSWER = checked("answer.json", contextOf(SPEC, "spec"));

/** The render of the golden answer against SPEC-prune.md, with `review`. */
export function renderSpec(review: ReviewAnswer | null): RenderedPlan {
  return renderPlan({
    prefix: "PRUNE", sourceShown: "workbench/prune/SPEC-prune.md", kind: "spec", sourceIds: SPEC.ids,
    repo: repoLines(PACK, ".orkeon/repo.yaml"), inventory: BY_REF, answer: ANSWER, review, date: DATE,
  });
}

/** The render reviewed with review.json. */
export const RENDERED = renderSpec(json<ReviewAnswer>("review.json"));
export const files = (r: RenderedPlan): Array<{ name: string; text: string }> => [r.plan, ...r.sheets];
export const sortedIds = (): string[] => SPEC.ids.map((i) => i.id).sort();

export const GOLDEN_FILES = ["PRUNE-PLAN.md", "PRUNE-PLAN-F1.md", "PRUNE-PLAN-F2.md"];

export const BLOCKED_SPEC_ROWS = [
  "| 1 | Blocking | Which date counts, the saved one or the edited one? | the rule | saved / edited |",
  "2 | Blocking | Is the cut-off a date or an age? | the command line | date / age",
  "| 3 | **Blocking** | Are feedback entries kept? | the rule | yes / no |",
  "Blocking | 4 | Does a prune need a confirmation? | the command | yes / no",
];

export type Capture = { changedFiles: string[]; traitHits: string[]; diffCheckExit: number };

/** The paths every anchor of F1 names, a ref anchor by its inventory entry's path. */
export function f1AnchorPaths(): Array<string | undefined> {
  return ANSWER.batches[0].steps.flatMap((s) => [...s.anchors.tests, ...s.anchors.doubles, ...s.anchors.production])
    .map((a) => (a.kind === "ref" ? BY_REF.get(a.ref ?? "")?.path : a.path));
}

/** The gate input of F1 once delivered: its boxes ticked, the capture's files and trait hits, the plan folder. */
export function deliveredF1(): Parameters<typeof runGateChecks>[0] {
  const capture = json<Capture>("capture.json");
  const sheet = RENDERED.sheets[0].text.split("TDD: RED [ ] GREEN [ ] COST [ ]").join("TDD: RED [x] GREEN [x] COST [x]");
  const sheets = [sheet, RENDERED.sheets[1].text];
  const layout = PACK.layout;
  return {
    batch: "F1",
    sheetShown: "workbench/prune/PRUNE-PLAN-F1.md",
    sheet,
    facts: sheetFacts(sheet),
    plan: { sheets, plans: [RENDERED.plan.text], all: [RENDERED.plan.text, ...sheets] },
    planDirShown: "workbench/prune",
    planDirAbsolute: `${WORKSPACE}/workbench/prune`,
    roots: [layout.domain, layout.application, layout.infrastructure, layout.tests].filter((r): r is string => r !== undefined),
    changedFiles: capture.changedFiles,
    trait: traitMarker(PACK.tests.ruleTrait, PACK.tests.traitPattern),
    traitHits: capture.traitHits,
    diffCheckExit: capture.diffCheckExit,
  };
}

/** The renders the self-check passes on besides the reviewed one. */
export const OTHER_REVIEWS: ReadonlyArray<{ name: string; review: () => ReviewAnswer | null }> = [
  { name: "blocked", review: () => json<ReviewAnswer>("review-blocking.json") },
  { name: "unreviewed", review: () => null },
];

export const BRIEF = parsePlanSource(fixture("CHANGE-cache.md"), "change");
export const BRIEF_CTX = contextOf(BRIEF, "change");
