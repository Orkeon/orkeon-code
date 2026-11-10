// The planner's answer: the JSON schema the plan is extracted into, and the check that
// turns the extraction into a PlanAnswer or the list of what is wrong with it. Pure, no
// IO. The model decides the batches, steps, tests and anchors; code derives what it must
// not decide (batch ids, the Ids cells, the traceability batches, the build step, the
// anchors' path:line). Whether a path exists in the repository is not checked here: the
// application lists the folders once this check has passed.

import type { Checked } from "../../../shared/domain/agents/charter.ts";
import { DESIGN_RULE_IDS } from "../../../shared/domain/dev/design-rules.ts";
import type { ChangeKind, SourceKind } from "../../../shared/domain/dev/spec-format.ts";
import { BUILD_STEP } from "../../../shared/domain/dev/markers.ts";
import {
  ANCHOR_KINDS, DESIGN_RULE_ID, ELEMENT_LAYERS, FEATURE_EMPTY, LAYERS_EMPTY, NOT_AN_OBJECT, TEST_LEVELS, anchorNeedsPath,
  anchorNotShown, anchorPathColon, appliedAndNa, batchCount, cannotBeAnchored, docsAndCode, elementHoldsBody, elementTooLong,
  featureTooLong, fieldEmpty, holdsBreak, holdsCodeBreak, holdsLabel, inInventory, memberIsNot, missingOrNot, moreProblems,
  naTwice, naWithoutReason, nameEmpty, nameRepeats, nameTooLong, namesNoId, neitherAppliedNorNa, noCharacterisation,
  noCodeElement, noCodeOwner, noProductionAnchor, noTest, noTestAnchor, noTestCarries, notBatchOfPlan, notDesignRuleId,
  notEarlierBatch, notInFirstStep, notSourceId, notUnpinnedRow, ownerIsPath, pinnedNotInPlan, projectEmpty, refAnchorNeedsRef,
  reuseNotShown, shareUnordered, startsWithMarker, stepCount, titleEmpty, titleIsBuildStep, titleRepeats, titleTooLong,
  traceNotSourceId, traceTwice,
} from "./messages.ts";
import { PLAN_FIELDS } from "./prompts.ts";

export type TestLevel = "unit" | "integration" | "pinned";
export type ElementLayer = "domain" | "application" | "adapter" | "test";
/** ref: an inventory entry shown to the model (ref set, path absent); create: a file to create (path set);
 *  existing: a file of the repository the index does not hold — .md, .json, .yaml… (path set). */
export type AnchorKind = "ref" | "create" | "existing";
export interface AnchorRef { kind: AnchorKind; ref?: string; path?: string; member?: string }
export interface PlanTest { name: string; level: TestLevel; project: string; ids: string[]; covers: string[] } // covers: "U<n>" of unpinned rows
export interface PlanStep {
  title: string;
  tests: PlanTest[];
  note: string;                                   // "" or ≤ 2 lines: what merges into one cycle, what needs a container
  anchors: { tests: AnchorRef[]; doubles: AnchorRef[]; production: AnchorRef[] };
}
export interface PlanBatch {
  name: string; intent: string; reason: string;  // reason: the summary's Reason cell
  documentation: boolean;
  dependsOn: string[];                            // "F<n>" of earlier batches
  design: { appliedRules: string[]; aggregate: string; invariants: string; consistency: string; events: string; accessCost: string };
  decisions: string[];
  declarative: string[];                          // artefacts written without a red test first; [] = none
  steps: PlanStep[];                              // behaviour steps only, 2..5 (1..5 for documentation)
  buildScope: string;                             // the "Build and tests — scope:" text
  testPolicy: { fast: string; integration: string; notRun: string };
  elements: Array<{ layer: ElementLayer; signature: string; rule: string }>;
}
export interface PlanAnswer {
  feature: string;
  layers: string[];
  reuse: string[];                                // inventory refs
  outOfScope: string[];
  assumptions: string[];                          // the Scope line's; the sheets' ## Assumptions stay empty
  nonApplicable: Array<{ id: string; reason: string }>;
  traceability: Array<{ id: string; owners: string[] }>;
  design: Array<{ ids: string[]; aggregate: string; invariant: string; consistency: string; batch: number }>; // batch: 1-based
  batches: PlanBatch[];
}
export interface PlanCheckContext {
  sourceIds: readonly string[];          // UC/BR/CH of the source
  shownRefs: ReadonlySet<string>;        // the inventory refs the prompt showed
  refPaths: ReadonlyMap<string, string>; // ref → relative path (shared-anchor check)
  refNames: ReadonlyMap<string, string>; // ref → entry name (a production ref anchor's member)
  kind: SourceKind; changeKind?: ChangeKind;
  pinned: readonly string[];             // pinnedBy of "what must not change" rows
  unpinned: readonly string[];           // "U1".."Un"
  /** The work folder, relative (e.g. "workbench"): a created or existing anchor may not sit under it. */
  workFolder?: string;
}

export const MAX_BATCHES = 8;
const MAX_PROBLEMS = 60;
export const MAX_TITLE = 100;
export const MAX_TEST_NAME = 120;
export const MAX_SIGNATURE = 200;
export const MAX_FEATURE = 80;
export const MIN_NA_REASON = 10;
const LEVELS: readonly TestLevel[] = ["unit", "integration", "pinned"];
const LAYERS: readonly ElementLayer[] = ["domain", "application", "adapter", "test"];
const KINDS: readonly AnchorKind[] = ["ref", "create", "existing"];
const DOC_PATH = /\.(md|mdx|rst|adoc|txt)$/i;
const LABELS = /Applied rules|Non-applicable rules/;
const LINE_BREAK = /\r\n|\r|\n/;
/** A line the harness or the parser reads as structure: a heading, a TDD line, a table row, a box, a quote. */
const LINE_MARKER = /^(#|TDD:|\||- \[|> )/;
/** A path:line, or a path: what an owner of the traceability may not be. */
const OWNER_PATH = /:\d|\//;

const STRING = { type: "string" };
const STRINGS = { type: "array", items: STRING };
/** A field of the schema with what it holds, in a few words: the runtime prints the schema whole after the prompt,
 *  so a field whose name says what it holds goes without one. */
const said = (schema: object, description: string): object => ({ ...schema, description });
const text = (description: string): object => said(STRING, description);
const texts = (description: string): object => said(STRINGS, description);
const listOf = (items: object, description?: string): object =>
  description === undefined ? { type: "array", items } : said({ type: "array", items }, description);
const objectOf = (properties: Record<string, object>, description?: string): object => {
  const schema = { type: "object", properties, required: Object.keys(properties) };
  return description === undefined ? schema : said(schema, description);
};
/** An anchor; its fields are described once, on the anchors object, as the schema repeats it per list. */
const ANCHOR = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...KINDS] },
    ref: STRING,
    path: STRING,
    member: STRING,
  },
  required: ["kind"],
};
const ANCHORS = listOf(ANCHOR);

export const PLAN_ANSWER_SCHEMA: object = objectOf({
  feature: text(PLAN_FIELDS.feature(MAX_FEATURE)),
  layers: texts(PLAN_FIELDS.layers),
  reuse: texts(PLAN_FIELDS.reuse),
  outOfScope: STRINGS,
  assumptions: texts(PLAN_FIELDS.assumptions),
  nonApplicable: listOf(objectOf({
    id: { type: "string", enum: [...DESIGN_RULE_IDS] },
    reason: text(PLAN_FIELDS.naReason(MIN_NA_REASON)),
  }), PLAN_FIELDS.nonApplicable),
  traceability: listOf(objectOf({
    id: STRING,
    owners: texts(PLAN_FIELDS.owners),
  }), PLAN_FIELDS.traceability),
  design: listOf(objectOf({
    ids: texts(PLAN_FIELDS.designIds),
    aggregate: STRING,
    invariant: STRING,
    consistency: STRING,
    batch: said({ type: "integer" }, PLAN_FIELDS.designBatch),
  })),
  batches: listOf(objectOf({
    name: STRING,
    intent: text(PLAN_FIELDS.intent),
    reason: text(PLAN_FIELDS.reason),
    documentation: said({ type: "boolean" }, PLAN_FIELDS.documentation),
    dependsOn: texts(PLAN_FIELDS.dependsOn),
    design: objectOf({
      appliedRules: STRINGS,
      aggregate: STRING,
      invariants: STRING,
      consistency: STRING,
      events: STRING,
      accessCost: text(PLAN_FIELDS.accessCost),
    }, PLAN_FIELDS.batchDesign),
    decisions: texts(PLAN_FIELDS.decisions),
    declarative: texts(PLAN_FIELDS.declarative),
    steps: listOf(objectOf({
      title: text(PLAN_FIELDS.stepTitle(MAX_TITLE)),
      tests: listOf(objectOf({
        name: text(PLAN_FIELDS.testName(MAX_TEST_NAME)),
        level: said({ type: "string", enum: [...LEVELS] }, PLAN_FIELDS.level),
        project: STRING,
        ids: texts(PLAN_FIELDS.testIds),
        covers: texts(PLAN_FIELDS.covers),
      })),
      note: text(PLAN_FIELDS.note),
      anchors: objectOf({
        tests: ANCHORS,
        doubles: ANCHORS,
        production: ANCHORS,
      }, PLAN_FIELDS.anchors),
    }), PLAN_FIELDS.steps),
    buildScope: text(PLAN_FIELDS.buildScope),
    testPolicy: objectOf({
      fast: STRING,
      integration: STRING,
      notRun: text(PLAN_FIELDS.notRun),
    }, PLAN_FIELDS.testPolicy),
    elements: listOf(objectOf({
      layer: { type: "string", enum: [...LAYERS] },
      signature: text(PLAN_FIELDS.signature(MAX_SIGNATURE)),
      rule: text(PLAN_FIELDS.rule),
    })),
  }), PLAN_FIELDS.batches(MAX_BATCHES)),
}, PLAN_FIELDS.answer);

// ---- rule 1: the shape --------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads one field of the right type, or records `<field> is missing or not a <type>`. */
class Reader {
  readonly problems: string[] = [];

  private miss(field: string, type: string): void {
    const what = type.startsWith("one of") ? type : `${/^[aeiou]/.test(type) ? "an" : "a"} ${type}`;
    this.problems.push(missingOrNot(field, what));
  }

  str(o: Obj, key: string, at: string): string {
    const v = o[key];
    if (typeof v !== "string") { this.miss(at + key, "string"); return ""; }
    return v;
  }

  optStr(o: Obj, key: string, at: string): string | undefined {
    const v = o[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string") { this.miss(at + key, "string"); return undefined; }
    return v;
  }

  bool(o: Obj, key: string, at: string): boolean {
    const v = o[key];
    if (typeof v !== "boolean") { this.miss(at + key, "boolean"); return false; }
    return v;
  }

  int(o: Obj, key: string, at: string): number {
    const v = o[key];
    if (typeof v !== "number" || !Number.isInteger(v)) { this.miss(at + key, "integer"); return 0; }
    return v;
  }

  oneOf<T extends string>(o: Obj, key: string, at: string, values: readonly T[], type: string): T {
    const v = o[key];
    if (typeof v !== "string" || !values.includes(v.trim() as T)) { this.miss(at + key, type); return values[0]; }
    return v.trim() as T;
  }

  obj(o: Obj, key: string, at: string): Obj {
    const v = o[key];
    if (!isObj(v)) { this.miss(at + key, "object"); return {}; }
    return v;
  }

  list<T>(o: Obj, key: string, at: string, item: (v: unknown, at: string) => T | undefined): T[] {
    const v = o[key];
    if (!Array.isArray(v)) { this.miss(at + key, "list"); return []; }
    const out: T[] = [];
    v.forEach((x, i) => {
      const r = item(x, `${at}${key}[${i}]`);
      if (r !== undefined) out.push(r);
    });
    return out;
  }

  strings(o: Obj, key: string, at: string): string[] {
    return this.list(o, key, at, (x, here) => {
      if (typeof x !== "string") { this.miss(here, "string"); return undefined; }
      return x;
    });
  }

  objects<T>(o: Obj, key: string, at: string, read: (item: Obj, at: string) => T): T[] {
    return this.list(o, key, at, (x, here) => {
      if (!isObj(x)) { this.miss(here, "object"); return undefined; }
      return read(x, `${here}.`);
    });
  }
}

function readAnswer(value: Obj, r: Reader): PlanAnswer {
  const anchor = (a: Obj, at: string): AnchorRef => {
    const out: AnchorRef = { kind: r.oneOf(a, "kind", at, KINDS, ANCHOR_KINDS) };
    const ref = r.optStr(a, "ref", at);
    const path = r.optStr(a, "path", at);
    const member = r.optStr(a, "member", at);
    if (ref !== undefined) out.ref = ref;
    if (path !== undefined) out.path = path;
    if (member !== undefined) out.member = member;
    return out;
  };
  const test = (t: Obj, at: string): PlanTest => ({
    name: r.str(t, "name", at),
    level: r.oneOf(t, "level", at, LEVELS, TEST_LEVELS),
    project: r.str(t, "project", at),
    ids: r.strings(t, "ids", at),
    covers: r.strings(t, "covers", at),
  });
  const step = (s: Obj, at: string): PlanStep => {
    const anchors = r.obj(s, "anchors", at);
    const here = `${at}anchors.`;
    return {
      title: r.str(s, "title", at),
      tests: r.objects(s, "tests", at, test),
      note: r.str(s, "note", at),
      anchors: {
        tests: r.objects(anchors, "tests", here, anchor),
        doubles: r.objects(anchors, "doubles", here, anchor),
        production: r.objects(anchors, "production", here, anchor),
      },
    };
  };
  const batch = (b: Obj, at: string): PlanBatch => {
    const design = r.obj(b, "design", at);
    const policy = r.obj(b, "testPolicy", at);
    const d = `${at}design.`;
    const p = `${at}testPolicy.`;
    return {
      name: r.str(b, "name", at),
      intent: r.str(b, "intent", at),
      reason: r.str(b, "reason", at),
      documentation: r.bool(b, "documentation", at),
      dependsOn: r.strings(b, "dependsOn", at),
      design: {
        appliedRules: r.strings(design, "appliedRules", d),
        aggregate: r.str(design, "aggregate", d),
        invariants: r.str(design, "invariants", d),
        consistency: r.str(design, "consistency", d),
        events: r.str(design, "events", d),
        accessCost: r.str(design, "accessCost", d),
      },
      decisions: r.strings(b, "decisions", at),
      declarative: r.strings(b, "declarative", at),
      steps: r.objects(b, "steps", at, step),
      buildScope: r.str(b, "buildScope", at),
      testPolicy: { fast: r.str(policy, "fast", p), integration: r.str(policy, "integration", p), notRun: r.str(policy, "notRun", p) },
      elements: r.objects(b, "elements", at, (e, here) => ({
        layer: r.oneOf(e, "layer", here, LAYERS, ELEMENT_LAYERS),
        signature: r.str(e, "signature", here),
        rule: r.str(e, "rule", here),
      })),
    };
  };
  return {
    feature: r.str(value, "feature", ""),
    layers: r.strings(value, "layers", ""),
    reuse: r.strings(value, "reuse", ""),
    outOfScope: r.strings(value, "outOfScope", ""),
    assumptions: r.strings(value, "assumptions", ""),
    nonApplicable: r.objects(value, "nonApplicable", "", (n, at) => ({
      id: r.oneOf(n, "id", at, DESIGN_RULE_IDS, DESIGN_RULE_ID),
      reason: r.str(n, "reason", at),
    })),
    traceability: r.objects(value, "traceability", "", (t, at) => ({ id: r.str(t, "id", at), owners: r.strings(t, "owners", at) })),
    design: r.objects(value, "design", "", (d, at) => ({
      ids: r.strings(d, "ids", at),
      aggregate: r.str(d, "aggregate", at),
      invariant: r.str(d, "invariant", at),
      consistency: r.str(d, "consistency", at),
      batch: r.int(d, "batch", at),
    })),
    batches: r.objects(value, "batches", "", batch),
  };
}

// ---- trimming ----------------------------------------------------------------------

const trimAll = (xs: readonly string[]): string[] => xs.map((x) => x.trim());
const trimNote = (note: string): string => note.trim().split(LINE_BREAK).map((l) => l.trimEnd()).join("\n");

/** A path in one spelling, so every rule compares the same string: no `./` segment, no doubled or trailing `/`
 *  (a leading `/` is kept, for rule 14 to refuse it). */
function normalPath(raw: string): string {
  const path = raw.trim();
  const segments = path.split("/").filter((s) => s !== "" && s !== ".");
  return (path.startsWith("/") ? "/" : "") + segments.join("/");
}

function trimAnchor(a: AnchorRef): AnchorRef {
  const out: AnchorRef = { kind: a.kind };
  if (a.ref !== undefined) out.ref = a.ref.trim();
  if (a.path !== undefined) out.path = normalPath(a.path);
  if (a.member !== undefined) out.member = a.member.trim();
  return out;
}

/** The slips a model makes in the shape, mended where they have a single reading: a source id
 *  written in a test's covers moves to its ids, a ref anchor's path equal to its ref's path is
 *  dropped, a reuse entry that starts with a shown ref ("I3 class Account") keeps the ref alone. */
function mended(a: PlanAnswer, ctx: PlanCheckContext): PlanAnswer {
  const test = (t: PlanTest): PlanTest => {
    const moved = t.covers.filter((u) => !ctx.unpinned.includes(u) && ctx.sourceIds.includes(u));
    if (moved.length === 0) return t;
    return { ...t, ids: [...t.ids, ...moved.filter((id) => !t.ids.includes(id))], covers: t.covers.filter((u) => !moved.includes(u)) };
  };
  const anchor = (x: AnchorRef): AnchorRef => {
    if (x.kind !== "ref" || x.ref === undefined || x.path === undefined || ctx.refPaths.get(x.ref) !== x.path) return x;
    const { path: _path, ...rest } = x;
    return rest;
  };
  const reuse = (r: string): string => {
    const lead = /^(I\d+)\b/.exec(r)?.[1];
    return lead !== undefined && lead !== r && ctx.shownRefs.has(lead) ? lead : r;
  };
  return {
    ...a,
    reuse: a.reuse.map(reuse),
    batches: a.batches.map((b) => ({
      ...b,
      steps: b.steps.map((s) => ({
        ...s,
        tests: s.tests.map(test),
        anchors: { tests: s.anchors.tests.map(anchor), doubles: s.anchors.doubles.map(anchor), production: s.anchors.production.map(anchor) },
      })),
    })),
  };
}

function trimmed(a: PlanAnswer): PlanAnswer {
  return {
    feature: a.feature.trim(),
    layers: trimAll(a.layers),
    reuse: trimAll(a.reuse),
    outOfScope: trimAll(a.outOfScope),
    assumptions: trimAll(a.assumptions),
    nonApplicable: a.nonApplicable.map((n) => ({ id: n.id.trim(), reason: n.reason.trim() })),
    traceability: a.traceability.map((t) => ({ id: t.id.trim(), owners: trimAll(t.owners) })),
    design: a.design.map((d) => ({
      ids: trimAll(d.ids), aggregate: d.aggregate.trim(), invariant: d.invariant.trim(), consistency: d.consistency.trim(), batch: d.batch,
    })),
    batches: a.batches.map((b) => ({
      name: b.name.trim(), intent: b.intent.trim(), reason: b.reason.trim(), documentation: b.documentation,
      dependsOn: trimAll(b.dependsOn),
      design: {
        appliedRules: trimAll(b.design.appliedRules), aggregate: b.design.aggregate.trim(), invariants: b.design.invariants.trim(),
        consistency: b.design.consistency.trim(), events: b.design.events.trim(), accessCost: b.design.accessCost.trim(),
      },
      decisions: trimAll(b.decisions),
      declarative: trimAll(b.declarative),
      steps: b.steps.map((s) => ({
        title: s.title.trim(),
        tests: s.tests.map((t) => ({ name: t.name.trim(), level: t.level, project: t.project.trim(), ids: trimAll(t.ids), covers: trimAll(t.covers) })),
        note: trimNote(s.note),
        anchors: { tests: s.anchors.tests.map(trimAnchor), doubles: s.anchors.doubles.map(trimAnchor), production: s.anchors.production.map(trimAnchor) },
      })),
      buildScope: b.buildScope.trim(),
      testPolicy: { fast: b.testPolicy.fast.trim(), integration: b.testPolicy.integration.trim(), notRun: b.testPolicy.notRun.trim() },
      elements: b.elements.map((e) => ({ layer: e.layer, signature: e.signature.trim(), rule: e.rule.trim() })),
    })),
  };
}

// ---- the cells ---------------------------------------------------------------------

type CellKind = "code" | "prose" | "note";
interface Cell { where: string; field: string; value: string; kind: CellKind }

/** The longest batch name or step title a problem's label quotes: the re-ask names what the model wrote,
 *  not only an index of an answer it no longer sees. */
export const LABEL_QUOTE = 60;
/** A `"` of the text becomes `'`, so the quote it sits in ends where the name ends. */
const quoted = (text: string): string => {
  const one = text.replace(/\s+/g, " ").replace(/"/g, "'").trim();
  if (one === "") return "";
  const chars = Array.from(one);
  return ` "${chars.length > LABEL_QUOTE ? `${chars.slice(0, LABEL_QUOTE).join("")}…` : one}"`;
};
/** `B1 "<name>"`, the name left out when empty. */
const batchLabel = (b: PlanBatch, k: number): string => `B${k + 1}${quoted(b.name)}`;
/** `B1 "<name>" S2 "<title>"`; the anchor path check labels its problems the same way. */
export const stepLabel = (b: PlanBatch, k: number, j: number): string => `${batchLabel(b, k)} S${j + 1}${quoted(b.steps[j]?.title ?? "")}`;
const testLabel = (b: PlanBatch, k: number, j: number, m: number): string => `${stepLabel(b, k, j)} T${m + 1}`;
/** `design row 2 (<first id>)`, the id left out when the row has none. */
const designRow = (d: PlanAnswer["design"][number], i: number): string => {
  const first = d.ids.find((id) => id !== "");
  return `design row ${i + 1}${first === undefined ? "" : ` (${first})`}`;
};

function cellsOf(a: PlanAnswer): Cell[] {
  const cells: Cell[] = [];
  const add = (where: string, field: string, value: string, kind: CellKind): void => { cells.push({ where, field, value, kind }); };
  add("plan", "feature", a.feature, "prose");
  a.layers.forEach((v, i) => add("plan", `layers[${i}]`, v, "prose"));
  a.outOfScope.forEach((v, i) => add("plan", `outOfScope[${i}]`, v, "prose"));
  a.assumptions.forEach((v, i) => add("plan", `assumptions[${i}]`, v, "prose"));
  a.nonApplicable.forEach((n, i) => add("plan", `nonApplicable[${i}].reason`, n.reason, "prose"));
  a.traceability.forEach((t, i) => t.owners.forEach((o, j) => add("plan", `traceability[${i}].owners[${j}]`, o, "code")));
  a.design.forEach((d, i) => {
    const where = designRow(d, i);
    add(where, "aggregate", d.aggregate, "code");
    add(where, "invariant", d.invariant, "prose");
    add(where, "consistency", d.consistency, "prose");
  });
  a.batches.forEach((b, k) => {
    const where = batchLabel(b, k);
    for (const f of ["name", "intent", "reason", "buildScope"] as const) add(where, f, b[f], "prose");
    for (const f of ["aggregate", "invariants", "consistency", "events", "accessCost"] as const) add(where, `design.${f}`, b.design[f], "prose");
    for (const f of ["fast", "integration", "notRun"] as const) add(where, `testPolicy.${f}`, b.testPolicy[f], "prose");
    b.decisions.forEach((v, i) => add(where, `decisions[${i}]`, v, "prose"));
    b.declarative.forEach((v, i) => add(where, `declarative[${i}]`, v, "prose"));
    b.elements.forEach((e, i) => {
      add(where, `elements[${i}].signature`, e.signature, "code");
      add(where, `elements[${i}].rule`, e.rule, "prose");
    });
    b.steps.forEach((s, j) => {
      const at = stepLabel(b, k, j);
      add(at, "title", s.title, "prose");
      add(at, "note", s.note, "note");
      for (const column of ["tests", "doubles", "production"] as const) {
        s.anchors[column].forEach((x, i) => {
          if (x.path !== undefined) add(at, `anchors.${column}[${i}].path`, x.path, "code");
          if (x.member !== undefined) add(at, `anchors.${column}[${i}].member`, x.member, "code");
        });
      }
      s.tests.forEach((t, m) => {
        add(testLabel(b, k, j, m), "name", t.name, "code");
        add(testLabel(b, k, j, m), "project", t.project, "code");
      });
    });
  });
  return cells;
}

function cellProblems(cells: readonly Cell[]): string[] {
  const out: string[] = [];
  for (const c of cells) {
    const head = `${c.where}: ${c.field}`;
    if (c.kind === "code" && /[|`\r\n]/.test(c.value)) out.push(holdsCodeBreak(head));
    if (c.kind === "prose" && /[|\r\n]/.test(c.value)) out.push(holdsBreak(head));
    if (c.kind === "note" && (c.value.includes("|") || c.value.split(LINE_BREAK).length > 2)) {
      out.push(holdsBreak(head));
    }
    if (LABELS.test(c.value)) out.push(holdsLabel(head));
    if (c.value.split(LINE_BREAK).some((l) => LINE_MARKER.test(l.trimStart()))) {
      out.push(startsWithMarker(head));
    }
  }
  return out;
}

// ---- the plan's rules --------------------------------------------------------------

const isDocPath = (path: string): boolean => DOC_PATH.test(path) || path.startsWith("docs/");

function allAnchors(s: PlanStep): AnchorRef[] {
  return [...s.anchors.tests, ...s.anchors.doubles, ...s.anchors.production];
}

function pathOf(a: AnchorRef, ctx: PlanCheckContext): string | undefined {
  return a.kind === "ref" ? (a.ref === undefined ? undefined : ctx.refPaths.get(a.ref)) : a.path;
}

function anchorProblems(a: AnchorRef, at: string, ctx: PlanCheckContext, inventoryPaths: ReadonlySet<string>): string[] {
  if (a.kind === "ref") {
    if (a.ref === undefined || a.path !== undefined) return [refAnchorNeedsRef(at)];
    return ctx.shownRefs.has(a.ref) ? [] : [anchorNotShown(at, a.ref)];
  }
  if (a.path === undefined || a.ref !== undefined) return [anchorNeedsPath(at, a.kind)];
  const path = a.path;
  const work = ctx.workFolder?.replace(/^\/+|\/+$/g, "");
  const banned = [".claude/", ".orkeon/", ...(work ? [`${work}/`] : [])];
  if (path === "" || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.includes("\\") || path.split("/").includes("..") ||
      banned.some((p) => path.startsWith(p))) {
    return [cannotBeAnchored(at, path)];
  }
  if (path.includes(":")) return [anchorPathColon(at, path)];
  if (a.kind === "existing" && inventoryPaths.has(path)) return [inInventory(at, path)];
  return [];
}

function stepProblems(b: PlanBatch, k: number, ctx: PlanCheckContext, inventoryPaths: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const titles = new Map<string, number>();
  b.steps.forEach((s, j) => {
    const at = stepLabel(b, k, j);
    // 5: the title.
    if (s.title === "") out.push(titleEmpty(at));
    else if (s.title.length > MAX_TITLE) out.push(titleTooLong(at, MAX_TITLE));
    else if (s.title === BUILD_STEP) out.push(titleIsBuildStep(at, BUILD_STEP));
    const first = titles.get(s.title);
    if (s.title !== "" && first !== undefined) out.push(titleRepeats(at, first + 1));
    else titles.set(s.title, j);
    // 6, 7: the tests.
    if (s.tests.length === 0) out.push(noTest(at));
    s.tests.forEach((t, m) => {
      const here = testLabel(b, k, j, m);
      if (t.name === "") out.push(nameEmpty(here));
      else if (t.name.length > MAX_TEST_NAME) out.push(nameTooLong(here, MAX_TEST_NAME));
      if (t.project === "") out.push(projectEmpty(here));
      for (const id of t.ids) if (!ctx.sourceIds.includes(id)) out.push(notSourceId(here, id));
      for (const u of t.covers) if (!ctx.unpinned.includes(u)) out.push(notUnpinnedRow(here, u));
      if (t.ids.length === 0 && t.covers.length === 0) out.push(namesNoId(here));
    });
    // 13, 14, 26: each anchor.
    for (const a of allAnchors(s)) out.push(...anchorProblems(a, at, ctx, inventoryPaths));
    // 27: a production ref anchor's member is the entry, or the entry's last dotted segment.
    for (const a of s.anchors.production) {
      const name = a.kind === "ref" && a.ref !== undefined ? ctx.refNames.get(a.ref) : undefined;
      if (name === undefined || a.member === undefined || a.member === "") continue;
      if (a.member !== name && a.member !== name.slice(name.lastIndexOf(".") + 1)) {
        out.push(memberIsNot(at, a.ref, a.member, name));
      }
    }
    // 15: the columns a step needs.
    if (!b.documentation && s.anchors.tests.length === 0) out.push(noTestAnchor(at));
    if (s.anchors.production.length === 0) out.push(noProductionAnchor(at));
  });
  return out;
}

function batchProblems(b: PlanBatch, k: number, ctx: PlanCheckContext, inventoryPaths: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const at = batchLabel(b, k);
  // 3: the fields a sheet prints.
  const fields: Array<[string, string]> = [
    ["name", b.name], ["intent", b.intent], ["reason", b.reason], ["buildScope", b.buildScope],
    ["testPolicy.fast", b.testPolicy.fast], ["testPolicy.integration", b.testPolicy.integration], ["testPolicy.notRun", b.testPolicy.notRun],
    ["design.aggregate", b.design.aggregate], ["design.invariants", b.design.invariants], ["design.consistency", b.design.consistency],
    ["design.events", b.design.events], ["design.accessCost", b.design.accessCost],
  ];
  for (const [field, value] of fields) if (value === "") out.push(fieldEmpty(at, field));
  // 4: the step count.
  const min = b.documentation ? 1 : 2;
  if (b.steps.length < min || b.steps.length > 5) {
    out.push(stepCount(at, b.steps.length));
  }
  out.push(...stepProblems(b, k, ctx, inventoryPaths));
  // 11: applied rules are design rule ids.
  for (const id of b.design.appliedRules) if (!DESIGN_RULE_IDS.includes(id)) out.push(notDesignRuleId(at, id));
  // 12: earlier batches only.
  for (const dep of b.dependsOn) {
    const m = /^F(\d+)$/.exec(dep);
    if (m === null || Number(m[1]) < 1 || Number(m[1]) > k) out.push(notEarlierBatch(at, dep));
  }
  // 16: documentation stands alone (production paths).
  const production = b.steps.flatMap((s) => s.anchors.production).map((a) => pathOf(a, ctx)).filter((p): p is string => p !== undefined);
  const docs = production.filter(isDocPath);
  if ((docs.length > 0 && !b.documentation) || (b.documentation && docs.length < production.length)) {
    out.push(docsAndCode(at));
  }
  // 20, 21: the code elements.
  if (!b.documentation && b.elements.length === 0) out.push(noCodeElement(at));
  b.elements.forEach((e, i) => {
    if (e.signature.length > MAX_SIGNATURE) out.push(elementTooLong(at, i + 1, MAX_SIGNATURE));
    if (e.signature.includes("{")) out.push(elementHoldsBody(at, i + 1));
  });
  return out;
}

function traceProblems(a: PlanAnswer, ctx: PlanCheckContext): string[] {
  const out: string[] = [];
  // 8: every source id carried by a test.
  const carried = new Set(a.batches.flatMap((b) => b.steps.flatMap((s) => s.tests.flatMap((t) => t.ids))));
  for (const id of ctx.sourceIds) if (!carried.has(id)) out.push(noTestCarries(id));
  // 9: every source id owned by code.
  const rows = new Map<string, number>();
  for (const t of a.traceability) {
    // 28: an owner names a type or a member, never a path.
    for (const o of t.owners) if (OWNER_PATH.test(o)) out.push(ownerIsPath(o));
    if (!ctx.sourceIds.includes(t.id)) { out.push(traceNotSourceId(t.id)); continue; }
    if (rows.has(t.id)) { out.push(traceTwice(t.id)); continue; }
    rows.set(t.id, t.owners.filter((o) => o !== "").length);
  }
  for (const id of ctx.sourceIds) if ((rows.get(id) ?? 0) === 0) out.push(noCodeOwner(id));
  return out;
}

function designRuleProblems(a: PlanAnswer): string[] {
  const out: string[] = [];
  const applied = new Set(a.batches.flatMap((b) => b.design.appliedRules));
  for (const id of DESIGN_RULE_IDS) {
    const na = a.nonApplicable.filter((n) => n.id === id);
    if (applied.has(id) && na.length > 0) out.push(appliedAndNa(id));
    else if (!applied.has(id) && na.length === 0) out.push(neitherAppliedNorNa(id));
    else if (na.length > 1) out.push(naTwice(id));
    else if (na.length === 1 && na[0].reason.length < MIN_NA_REASON) out.push(naWithoutReason(id));
  }
  return out;
}

/** 17: two batches sharing an anchor path are ordered, directly or through others. */
function sharedAnchorProblems(a: PlanAnswer, ctx: PlanCheckContext): string[] {
  const out: string[] = [];
  const before: Array<Set<number>> = [];
  a.batches.forEach((b, k) => {
    const reach = new Set<number>();
    for (const dep of b.dependsOn) {
      const m = /^F(\d+)$/.exec(dep);
      const i = m === null ? -1 : Number(m[1]) - 1;
      if (i < 0 || i >= k) continue;
      reach.add(i);
      for (const x of before[i]) reach.add(x);
    }
    before.push(reach);
  });
  const paths = a.batches.map((b) => new Set(b.steps.flatMap(allAnchors).map((x) => pathOf(x, ctx)).filter((p): p is string => p !== undefined)));
  for (let k = 0; k < paths.length; k++) {
    for (let m = k + 1; m < paths.length; m++) {
      const shared = [...paths[k]].filter((p) => paths[m].has(p)).sort();
      if (shared.length > 0 && !before[m].has(k)) out.push(shareUnordered(batchLabel(a.batches[k], k), batchLabel(a.batches[m], m), shared[0]));
    }
  }
  return out;
}

function changeProblems(a: PlanAnswer, ctx: PlanCheckContext): string[] {
  if (ctx.kind !== "change") return [];
  const out: string[] = [];
  const tests = a.batches.flatMap((b) => b.steps.flatMap((s, j) => s.tests.map((t) => ({ t, first: j === 0 }))));
  // 22: every pinned behaviour keeps its pinned test.
  for (const name of ctx.pinned) {
    const n = name.trim();
    if (!tests.some(({ t }) => t.level === "pinned" && t.name === n)) out.push(pinnedNotInPlan(n));
  }
  // 23: every unpinned row gets a characterisation test, first in its batch.
  for (const u of ctx.unpinned) {
    const covering = tests.filter(({ t }) => t.covers.includes(u));
    if (covering.length === 0) out.push(noCharacterisation(u));
    else if (!covering.some(({ first }) => first)) out.push(notInFirstStep(u));
  }
  return out;
}

function capped(problems: readonly string[]): string[] {
  if (problems.length <= MAX_PROBLEMS) return [...problems];
  return [...problems.slice(0, MAX_PROBLEMS), moreProblems(problems.length - MAX_PROBLEMS)];
}

export function checkPlanAnswer(value: unknown, ctx: PlanCheckContext): Checked<PlanAnswer> {
  if (!isObj(value)) return { ok: false, problems: [NOT_AN_OBJECT] };
  const reader = new Reader();
  const read = readAnswer(value, reader);
  if (reader.problems.length > 0) return { ok: false, problems: capped(reader.problems) };
  const a = mended(trimmed(read), ctx);
  const problems: string[] = [];
  // 24: the plan's own fields.
  if (a.feature === "") problems.push(FEATURE_EMPTY);
  else if (a.feature.length > MAX_FEATURE) problems.push(featureTooLong(MAX_FEATURE));
  if (a.layers.filter((l) => l !== "").length === 0) problems.push(LAYERS_EMPTY);
  problems.push(...cellProblems(cellsOf(a)));
  // 2: the batch count.
  if (a.batches.length < 1 || a.batches.length > MAX_BATCHES) {
    problems.push(batchCount(MAX_BATCHES, a.batches.length));
  }
  // 6: test names unique across the plan.
  const names = new Map<string, string>();
  a.batches.forEach((b, k) => b.steps.forEach((s, j) => s.tests.forEach((t, m) => {
    if (t.name === "") return;
    const first = names.get(t.name);
    if (first !== undefined) problems.push(nameRepeats(testLabel(b, k, j, m), first));
    else names.set(t.name, testLabel(b, k, j, m));
  })));
  const inventoryPaths = new Set(ctx.refPaths.values());
  a.batches.forEach((b, k) => problems.push(...batchProblems(b, k, ctx, inventoryPaths)));
  problems.push(...traceProblems(a, ctx));
  problems.push(...designRuleProblems(a));
  problems.push(...sharedAnchorProblems(a, ctx));
  // 18: reuse names shown entries.
  for (const ref of a.reuse) if (!ctx.shownRefs.has(ref)) problems.push(reuseNotShown(ref));
  // 19: design rows.
  a.design.forEach((d, i) => {
    if (d.batch < 1 || d.batch > a.batches.length) problems.push(notBatchOfPlan(designRow(d, i), d.batch));
    for (const id of d.ids) if (!ctx.sourceIds.includes(id)) problems.push(notSourceId(designRow(d, i), id));
  });
  problems.push(...changeProblems(a, ctx));
  if (problems.length > 0) return { ok: false, problems: capped(problems) };
  return { ok: true, value: a };
}
