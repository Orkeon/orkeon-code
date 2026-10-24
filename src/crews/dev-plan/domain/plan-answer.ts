// The planner's answer: the JSON schema the plan is extracted into, and the check that
// turns the extraction into a PlanAnswer or the list of what is wrong with it. Pure, no
// IO. The model decides the batches, steps, tests and anchors; code derives what it must
// not decide (batch ids, the Ids cells, the traceability batches, the build step, the
// anchors' path:line). Whether a path exists in the repository is not checked here: the
// application lists the folders once this check has passed.

import type { Checked } from "../../../shared/domain/agents/charter.ts";
import { DESIGN_RULE_IDS } from "../../../shared/domain/dev/design-rules.ts";
import type { ChangeKind, SourceKind } from "../../../shared/domain/dev/spec-format.ts";

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
const MAX_TITLE = 100;
const MAX_TEST_NAME = 120;
const MAX_SIGNATURE = 200;
const MAX_FEATURE = 80;
const MIN_NA_REASON = 10;
const BUILD_STEP = "Build and tests";
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
const objectOf = (properties: Record<string, object>): object =>
  ({ type: "object", properties, required: Object.keys(properties) });
const ANCHOR = {
  type: "object",
  properties: { kind: { type: "string", enum: [...KINDS] }, ref: STRING, path: STRING, member: STRING },
  required: ["kind"],
};
const ANCHORS = { type: "array", items: ANCHOR };

export const PLAN_ANSWER_SCHEMA: object = objectOf({
  feature: STRING,
  layers: STRINGS,
  reuse: STRINGS,
  outOfScope: STRINGS,
  assumptions: STRINGS,
  nonApplicable: { type: "array", items: objectOf({ id: { type: "string", enum: [...DESIGN_RULE_IDS] }, reason: STRING }) },
  traceability: { type: "array", items: objectOf({ id: STRING, owners: STRINGS }) },
  design: {
    type: "array",
    items: objectOf({ ids: STRINGS, aggregate: STRING, invariant: STRING, consistency: STRING, batch: { type: "integer" } }),
  },
  batches: {
    type: "array",
    items: objectOf({
      name: STRING, intent: STRING, reason: STRING,
      documentation: { type: "boolean" },
      dependsOn: STRINGS,
      design: objectOf({
        appliedRules: STRINGS, aggregate: STRING, invariants: STRING, consistency: STRING, events: STRING, accessCost: STRING,
      }),
      decisions: STRINGS,
      declarative: STRINGS,
      steps: {
        type: "array",
        items: objectOf({
          title: STRING,
          tests: {
            type: "array",
            items: objectOf({
              name: STRING, level: { type: "string", enum: [...LEVELS] }, project: STRING, ids: STRINGS, covers: STRINGS,
            }),
          },
          note: STRING,
          anchors: objectOf({ tests: ANCHORS, doubles: ANCHORS, production: ANCHORS }),
        }),
      },
      buildScope: STRING,
      testPolicy: objectOf({ fast: STRING, integration: STRING, notRun: STRING }),
      elements: {
        type: "array",
        items: objectOf({ layer: { type: "string", enum: [...LAYERS] }, signature: STRING, rule: STRING }),
      },
    }),
  },
});

// ---- rule 1: the shape --------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads one field of the right type, or records `<field> is missing or not a <type>`. */
class Reader {
  readonly problems: string[] = [];

  private miss(field: string, type: string): void {
    const what = type.startsWith("one of") ? type : `${/^[aeiou]/.test(type) ? "an" : "a"} ${type}`;
    this.problems.push(`${field} is missing or not ${what}`);
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
    const out: AnchorRef = { kind: r.oneOf(a, "kind", at, KINDS, "one of ref, create, existing") };
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
    level: r.oneOf(t, "level", at, LEVELS, "one of unit, integration, pinned"),
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
        layer: r.oneOf(e, "layer", here, LAYERS, "one of domain, application, adapter, test"),
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
      id: r.oneOf(n, "id", at, DESIGN_RULE_IDS, "design rule id"),
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

function trimAnchor(a: AnchorRef): AnchorRef {
  const out: AnchorRef = { kind: a.kind };
  if (a.ref !== undefined) out.ref = a.ref.trim();
  if (a.path !== undefined) out.path = a.path.trim();
  if (a.member !== undefined) out.member = a.member.trim();
  return out;
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

const B = (k: number): string => `B${k + 1}`;
const BS = (k: number, j: number): string => `B${k + 1} S${j + 1}`;
const BST = (k: number, j: number, m: number): string => `B${k + 1} S${j + 1} T${m + 1}`;

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
    const where = `design row ${i + 1}`;
    add(where, "aggregate", d.aggregate, "code");
    add(where, "invariant", d.invariant, "prose");
    add(where, "consistency", d.consistency, "prose");
  });
  a.batches.forEach((b, k) => {
    const where = B(k);
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
      const at = BS(k, j);
      add(at, "title", s.title, "prose");
      add(at, "note", s.note, "note");
      for (const column of ["tests", "doubles", "production"] as const) {
        s.anchors[column].forEach((x, i) => {
          if (x.path !== undefined) add(at, `anchors.${column}[${i}].path`, x.path, "code");
          if (x.member !== undefined) add(at, `anchors.${column}[${i}].member`, x.member, "code");
        });
      }
      s.tests.forEach((t, m) => {
        add(BST(k, j, m), "name", t.name, "code");
        add(BST(k, j, m), "project", t.project, "code");
      });
    });
  });
  return cells;
}

function cellProblems(cells: readonly Cell[]): string[] {
  const out: string[] = [];
  for (const c of cells) {
    const head = `${c.where}: ${c.field}`;
    if (c.kind === "code" && /[|`\r\n]/.test(c.value)) out.push(`${head} holds a |, a backtick or a line break`);
    if (c.kind === "prose" && /[|\r\n]/.test(c.value)) out.push(`${head} holds a | or a line break`);
    if (c.kind === "note" && (c.value.includes("|") || c.value.split(LINE_BREAK).length > 2)) {
      out.push(`${head} holds a | or a line break`);
    }
    if (LABELS.test(c.value)) out.push(`${head} holds the label Applied rules or Non-applicable rules`);
    if (c.value.split(LINE_BREAK).some((l) => LINE_MARKER.test(l.trimStart()))) {
      out.push(`${head} starts a line with one of #, TDD:, |, - [, >`);
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
    if (a.ref === undefined || a.path !== undefined) return [`${at}: a ref anchor needs a ref only`];
    return ctx.shownRefs.has(a.ref) ? [] : [`${at}: anchor ${a.ref} is not an inventory entry shown`];
  }
  if (a.path === undefined || a.ref !== undefined) return [`${at}: ${a.kind === "existing" ? "an" : "a"} ${a.kind} anchor needs a path only`];
  const path = a.path;
  const work = ctx.workFolder?.replace(/^\/+|\/+$/g, "");
  const banned = [".claude/", ".orkeon/", ...(work ? [`${work}/`] : [])];
  if (path === "" || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.split(/[\\/]/).includes("..") ||
      banned.some((p) => path.startsWith(p))) {
    return [`${at}: ${path} cannot be anchored there`];
  }
  if (path.includes(":")) return [`${at}: anchor path "${path}" holds ":"`];
  if (a.kind === "existing" && inventoryPaths.has(path)) return [`${at}: ${path} is in the inventory: use its ref`];
  return [];
}

function stepProblems(b: PlanBatch, k: number, ctx: PlanCheckContext, inventoryPaths: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const titles = new Map<string, number>();
  b.steps.forEach((s, j) => {
    const at = BS(k, j);
    // 5: the title.
    if (s.title === "") out.push(`${at}: the title is empty`);
    else if (s.title.length > MAX_TITLE) out.push(`${at}: the title is longer than ${MAX_TITLE} characters`);
    else if (s.title === BUILD_STEP) out.push(`${at}: the title is ${BUILD_STEP}, the step code adds`);
    const first = titles.get(s.title);
    if (s.title !== "" && first !== undefined) out.push(`${at}: the title repeats step ${first + 1}`);
    else titles.set(s.title, j);
    // 6, 7: the tests.
    if (s.tests.length === 0) out.push(`${at}: no test`);
    s.tests.forEach((t, m) => {
      const here = BST(k, j, m);
      if (t.name === "") out.push(`${here}: the name is empty`);
      else if (t.name.length > MAX_TEST_NAME) out.push(`${here}: the name is longer than ${MAX_TEST_NAME} characters`);
      if (t.project === "") out.push(`${here}: the project is empty`);
      for (const id of t.ids) if (!ctx.sourceIds.includes(id)) out.push(`${here}: ${id} is not an id of the source`);
      for (const u of t.covers) if (!ctx.unpinned.includes(u)) out.push(`${here}: ${u} is not an unpinned row`);
      if (t.ids.length === 0 && t.covers.length === 0) out.push(`${here}: names no id`);
    });
    // 13, 14, 26: each anchor.
    for (const a of allAnchors(s)) out.push(...anchorProblems(a, at, ctx, inventoryPaths));
    // 27: a production ref anchor's member is the entry, or the entry's last dotted segment.
    for (const a of s.anchors.production) {
      const name = a.kind === "ref" && a.ref !== undefined ? ctx.refNames.get(a.ref) : undefined;
      if (name === undefined || a.member === undefined || a.member === "") continue;
      if (a.member !== name && a.member !== name.slice(name.lastIndexOf(".") + 1)) {
        out.push(`${at}: anchor ${a.ref}: member "${a.member}" is not ${name}; use a path to create for a new member`);
      }
    }
    // 15: the columns a step needs.
    if (!b.documentation && s.anchors.tests.length === 0) out.push(`${at}: no test anchor`);
    if (s.anchors.production.length === 0) out.push(`${at}: no production anchor`);
  });
  return out;
}

function batchProblems(b: PlanBatch, k: number, ctx: PlanCheckContext, inventoryPaths: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const at = B(k);
  // 3: the fields a sheet prints.
  const fields: Array<[string, string]> = [
    ["name", b.name], ["intent", b.intent], ["reason", b.reason], ["buildScope", b.buildScope],
    ["testPolicy.fast", b.testPolicy.fast], ["testPolicy.integration", b.testPolicy.integration], ["testPolicy.notRun", b.testPolicy.notRun],
    ["design.aggregate", b.design.aggregate], ["design.invariants", b.design.invariants], ["design.consistency", b.design.consistency],
    ["design.events", b.design.events], ["design.accessCost", b.design.accessCost],
  ];
  for (const [field, value] of fields) if (value === "") out.push(`${at}: ${field} is empty`);
  // 4: the step count.
  const min = b.documentation ? 1 : 2;
  if (b.steps.length < min || b.steps.length > 5) {
    out.push(`${at}: ${b.steps.length} behaviour steps; 2 to 5 (1 to 5 for documentation)`);
  }
  out.push(...stepProblems(b, k, ctx, inventoryPaths));
  // 11: applied rules are design rule ids.
  for (const id of b.design.appliedRules) if (!DESIGN_RULE_IDS.includes(id)) out.push(`${at}: ${id} is not a design rule id`);
  // 12: earlier batches only.
  for (const dep of b.dependsOn) {
    const m = /^F(\d+)$/.exec(dep);
    if (m === null || Number(m[1]) < 1 || Number(m[1]) > k) out.push(`${at}: depends on ${dep}, which is not an earlier batch`);
  }
  // 16: documentation stands alone (production paths).
  const production = b.steps.flatMap((s) => s.anchors.production).map((a) => pathOf(a, ctx)).filter((p): p is string => p !== undefined);
  const docs = production.filter(isDocPath);
  if ((docs.length > 0 && !b.documentation) || (b.documentation && docs.length < production.length)) {
    out.push(`${at}: documentation and code in one batch`);
  }
  // 20, 21: the code elements.
  if (!b.documentation && b.elements.length === 0) out.push(`${at}: no code element`);
  b.elements.forEach((e, i) => {
    if (e.signature.length > MAX_SIGNATURE) out.push(`${at}: element ${i + 1} is longer than ${MAX_SIGNATURE} characters`);
    if (e.signature.includes("{")) out.push(`${at}: element ${i + 1} holds a body`);
  });
  return out;
}

function traceProblems(a: PlanAnswer, ctx: PlanCheckContext): string[] {
  const out: string[] = [];
  // 8: every source id carried by a test.
  const carried = new Set(a.batches.flatMap((b) => b.steps.flatMap((s) => s.tests.flatMap((t) => t.ids))));
  for (const id of ctx.sourceIds) if (!carried.has(id)) out.push(`${id}: no test carries it`);
  // 9: every source id owned by code.
  const rows = new Map<string, number>();
  for (const t of a.traceability) {
    // 28: an owner names a type or a member, never a path.
    for (const o of t.owners) if (OWNER_PATH.test(o)) out.push(`traceability: owner "${o}" is a path, name the type or member`);
    if (!ctx.sourceIds.includes(t.id)) { out.push(`traceability: ${t.id} is not an id of the source`); continue; }
    if (rows.has(t.id)) { out.push(`traceability: ${t.id} appears twice`); continue; }
    rows.set(t.id, t.owners.filter((o) => o !== "").length);
  }
  for (const id of ctx.sourceIds) if ((rows.get(id) ?? 0) === 0) out.push(`${id}: no code owner`);
  return out;
}

function designRuleProblems(a: PlanAnswer): string[] {
  const out: string[] = [];
  const applied = new Set(a.batches.flatMap((b) => b.design.appliedRules));
  for (const id of DESIGN_RULE_IDS) {
    const na = a.nonApplicable.filter((n) => n.id === id);
    if (applied.has(id) && na.length > 0) out.push(`${id}: applied and non-applicable`);
    else if (!applied.has(id) && na.length === 0) out.push(`${id}: neither applied nor non-applicable`);
    else if (na.length > 1) out.push(`${id}: non-applicable twice`);
    else if (na.length === 1 && na[0].reason.length < MIN_NA_REASON) out.push(`${id}: N/A without a reason`);
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
      if (shared.length > 0 && !before[m].has(k)) out.push(`${B(k)} and ${B(m)} share ${shared[0]} and neither depends on the other`);
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
    if (!tests.some(({ t }) => t.level === "pinned" && t.name === n)) out.push(`pinned test ${n} is not in the plan`);
  }
  // 23: every unpinned row gets a characterisation test, first in its batch.
  for (const u of ctx.unpinned) {
    const covering = tests.filter(({ t }) => t.covers.includes(u));
    if (covering.length === 0) out.push(`${u}: no characterisation test`);
    else if (!covering.some(({ first }) => first)) out.push(`${u}: its test is not in the first step`);
  }
  return out;
}

function capped(problems: readonly string[]): string[] {
  if (problems.length <= MAX_PROBLEMS) return [...problems];
  return [...problems.slice(0, MAX_PROBLEMS), `… ${problems.length - MAX_PROBLEMS} more problems`];
}

export function checkPlanAnswer(value: unknown, ctx: PlanCheckContext): Checked<PlanAnswer> {
  if (!isObj(value)) return { ok: false, problems: ["the answer is not an object"] };
  const reader = new Reader();
  const read = readAnswer(value, reader);
  if (reader.problems.length > 0) return { ok: false, problems: capped(reader.problems) };
  const a = trimmed(read);
  const problems: string[] = [];
  // 24: the plan's own fields.
  if (a.feature === "") problems.push("feature is empty");
  else if (a.feature.length > MAX_FEATURE) problems.push(`feature is longer than ${MAX_FEATURE} characters`);
  if (a.layers.filter((l) => l !== "").length === 0) problems.push("layers is empty");
  problems.push(...cellProblems(cellsOf(a)));
  // 2: the batch count.
  if (a.batches.length < 1 || a.batches.length > MAX_BATCHES) {
    problems.push(`between 1 and ${MAX_BATCHES} batches, not ${a.batches.length}`);
  }
  // 6: test names unique across the plan.
  const names = new Map<string, string>();
  a.batches.forEach((b, k) => b.steps.forEach((s, j) => s.tests.forEach((t, m) => {
    if (t.name === "") return;
    const first = names.get(t.name);
    if (first !== undefined) problems.push(`${BST(k, j, m)}: the name repeats ${first}`);
    else names.set(t.name, BST(k, j, m));
  })));
  const inventoryPaths = new Set(ctx.refPaths.values());
  a.batches.forEach((b, k) => problems.push(...batchProblems(b, k, ctx, inventoryPaths)));
  problems.push(...traceProblems(a, ctx));
  problems.push(...designRuleProblems(a));
  problems.push(...sharedAnchorProblems(a, ctx));
  // 18: reuse names shown entries.
  for (const ref of a.reuse) if (!ctx.shownRefs.has(ref)) problems.push(`reuse: ${ref} is not an inventory entry shown`);
  // 19: design rows.
  a.design.forEach((d, i) => {
    if (d.batch < 1 || d.batch > a.batches.length) problems.push(`design row ${i + 1}: batch ${d.batch} is not a batch of the plan`);
    for (const id of d.ids) if (!ctx.sourceIds.includes(id)) problems.push(`design row ${i + 1}: ${id} is not an id of the source`);
  });
  problems.push(...changeProblems(a, ctx));
  if (problems.length > 0) return { ok: false, problems: capped(problems) };
  return { ok: true, value: a };
}
