// Run: node --test src/crews/init-verifiers/domain/readiness.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { safeZoneName, fallbackReadiness } from "./readiness.ts";

describe("safeZoneName", () => {
  it("slugifies to lowercase-dashes", () => {
    strictEqual(safeZoneName("Unit Tests (API)"), "unit-tests-api-");
    strictEqual(safeZoneName("e2e"), "e2e");
  });
});

describe("fallbackReadiness", () => {
  it("flags a unit-tests gap when package.json has no test script", () => {
    const r = fallbackReadiness(JSON.stringify({ scripts: { build: "tsc" } }));
    deepStrictEqual(r.zonesNeedingVerifier, ["unit-tests"]);
    deepStrictEqual(r.appTypes, ["library"]);
  });
  it("reports no gap when a test script exists", () => {
    const r = fallbackReadiness(JSON.stringify({ scripts: { test: "vitest" } }));
    deepStrictEqual(r.zonesNeedingVerifier, []);
  });
  it("reports nothing for an absent package.json", () => {
    const r = fallbackReadiness("");
    deepStrictEqual(r.appTypes, []);
    deepStrictEqual(r.zonesNeedingVerifier, []);
  });
});
