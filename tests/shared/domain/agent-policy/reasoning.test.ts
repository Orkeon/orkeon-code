// What is read of the runtime's answers about a model's reasoning (shared/domain/agent-policy/reasoning.ts). Run:
//   node --test tests/shared/domain/agent-policy/reasoning.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { capabilitiesOf, effortReportOf } from "../../../../src/shared/domain/agent-policy/reasoning.ts";
import { CAPABILITIES_CASES, REPORT_CASES } from "./reasoning.fixtures.ts";

describe("capabilitiesOf", () => {
  for (const c of CAPABILITIES_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const capabilities = capabilitiesOf(raw);

      // Assert
      deepStrictEqual(capabilities, c.expected);
    });
  }
});

describe("effortReportOf", () => {
  for (const c of REPORT_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const report = effortReportOf(raw);

      // Assert
      deepStrictEqual(report, c.expected);
    });
  }
});
