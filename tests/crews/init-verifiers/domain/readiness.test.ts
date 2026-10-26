// Run: node --test tests/crews/init-verifiers/domain/readiness.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { safeZoneName, fallbackReadiness } from "../../../../src/crews/init-verifiers/domain/readiness.ts";
import { ZONE_NAMES } from "./readiness.fixtures.ts";

describe("safeZoneName", () => {
  for (const c of ZONE_NAMES) {
    it(`slugifies to lowercase-dashes: ${c.name}`, () => {
      // Arrange
      const { zone } = c;

      // Act
      const safe = safeZoneName(zone);

      // Assert
      strictEqual(safe, c.safe);
    });
  }
});

describe("fallbackReadiness", () => {
  it("flags a unit-tests gap when package.json has no test script", () => {
    // Arrange
    const pkg = JSON.stringify({ scripts: { build: "tsc" } });

    // Act
    const r = fallbackReadiness(pkg);

    // Assert
    deepStrictEqual(r.zonesNeedingVerifier, ["unit-tests"]);
    deepStrictEqual(r.appTypes, ["library"]);
  });

  it("reports no gap when a test script exists", () => {
    // Arrange
    const pkg = JSON.stringify({ scripts: { test: "vitest" } });

    // Act
    const r = fallbackReadiness(pkg);

    // Assert
    deepStrictEqual(r.zonesNeedingVerifier, []);
  });

  it("reports nothing for an absent package.json", () => {
    // Arrange
    const pkg = "";

    // Act
    const r = fallbackReadiness(pkg);

    // Assert
    deepStrictEqual(r.appTypes, []);
    deepStrictEqual(r.zonesNeedingVerifier, []);
  });
});
