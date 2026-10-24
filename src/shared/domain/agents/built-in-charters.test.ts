// The built-in charters run as children of the dev steps (A-3). Run:
//   node --test src/shared/domain/agents/built-in-charters.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { BUILT_IN_CHARTERS, builtInCharter, builtInCharterRows, repairStep } from "./built-in-charters.ts";

describe("built-in charters", () => {
  it("the reviewer belongs to /dev-plan, the auditor to /dev-verify", () => {
    strictEqual(builtInCharter("dev-reviewer")?.step, "dev-plan");
    strictEqual(builtInCharter("dev-auditor")?.step, "dev-verify");
    strictEqual(builtInCharter("tester"), undefined);
  });

  it("a repair runs under the step of the instance's run, else the charter's, else dev-plan's", () => {
    strictEqual(repairStep("dev-reviewer", "dev-spec"), "dev-spec");
    strictEqual(repairStep("dev-reviewer", "dev-change"), "dev-change");
    strictEqual(repairStep("dev-auditor", undefined), "dev-verify");
    strictEqual(repairStep("dev-reviewer", "dev-implement"), "dev-plan");
    strictEqual(repairStep("tester", 3), "dev-plan");
  });

  it("gives /agents one row each", () => {
    const rows = builtInCharterRows();
    deepStrictEqual(rows.map((r) => [r.name, r.kind]), BUILT_IN_CHARTERS.map((c) => [c.name, "charter (built-in)"]));
    strictEqual(rows[0].detail, "Adversarial reviewer — runs as a background child of /dev-spec, /dev-change, /dev-plan; /tasks lists, stops and repairs it");
  });
});
