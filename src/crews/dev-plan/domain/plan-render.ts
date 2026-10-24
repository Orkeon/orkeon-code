// The renderer of /dev-plan: a checked PlanAnswer, the inventory behind its anchors and
// the review become the global plan `<P>-PLAN.md` and one sheet `<P>-PLAN-F<k>.md` per
// batch. Pure, no IO. It is the only writer of the plan's format literals - headings, table
// headers, the box and TDD lines - which the harness and L-1 read back by pattern; every
// other sentence is this project's. It never checks the answer: checkPlanAnswer did.

import { DESIGN_RULE_IDS } from "../../../shared/domain/dev/design-rules.ts";
import { packValue } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { ReviewAnswer, ReviewRow } from "../../../shared/domain/dev/review-answer.ts";
import type { ChangeKind, SourceId, SourceKind } from "../../../shared/domain/dev/spec-format.ts";
import type { InventoryEntry } from "./inventory-model.ts";
import type { AnchorRef, ElementLayer, PlanAnswer, PlanBatch, PlanStep } from "./plan-answer.ts";

export interface RenderInput {
  prefix: string;                 // "PRUNE"
  sourceShown: string;            // "workbench/prune/SPEC-prune.md"
  kind: SourceKind; changeKind?: ChangeKind;
  sourceIds: readonly SourceId[]; // for titles in ## 2. Traceability
  repo: RepoLines;
  inventory: ReadonlyMap<string, InventoryEntry>; // ref → entry
  answer: PlanAnswer;             // checked
  review: ReviewAnswer | null;    // null before the review
  date: string;                   // "2026-10-22"
}
export interface RepoLines { commands: string; layout: string } // the two Scope lines' text after their label
export interface RenderedPlan { plan: { name: string; text: string }; sheets: Array<{ name: string; text: string }> }

const BUILD_STEP = "Build and tests";
const NONE_DASH = "—";
const COMMAND_KEYS = ["restore", "build", "build_test", "test_class", "test", "test_project", "test_integration"];
const LAYOUT_KEYS = ["domain", "application", "infrastructure", "tests"];
const LAYER_LABELS: ReadonlyArray<[ElementLayer, string]> = [
  ["domain", "**Domain**"], ["application", "**Application**"], ["adapter", "**Adapters**"], ["test", "**Tests**"],
];
const FAMILY_RANK: Record<string, number> = { BR: 0, CH: 1, UC: 2 };

// The sentences of a rendered plan that are not format literals: this project's words.
const TDD_PREAMBLE = [
  "Tests lead: a step's production code starts only once its tests exist and fail. Within the step, write the",
  "passing path first, then the refusals, then the integration checks.",
];
const DECLARATIVE_LEAD = "Pure declarations left without a test of their own (each one exercised by the test of its behaviour)";
const BUILD_STEP_BODY = "No test of its own: it runs the scopes of `## Test policy and scopes`.";
const ANCHORS_LEAD = "Paths copied by the implementation step; an existing one carries the line of the member it names, from the inventory of the plan run.";
const MAJOR_TAIL = "Not settled by the plan run: answer it here before the first failing test of the step it concerns.";

const noDot = (text: string): string => text.replace(/\.+$/, "");
const code = (text: string): string => `\`${text}\``;
const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
/** Free text of a review or a decision: the classification labels lose their capital (L4-Q06). */
const unlabelled = (text: string): string =>
  text.replace(/Non-applicable rules/g, "non-applicable rules").replace(/Applied rules/g, "applied rules");

function rankId(id: string): [number, number] {
  const [family, number] = id.split("-");
  return [FAMILY_RANK[family] ?? 3, Number(number)];
}

/** The ids of a batch's tests: BR/CH by family then number, then " / ", then UC. */
function idsCell(ids: Iterable<string>): string {
  const sorted = [...new Set(ids)].sort((a, b) => {
    const [fa, na] = rankId(a);
    const [fb, nb] = rankId(b);
    return fa !== fb ? fa - fb : na - nb;
  });
  const rules = sorted.filter((id) => !id.startsWith("UC-"));
  const cases = sorted.filter((id) => id.startsWith("UC-"));
  const sides = [rules.join(", "), cases.join(", ")].filter((s) => s !== "");
  return sides.length === 0 ? NONE_DASH : sides.join(" / ");
}

const batchIds = (b: PlanBatch): string => idsCell(b.steps.flatMap((s) => s.tests.flatMap((t) => t.ids)));
const blocks = (parts: ReadonlyArray<string | null>): string => `${parts.filter((p): p is string => p !== null).join("\n\n")}\n`;

// ---- the review --------------------------------------------------------------------

interface ReviewPlacement {
  blocked: boolean;
  questions: Array<{ n: number; row: ReviewRow }>; // § 4 of the global plan: Blocking, then plan-level Major
  majors: (batch: string) => ReviewRow[];
}

function placeReview(review: ReviewAnswer | null): ReviewPlacement {
  const rows = review?.rows ?? [];
  const blocking = rows.filter((r) => r.severity === "Blocking");
  const planMajor = rows.filter((r) => r.severity === "Major" && r.target === "plan");
  return {
    blocked: blocking.length > 0,
    questions: [...blocking, ...planMajor].map((r, i) => ({ n: i + 1, row: r })),
    majors: (batch) => rows.filter((r) => r.severity === "Major" && r.target === batch),
  };
}

// ---- repoLines ---------------------------------------------------------------------

/** The `- **Commands**:` and `- **Layout**:` texts from the pack (null: no pack), and the keys absent. */
export function repoLines(pack: RepoPack | null, packShown: string | null): RepoLines & { absent: string[] } {
  const absent: string[] = [];
  const tail = pack === null
    ? " — no repository pack: add .orkeon/repo.yaml"
    : ` — from ${code(packShown ?? ".orkeon/repo.yaml")}`;
  const valueOf = (key: string): string | undefined => {
    const v = pack === null ? undefined : packValue(pack, key);
    const text = typeof v === "string" ? v.trim() : undefined;
    if (text === undefined || text === "") { absent.push(key); return undefined; }
    return text;
  };
  const commands = COMMAND_KEYS.map((k) => {
    const v = valueOf(`commands.${k}`);
    return v === undefined ? `${k} (not in the pack)` : `${k} ${code(v)}`;
  });
  const layout = LAYOUT_KEYS.flatMap((k) => {
    const v = valueOf(`layout.${k}`);
    return v === undefined ? [] : [`${k} ${code(v)}`];
  });
  return {
    commands: `${commands.join(" · ")}${tail}`,
    layout: `${layout.length === 0 ? "(not in the pack)" : layout.join(" · ")}${tail}`,
    absent,
  };
}

// ---- the global plan ---------------------------------------------------------------

function globalPlan(input: RenderInput, sheetNames: readonly string[], review: ReviewPlacement): string {
  const { answer: a, prefix: p } = input;
  const ids = (b: PlanBatch): string => batchIds(b);
  const deps = (b: PlanBatch): string => (b.dependsOn.length === 0 ? NONE_DASH : b.dependsOn.join(", "));
  const state = review.blocked ? "blocked" : "open";
  const batchBlocks = a.batches.map((b, k) => [
    `### Batch F${k + 1} — ${b.name} — ${state}`,
    ...b.steps.map((s, j) => `- [ ] ${j + 1}. ${s.title}`),
    `- [ ] ${b.steps.length + 1}. ${BUILD_STEP} — scope: ${b.buildScope}`,
  ].join("\n"));

  const entry = (ref: string): InventoryEntry | undefined => input.inventory.get(ref);
  const reuse = a.reuse.map((ref) => {
    const e = entry(ref);
    return e === undefined ? code(ref) : `${code(`${e.path}:${e.line}`)} (${e.name})`;
  });
  const listOrNone = (items: readonly string[]): string => (items.length === 0 ? "none" : items.join("; "));
  const na = DESIGN_RULE_IDS.flatMap((id) => a.nonApplicable.filter((n) => n.id === id).map((n) => `${id}: N/A — ${n.reason}`));
  const sourceLine = input.kind === "change"
    ? `- **Change**: ${code(input.sourceShown)} (${code(input.changeKind ?? "change")})`
    : `- **Spec**: ${code(input.sourceShown)}`;
  const scope = [
    sourceLine,
    `- **Layers**: ${a.layers.join(", ")}`,
    `- **Reuse**: ${listOrNone(reuse)}`,
    `- **Out of scope**: ${listOrNone(a.outOfScope)}`,
    `- **Assumptions**: ${listOrNone(a.assumptions)}`,
    `- **Commands**: ${input.repo.commands}`,
    `- **Layout**: ${input.repo.layout}`,
    `- **Non-applicable rules**: ${na.length === 0 ? "none" : na.join("; ")}`,
  ].join("\n");

  const carriers = (id: string): string => {
    const batches = a.batches.flatMap((b, k) => (b.steps.some((s) => s.tests.some((t) => t.ids.includes(id))) ? [`F${k + 1}`] : []));
    return batches.length === 0 ? NONE_DASH : batches.join(", ");
  };
  const trace = [
    "| Id | Code owner(s) | Batch |",
    "|----|---------------|-------|",
    ...input.sourceIds.map((s) => {
      const owners = a.traceability.find((t) => t.id === s.id)?.owners ?? [];
      return row([`${s.id} — ${s.title}`, owners.length === 0 ? NONE_DASH : owners.map(code).join(" + "), carriers(s.id)]);
    }),
  ].join("\n");
  const design = [
    "| Ids | Owning aggregate | Invariant and what it removes | Consistency | Batch |",
    "|-----|------------------|-------------------------------|-------------|-------|",
    ...a.design.map((d) => row([d.ids.join(", "), code(d.aggregate), d.invariant, d.consistency, `F${d.batch}`])),
  ].join("\n");
  const questions = review.questions.length === 0 ? null : [
    "| # | Severity | Question | Evidence |",
    "|---|----------|----------|----------|",
    ...review.questions.map(({ n, row: r }) => row([String(n), r.severity, unlabelled(r.question), unlabelled(r.evidence)])),
  ].join("\n");

  return blocks([
    `# ${p}-PLAN — ${a.feature}`,
    `> From ${code(input.sourceShown)}. Sheets: ${sheetNames.map(code).join(", ")}.`,
    "## 0. Summary",
    [
      "| Batch | Intent | Ids | Depends on | Reason |",
      "|-------|--------|-----|------------|--------|",
      ...a.batches.map((b, k) => row([`F${k + 1}`, b.intent, ids(b), deps(b), b.reason])),
    ].join("\n"),
    ...batchBlocks,
    "## 1. Scope",
    scope,
    "## 2. Traceability",
    trace,
    "## 3. Design",
    design,
    questions === null ? null : "## 4. Open questions",
    questions,
  ]);
}

// ---- a batch sheet -----------------------------------------------------------------

type Column = "tests" | "doubles" | "production";

function anchorText(a: AnchorRef, column: Column, inventory: ReadonlyMap<string, InventoryEntry>): string {
  if (a.kind === "create") return `${code(a.path ?? "")} — to create`;
  const member = a.member === undefined || a.member === "" ? null : a.member;
  if (a.kind === "existing") {
    const base = `${code(a.path ?? "")} — existing`;
    if (column === "tests" || member === null) return base;
    return column === "doubles" ? `${base} (${code(member)} to add)` : `${base} — ${code(member)}`;
  }
  const e = a.ref === undefined ? undefined : inventory.get(a.ref);
  const at = code(e === undefined ? (a.ref ?? "") : `${e.path}:${e.line}`);
  if (column === "tests") return `${at} — existing`;
  if (member === null) return at;
  return column === "doubles" ? `${at} (${code(member)} to add)` : `${at} — ${code(member)}`;
}

function anchorCell(anchors: readonly AnchorRef[], column: Column, inventory: ReadonlyMap<string, InventoryEntry>): string {
  return anchors.length === 0 ? NONE_DASH : anchors.map((a) => anchorText(a, column, inventory)).join("; ");
}

function stepBlocks(s: PlanStep, j: number): string[] {
  const table = [
    `### Step ${j + 1} — ${s.title}`,
    "| # | Test | Level | Project | Ids |",
    "|---|------|-------|---------|-----|",
    ...s.tests.map((t, m) => row([String(m + 1), code(t.name), t.level, code(t.project), t.ids.length === 0 ? NONE_DASH : t.ids.join(", ")])),
  ].join("\n");
  const note = s.note === "" ? [] : [s.note.split("\n").map((l) => l.trimEnd()).join("\n")];
  return [table, ...note, "TDD: RED [ ] GREEN [ ] COST [ ]"];
}

function sheet(input: RenderInput, b: PlanBatch, k: number, review: ReviewPlacement): string {
  const p = input.prefix;
  const id = `F${k + 1}`;
  const source = input.kind === "change" ? "Change" : "Spec";
  const deps = b.dependsOn.length === 0 ? "[none]" : b.dependsOn.join(", ");
  const applied = DESIGN_RULE_IDS.filter((r) => b.design.appliedRules.includes(r));

  const blockedBy = review.blocked
    ? review.questions
      .filter(({ row: r }) => r.severity === "Blocking" && (r.target === id || r.target === "plan"))
      .map(({ n }) => `- Blocked by question ${n} of ${p}-PLAN.md § 4 (${input.date})`)
    : [];
  const decisions = [
    ...blockedBy,
    ...b.decisions.map((d) => `- ${input.date} — ${unlabelled(d)}`),
    ...review.majors(id).map((r) =>
      `- ${input.date} — review (Major): ${unlabelled(r.question)} Evidence: ${unlabelled(noDot(r.evidence))}. ${MAJOR_TAIL}`),
  ];

  const s = b.steps.length;
  const elements = LAYER_LABELS.flatMap(([layer, label]) => {
    const items = b.elements.filter((e) => e.layer === layer);
    return items.length === 0 ? [] : [label, ...items.map((e) => `- ${code(e.signature)} — ${e.rule}`)];
  });
  const anchors = [
    "| Step | Test class / fixture | Shared doubles and builders | Production filled or created |",
    "|------|----------------------|-----------------------------|------------------------------|",
    ...b.steps.map((st, j) => row([
      `${j + 1} — ${st.title}`,
      anchorCell(st.anchors.tests, "tests", input.inventory),
      anchorCell(st.anchors.doubles, "doubles", input.inventory),
      anchorCell(st.anchors.production, "production", input.inventory),
    ])),
    row([`${s + 1} — ${BUILD_STEP}`, NONE_DASH, NONE_DASH, NONE_DASH]),
  ].join("\n");
  const declarative = b.declarative.length === 0 ? "none" : noDot(b.declarative.join("; "));

  return blocks([
    `# ${p}-PLAN-${id} — ${b.name}`,
    `> Batch ${id} of ${code(`${p}-PLAN.md`)}. ${source}: ${code(input.sourceShown)}.`,
    `## Intent\n${noDot(b.intent)}. **Ids**: ${batchIds(b)}. **Depends on**: ${deps}`,
    [
      "## Design",
      "| Point | Decision |",
      "|-------|----------|",
      row(["Applied rules", applied.length === 0 ? NONE_DASH : applied.join(", ")]),
      row(["Owning aggregate", b.design.aggregate]),
      row(["Invariants", b.design.invariants]),
      row(["Consistency", b.design.consistency]),
      row(["Events", b.design.events]),
      row(["Access cost", b.design.accessCost]),
    ].join("\n"),
    decisions.length === 0 ? null : ["## Decisions", ...decisions].join("\n"),
    ["## TDD sequence", ...TDD_PREAMBLE, `${DECLARATIVE_LEAD}: ${declarative}.`].join("\n"),
    ...b.steps.flatMap(stepBlocks),
    `### Step ${s + 1} — ${BUILD_STEP}\n${BUILD_STEP_BODY}`,
    `## Test policy and scopes\n**Fast suite**: ${noDot(b.testPolicy.fast)}. **Integration**: ${noDot(b.testPolicy.integration)}. **Not run**: ${noDot(b.testPolicy.notRun)}.`,
    ["## Code elements", ...elements].join("\n"),
    `## Anchors\n${ANCHORS_LEAD}`,
    anchors,
    ["## Assumptions", "| # | Assumption | To be validated by |", "|---|------------|--------------------|"].join("\n"),
  ]);
}

export function renderPlan(input: RenderInput): RenderedPlan {
  const review = placeReview(input.review);
  const sheetNames = input.answer.batches.map((_, k) => `${input.prefix}-PLAN-F${k + 1}.md`);
  return {
    plan: { name: `${input.prefix}-PLAN.md`, text: globalPlan(input, sheetNames, review) },
    sheets: input.answer.batches.map((b, k) => ({ name: sheetNames[k], text: sheet(input, b, k, review) })),
  };
}
