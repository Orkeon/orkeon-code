// measureAccessCost over a fake CostIndex: the index as a precondition, the refresh of the
// changed files, the roots and receivers of the pack, the failures. Run:
//   node --test src/crews/dev-verify/application/cost.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import type { CostIndex } from "../../../shared/application/ports.ts";
import type { AccessCostReport } from "../../../shared/domain/dev/access-cost.ts";
import { COST_NOT_WIRED, DEFAULT_RECEIVERS } from "../../../shared/domain/dev/access-cost.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import { costRoots, measureAccessCost } from "./cost.ts";

const ZERO = { reads: 0, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 };

/** A CostIndex answering its fields; an Error in `failure[<call>]` is thrown; every call lands in `calls`. */
class FakeCostIndex implements CostIndex {
  indexed: string[] = ["/workspace"];
  refreshErrors: string[] = [];
  report: AccessCostReport | null = { members: [], cost: ZERO };
  errors: string[] = [];
  failure: Partial<Record<"roots" | "refresh" | "accessCost", Error>> = {};
  calls: string[] = [];

  async roots(): Promise<string[]> {
    this.calls.push("roots");
    if (this.failure.roots) throw this.failure.roots;
    return this.indexed;
  }

  async refresh(root: string, files: readonly string[]): Promise<string[]> {
    this.calls.push(`refresh ${root} ${files.join(",")}`);
    if (this.failure.refresh) throw this.failure.refresh;
    return this.refreshErrors;
  }

  async accessCost(files: readonly string[], receivers: string | undefined) {
    this.calls.push(`accessCost ${files.join(",")}${receivers === undefined ? "" : ` ${receivers}`}`);
    if (this.failure.accessCost) throw this.failure.accessCost;
    return { report: this.report, errors: this.errors };
  }
}

function pack(yaml: string): RepoPack {
  const r = parseRepoPack(yaml);
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

const LAYOUT = pack("layout:\n  domain: src\n  tests: tests\n");
const CHANGED = [
  { path: "src/order.ts", added: new Set([5]) },
  { path: "tests/order.test.ts", added: null },
];
const LOOP: AccessCostReport = {
  members: [{
    member: "/workspace/src/order.ts::place",
    portCalls: [{ receiver: "this.store", method: "save", line: 5, inLoop: true, inLambda: false }],
    memoryFilters: [], cost: { ...ZERO, loops: 1 },
  }],
  cost: { ...ZERO, loops: 1 },
};

function reasonOf(cost: Awaited<ReturnType<typeof measureAccessCost>>): string {
  return cost.state === "not-computed" ? cost.reason : `measured exit ${cost.exit}`;
}

describe("costRoots", () => {
  it("takes tools.access_cost.roots, else none", () => {
    deepStrictEqual(costRoots(pack("tools:\n  access_cost:\n    roots: [lib]\n")), ["lib"]);
    deepStrictEqual(costRoots(LAYOUT), []);
    deepStrictEqual(costRoots(null), []);
  });
});

describe("measureAccessCost", () => {
  it("is not computed when the crew wires no index", async () => {
    deepStrictEqual(await measureAccessCost(undefined, LAYOUT, ["src", "tests"], CHANGED), COST_NOT_WIRED);
  });

  it("refreshes then measures the changed production files, flagging a loop on an added line", async () => {
    const index = new FakeCostIndex();
    index.report = LOOP;
    const cost = await measureAccessCost(index, LAYOUT, ["src", "tests"], CHANGED);
    deepStrictEqual(index.calls, ["roots", "refresh /workspace /workspace/src/order.ts", "accessCost /workspace/src/order.ts"]);
    strictEqual(cost.state === "measured" && cost.exit, 2);
    deepStrictEqual(cost.state === "measured" && cost.flagged, ["src/order.ts::place L5 this.store.save in a loop"]);
  });

  it("says not indexed, and calls neither the refresh nor access_cost, without a /workspace root", async () => {
    const index = new FakeCostIndex();
    index.indexed = [];
    strictEqual(reasonOf(await measureAccessCost(index, LAYOUT, ["src"], CHANGED)).startsWith("not indexed — the code index is empty"), true);
    index.indexed = ["/elsewhere"];
    strictEqual(reasonOf(await measureAccessCost(index, LAYOUT, ["src"], CHANGED)).includes("holds /elsewhere, not /workspace"), true);
    deepStrictEqual(index.calls, ["roots", "roots"]);
    index.indexed = ["/workspace/"];
    strictEqual(reasonOf(await measureAccessCost(index, LAYOUT, ["src"], CHANGED)), "measured exit 0");
  });

  it("measures nothing, with no call, when no changed file is under the pack's roots", async () => {
    const index = new FakeCostIndex();
    const cost = await measureAccessCost(index, pack("tools:\n  access_cost:\n    roots: [lib]\n"), ["src", "tests"], CHANGED);
    strictEqual(cost.state === "measured" && cost.detail, "no changed file under lib\n");
    deepStrictEqual(index.calls, []);
  });

  it("measures every changed file but the tests without roots, a co-located test included", async () => {
    const index = new FakeCostIndex();
    await measureAccessCost(index, null, [], [...CHANGED, { path: "src/tools/run.ts", added: null }, { path: "src/order.test.ts", added: null }]);
    strictEqual(index.calls[2], "accessCost /workspace/src/order.ts,/workspace/src/tools/run.ts");
  });

  it("adds the pack's receivers to the default", async () => {
    const index = new FakeCostIndex();
    await measureAccessCost(index, pack("layout:\n  domain: src\ntools:\n  access_cost:\n    receivers: _fs\n"), ["src"], CHANGED);
    strictEqual(index.calls[2], `accessCost /workspace/src/order.ts (?i)(?:${DEFAULT_RECEIVERS})|(?:_fs)`);
  });

  it("is not computed when a call fails or the tool reports errors", async () => {
    const failing = (set: (i: FakeCostIndex) => void) => { const i = new FakeCostIndex(); set(i); return measureAccessCost(i, LAYOUT, ["src"], CHANGED); };
    strictEqual(reasonOf(await failing((i) => { i.failure.roots = new Error("status down\nmore"); })),
      "index_status failed (status down); judge the Cost axis from the diff");
    strictEqual(reasonOf(await failing((i) => { i.failure.refresh = new Error("reindex down"); })),
      "incremental_reindex failed (reindex down); judge the Cost axis from the diff");
    strictEqual(reasonOf(await failing((i) => { i.refreshErrors = ["parse error"]; })),
      "incremental_reindex: parse error; judge the Cost axis from the diff");
    strictEqual(reasonOf(await failing((i) => { i.failure.accessCost = new Error("cost down"); })),
      "access_cost failed (cost down); judge the Cost axis from the diff");
    strictEqual(reasonOf(await failing((i) => { i.errors = ["Provide fqns or changed_files"]; })),
      "access_cost: Provide fqns or changed_files; judge the Cost axis from the diff");
    strictEqual(reasonOf(await failing((i) => { i.report = null; })),
      "access_cost returned no readable report; judge the Cost axis from the diff");
  });
});
