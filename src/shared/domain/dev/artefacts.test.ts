// Dev artefact names. Run:
//   node --test src/shared/domain/dev/artefacts.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { classifyArtefact, compareBatchIds, isCode, CODE_PATTERN } from "./artefacts.ts";

describe("classifyArtefact", () => {
  it("names every kind, with its prefix and batch", () => {
    deepStrictEqual(classifyArtefact("SPEC-demo.md"), { kind: "spec", name: "SPEC-demo.md", prefix: "demo" });
    deepStrictEqual(classifyArtefact("CHANGE-fix-7.md"), { kind: "change", name: "CHANGE-fix-7.md", prefix: "fix-7" });
    deepStrictEqual(classifyArtefact("DEMO-PLAN.md"), { kind: "plan", name: "DEMO-PLAN.md", prefix: "DEMO" });
    deepStrictEqual(classifyArtefact("DEMO-VERIFY-F2.md"),
      { kind: "verdict", name: "DEMO-VERIFY-F2.md", prefix: "DEMO", batch: "F2" });
    deepStrictEqual(classifyArtefact("STUDIO-71-BATCHES-STATE.md"),
      { kind: "batches-state", name: "STUDIO-71-BATCHES-STATE.md", prefix: "STUDIO-71" });
  });

  it("reads DEMO-PLAN-F1.md as a sheet, never as a plan", () => {
    deepStrictEqual(classifyArtefact("DEMO-PLAN-F1.md"),
      { kind: "sheet", name: "DEMO-PLAN-F1.md", prefix: "DEMO", batch: "F1" });
  });

  it("returns null for anything else", () => {
    for (const n of ["PLAN.md", "notes.md", "DEMO-PLAN.txt", "-PLAN.md", "DEMO-VERIFY-1.md", "DEMO-PLAN-Fx.md"]) {
      strictEqual(classifyArtefact(n), null, n);
    }
  });
});

describe("isCode", () => {
  it("accepts plain folder names", () => {
    for (const c of ["demo", "STUDIO-71", "a.b_c"]) strictEqual(isCode(c), true, c);
  });
  it("refuses paths, a leading dash and a double dot", () => {
    for (const c of ["../x", "a/b", "-x", "a..b", "", ".hidden"]) strictEqual(isCode(c), false, c);
  });
  it("exports the pattern it applies", () => {
    strictEqual(CODE_PATTERN.test("a..b"), true); // the pattern alone lets it through; isCode does not
  });
});

describe("compareBatchIds", () => {
  it("orders by number, F2 before F10, non-F ids last by text", () => {
    deepStrictEqual(["F10", "zeta", "F2", "alpha", "F1"].sort(compareBatchIds), ["F1", "F2", "F10", "alpha", "zeta"]);
    strictEqual(compareBatchIds("F2", "F10") < 0, true);
    strictEqual(compareBatchIds("F3", "F3"), 0);
  });
});
