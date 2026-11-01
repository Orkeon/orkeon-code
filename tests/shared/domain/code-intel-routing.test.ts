// Which code-intel tool answers which question. Run:
//   node --test tests/shared/domain/code-intel-routing.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { describeCodeIntelRouting } from "../../../src/shared/domain/code-intel-routing.ts";
import { CODE_INTEL_PARAMS } from "../../../src/shared/domain/code-intel-contract.ts";
import { TOOL_ARGUMENTS } from "../../../src/shared/domain/agent-policy/permission.ts";
import {
  ALL_ROUTED_TOOLS, NO_ANALYSIS_TOOLS, PARTIAL_LISTS, PERMISSION_PINNED_PARAMS, ROUTED_PARAMS, SINGLE_TOOL_CASES,
} from "./code-intel-routing.fixtures.ts";
import { assertNamesOnlyGivenTools } from "./code-intel-routing.assertions.ts";
import { assertMentions, assertOmits } from "../../support/assertions/text.ts";

describe("describeCodeIntelRouting", () => {
  for (const c of SINGLE_TOOL_CASES) {
    it(`spells out the call of a tool given alone: ${c.tool}`, () => {
      // Arrange
      const tools = [c.tool];

      // Act
      const text = describeCodeIntelRouting(tools);

      // Assert
      assertMentions(text, c.mentions);
    });
  }

  for (const c of PARTIAL_LISTS) {
    it(`names no analysis tool the agent lacks: ${c.name}`, () => {
      // Arrange
      const tools = c.tools;

      // Act
      const text = describeCodeIntelRouting(tools);

      // Assert
      assertNamesOnlyGivenTools(text, tools, ALL_ROUTED_TOOLS);
    });
  }

  it("is empty for an agent without an analysis tool", () => {
    // Arrange
    const tools = NO_ANALYSIS_TOOLS;

    // Act
    const text = describeCodeIntelRouting(tools);

    // Assert
    strictEqual(text, "");
  });

  it("calls a truncated result a sample and forbids the script over every file", () => {
    // Arrange
    const tools = ["structural_search"];

    // Act
    const text = describeCodeIntelRouting(tools);

    // Assert
    assertMentions(text, ["`truncated` is a sample", "say so in the answer", "rather than writing a script"]);
  });

  it("leaves the exhaustiveness rule out when no tool of the agent cuts its answer", () => {
    // Arrange
    const tools = ["symbol_detail", "impact_analysis"];

    // Act
    const text = describeCodeIntelRouting(tools);

    // Assert
    assertOmits(text, ["truncated"]);
  });

  it("holds no digit, so the cached header stays free of numbers", () => {
    // Arrange
    const tools = ALL_ROUTED_TOOLS;

    // Act
    const text = describeCodeIntelRouting(tools).replace(/L[123]_(Package|Module|Symbol)/g, "");

    // Assert
    strictEqual(/\d/.test(text), false, text);
  });

  for (const c of PERMISSION_PINNED_PARAMS) {
    it(`spells only the arguments the permission list knows: ${c.tool}`, () => {
      // Arrange
      const known: readonly string[] = TOOL_ARGUMENTS[c.tool] ?? [];

      // Act
      const missing = c.params.filter((param) => !known.includes(param));

      // Assert
      strictEqual(missing.join(", "), "", `${c.tool} lacks a known argument`);
    });
  }

  for (const c of ROUTED_PARAMS) {
    it(`spells only the parameters the contract pins: ${c.tool}`, () => {
      // Arrange
      const pinned: readonly string[] = CODE_INTEL_PARAMS[c.tool as keyof typeof CODE_INTEL_PARAMS];

      // Act
      const missing = c.params.filter((param) => !pinned.includes(param));

      // Assert
      strictEqual(missing.join(", "), "", `${c.tool} lacks a pinned parameter`);
    });
  }
});
