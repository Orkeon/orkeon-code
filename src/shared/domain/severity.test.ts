// Unit tests for severity ordering + dedup/rank. Run:
//   node --test src/shared/domain/severity.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { severityRank, findingDedupKey, dedupAndRank } from "./severity.ts";
import type { Finding } from "./types.ts";

const f = (over: Partial<Finding>): Finding => ({
  severity: "low", file: "a.ts", line: 1, finding: "x", ...over,
});

describe("severityRank", () => {
  it("orders blocker<high<medium<low<nit", () => {
    strictEqual(severityRank("blocker") < severityRank("high"), true);
    strictEqual(severityRank("low") < severityRank("nit"), true);
  });
  it("is case-insensitive", () => {
    strictEqual(severityRank("HIGH"), severityRank("high"));
  });
  it("sorts unknown severities last", () => {
    strictEqual(severityRank("weird") > severityRank("nit"), true);
  });
});

describe("findingDedupKey", () => {
  it("keys on file+line+first40 of finding", () => {
    strictEqual(findingDedupKey(f({ file: "x.ts", line: 9, finding: "boom" })), "x.ts:9:boom");
  });
});

describe("dedupAndRank", () => {
  it("drops duplicates across lenses and ranks by severity", () => {
    const out = dedupAndRank([
      { lens: "style", findings: [f({ severity: "nit", finding: "naming" })] },
      { lens: "security", findings: [f({ severity: "blocker", file: "b.ts", finding: "sqli" })] },
      { lens: "correctness", findings: [f({ severity: "nit", finding: "naming" })] }, // dup of #1
    ]);
    strictEqual(out.length, 2);
    strictEqual(out[0].severity, "blocker");          // ranked first
    strictEqual(out[1].finding, "naming");
  });
  it("attaches the surfacing lens", () => {
    const out = dedupAndRank([{ lens: "security", findings: [f({})] }]);
    strictEqual(out[0].lens, "security");
  });
  it("returns [] for no findings", () => {
    deepStrictEqual(dedupAndRank([{ lens: "x", findings: [] }]), []);
  });
});
