// The cost index, the packs and the changed files measureAccessCost is tested on.
import type { FakeCostIndex } from "../../../../tests/support/fake-cost-index.ts";
import type { AccessCostReport } from "../../domain/dev/access-cost.ts";
import { parseRepoPack } from "../../domain/dev/repo-pack.ts";
import type { RepoPack } from "../../domain/dev/repo-pack.ts";
import type { measureAccessCost } from "./measure-access-cost.ts";

const ZERO = { reads: 0, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 };

/** The repository pack `yaml` parses to; throws when it does not parse. */
export function pack(yaml: string): RepoPack {
  const r = parseRepoPack(yaml);
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

export const LAYOUT = pack("layout:\n  domain: src\n  tests: tests\n");
export const LIB_ROOTS = pack("tools:\n  access_cost:\n    roots: [lib]\n");
export const FS_RECEIVERS = pack("layout:\n  domain: src\ntools:\n  access_cost:\n    receivers: _fs\n");

/** A production file with line 5 added, and its test. */
export const CHANGED = [
  { path: "src/order.ts", added: new Set([5]) },
  { path: "tests/order.test.ts", added: null },
];

/** CHANGED, a tool file and a test beside its module. */
export const CHANGED_WITH_COLOCATED_TEST = [...CHANGED, { path: "src/tools/run.ts", added: null }, { path: "src/order.test.ts", added: null }];

/** A port call in a loop, on the added line 5 of src/order.ts. */
export const LOOP: AccessCostReport = {
  members: [{
    member: "/workspace/src/order.ts::place",
    portCalls: [{ receiver: "this.store", method: "save", line: 5, inLoop: true, inLambda: false }],
    memoryFilters: [], cost: { ...ZERO, loops: 1 },
  }],
  cost: { ...ZERO, loops: 1 },
};

/** Why the cost was not computed, or "measured exit <n>". */
export function reasonOf(cost: Awaited<ReturnType<typeof measureAccessCost>>): string {
  return cost.state === "not-computed" ? cost.reason : `measured exit ${cost.exit}`;
}

/** The roots each pack gives the measure. */
export const COST_ROOTS: ReadonlyArray<{ name: string; pack: RepoPack | null; roots: string[] }> = [
  { name: "tools.access_cost.roots", pack: LIB_ROOTS, roots: ["lib"] },
  { name: "none for a pack without them", pack: LAYOUT, roots: [] },
  { name: "none without a pack", pack: null, roots: [] },
];

/** A call of the index failing, or the tool reporting errors, and the reason given. */
export const FAILURES: ReadonlyArray<{ name: string; set: (i: FakeCostIndex) => void; reason: string }> = [
  {
    name: "the index status fails", set: (i) => { i.failure.roots = new Error("status down\nmore"); },
    reason: "index_status failed (status down); judge the Cost axis from the diff",
  },
  {
    name: "the refresh fails", set: (i) => { i.failure.refresh = new Error("reindex down"); },
    reason: "incremental_reindex failed (reindex down); judge the Cost axis from the diff",
  },
  {
    name: "the refresh reports errors", set: (i) => { i.refreshErrors = ["parse error"]; },
    reason: "incremental_reindex: parse error; judge the Cost axis from the diff",
  },
  {
    name: "access_cost fails", set: (i) => { i.failure.accessCost = new Error("cost down"); },
    reason: "access_cost failed (cost down); judge the Cost axis from the diff",
  },
  {
    name: "access_cost reports errors", set: (i) => { i.errors = ["Provide fqns or changed_files"]; },
    reason: "access_cost: Provide fqns or changed_files; judge the Cost axis from the diff",
  },
  {
    name: "access_cost returns no report", set: (i) => { i.report = null; },
    reason: "access_cost returned no readable report; judge the Cost axis from the diff",
  },
];
