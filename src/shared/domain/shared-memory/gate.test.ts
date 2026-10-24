// The shared memory's write gate (M-4). Run: node --test src/shared/domain/shared-memory/gate.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import { MISTAKE_MIN_BATCHES, admissionProblem, asksConfirmation, sourceKind } from "./gate.ts";

describe("the write gate", () => {
  it("reads the kind of a source", () => {
    strictEqual(sourceKind("audit:shop/SHOP-VERIFY-F1.md"), "audit");
    strictEqual(sourceKind("human:2026-10-22 memory_push"), "human");
    strictEqual(sourceKind("verdict:plan"), "verdict");
    strictEqual(sourceKind("someone: else"), undefined);
    strictEqual(sourceKind("audit:"), undefined);
  });

  it("lets a human admit any type, an audit a structure or a mistake, a verdict a method or a decision", () => {
    for (const type of ["decision", "code-structure", "method", "mistake"] as const) {
      strictEqual(admissionProblem({ type, source: "human:2026-10-22 x" }), undefined);
    }
    strictEqual(admissionProblem({ type: "mistake", source: "audit:a/A-VERIFY-F1.md" }), undefined);
    strictEqual(admissionProblem({ type: "code-structure", source: "audit:a/A-VERIFY-F1.md" }), undefined);
    ok(admissionProblem({ type: "decision", source: "audit:a/A-VERIFY-F1.md" })?.includes("not decision"));
    strictEqual(admissionProblem({ type: "method", source: "verdict:plan" }), undefined);
    ok(admissionProblem({ type: "mistake", source: "verdict:plan" })?.includes("method or decision"));
    ok(admissionProblem({ type: "method", source: "a guess" })?.includes("not verdict:"));
  });

  it("asks the operator unless an audit backs the candidate and auto-admission is on", () => {
    strictEqual(asksConfirmation({ source: "audit:a/A-VERIFY-F1.md" }, true), false);
    strictEqual(asksConfirmation({ source: "audit:a/A-VERIFY-F1.md" }, false), true);
    strictEqual(asksConfirmation({ source: "human:2026-10-22 x" }, true), true);
    strictEqual(asksConfirmation({ source: "verdict:plan" }, true), true);
  });

  it("harvests a mistake from three batches", () => strictEqual(MISTAKE_MIN_BATCHES, 3));
});
