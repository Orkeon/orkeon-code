// /analyze — harvest rendering tests, on the payload shapes captured live
// 2026-08-06 (see docs/b14-codeintel-probe-transcript.md) and at the pin. Run:
//   node --test tests/crews/analyze/domain/harvest.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  MAX_EXPORTS_PER_PACKAGE, MAX_LISTED_PACKAGES, edgeEndpointToPath, isTestPackage, rankExports, rankPackages,
  renderHarvest, SYNTHESIS_SYSTEM, buildSynthesisUser,
} from "../../../../src/crews/analyze/domain/harvest.ts";
import {
  ENDPOINTS, EXPORTS_IN_INDEX_ORDER, EXPORTS_RANKED, L1_ENTRIES, L1_RANKED, MODULE_GRAPH, PACKAGE, SAMPLED_GRAPH,
  TEST_PACKAGE_CASES, mapPackages, packageExporting,
} from "./harvest.fixtures.ts";
import { assertMentions, assertOmits } from "../../../support/assertions/text.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("edgeEndpointToPath", () => {
  for (const c of ENDPOINTS) {
    it(c.name, () => {
      // Arrange
      const { endpoint } = c;

      // Act
      const path = edgeEndpointToPath(endpoint);

      // Assert
      strictEqual(path, c.path);
    });
  }
});

describe("isTestPackage", () => {
  for (const c of TEST_PACKAGE_CASES) {
    it(`tells ${c.name} ${c.test ? "is" : "is not"} a package of tests`, () => {
      // Arrange
      const { name } = c;

      // Act
      const test = isTestPackage(name);

      // Assert
      strictEqual(test, c.test);
    });
  }
});

describe("rankPackages", () => {
  it("puts the code before the tests, the largest first, the index's order between equals", () => {
    // Arrange
    const entries = L1_ENTRIES;

    // Act
    const ranked = rankPackages(entries);

    // Assert
    deepStrictEqual(ranked.map((p) => p.fqn), L1_RANKED);
  });
});

describe("rankExports", () => {
  it("lists the types and functions before their members, the index's order within a depth", () => {
    // Arrange
    const exports = EXPORTS_IN_INDEX_ORDER;

    // Act
    const ranked = rankExports(exports);

    // Assert
    deepStrictEqual(ranked, EXPORTS_RANKED);
  });
});

describe("renderHarvest", () => {
  it("renders a summarized package with its size, entry points and exports, types first", () => {
    // Arrange
    const input = { packages: [PACKAGE], unsummarized: [], moduleGraph: MODULE_GRAPH, graphCap: 200 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [
      "## Packages (1 in the index; the 1 largest summarized, test packages last; 6 symbol(s) in them)",
      `### \`${WORKSPACE}::workspace\` — 3 file(s), 6 symbol(s)`,
      `Entry points: \`${WORKSPACE}/src/index.ts\``,
      `Public exports (2 of the 2 the index returned):\n- \`${WORKSPACE}/src/types.ts::Order\`\n- \`${WORKSPACE}/src/types.ts::Order.total\``,
    ]);
  });

  it("renders module edges as paths, never as node IDs", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], moduleGraph: MODULE_GRAPH, graphCap: 200 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [`- ${WORKSPACE}/src/index.ts → ${WORKSPACE}/src/math.ts`]);
    assertOmits(harvest, ["#module@"]);
  });

  it(`lists ${MAX_EXPORTS_PER_PACKAGE} exports of a package at most, and says how many it returned`, () => {
    // Arrange
    const input = { packages: [packageExporting(50)], unsummarized: [], moduleGraph: MODULE_GRAPH, graphCap: 200 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [`Public exports (${MAX_EXPORTS_PER_PACKAGE} of the 50 the index returned)`, "/w/f19.ts::S19"]);
    assertOmits(harvest, ["/w/f20.ts::S20"]);
  });

  it("names the packages not summarized, with their modules, and counts them in the total", () => {
    // Arrange
    const input = { packages: [PACKAGE], unsummarized: mapPackages(2), moduleGraph: MODULE_GRAPH, graphCap: 200 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["(3 in the index;", "## Other packages (not summarized)\n- `/w/p0` — 4 module(s)\n- `/w/p1`"]);
  });

  it(`names ${MAX_LISTED_PACKAGES} packages not summarized at most, and says how many it left out`, () => {
    // Arrange
    const input = { packages: [], unsummarized: mapPackages(MAX_LISTED_PACKAGES + 5), moduleGraph: MODULE_GRAPH, graphCap: 200 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [`… 5 more package(s) omitted (cap ${MAX_LISTED_PACKAGES}).`]);
    assertOmits(harvest, [`/w/p${MAX_LISTED_PACKAGES}\``]);
  });

  it("says the module graph is a sample when it reached the modules it was asked for", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], moduleGraph: SAMPLED_GRAPH, graphCap: 200 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["A sample: the first 200 modules in the index's order, not the whole graph"]);
  });

  it("leaves the edges of a sampled module graph out", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], moduleGraph: SAMPLED_GRAPH, graphCap: 200 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertOmits(harvest, [`${WORKSPACE}/src/index.ts → `]);
  });

  it("says nothing of a sample when the module graph is below its cap", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], moduleGraph: MODULE_GRAPH, graphCap: 200 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertOmits(harvest, ["A sample"]);
  });

  it("flags cycles — the one graph finding that is always a risk", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], moduleGraph: { ...MODULE_GRAPH, cycleCount: 2 }, graphCap: 200 };

    // Act
    const cyclic = renderHarvest(input);

    // Assert
    assertMentions(cyclic, ["2 cycle(s) ⚠"]);
  });
});

describe("the synthesis prompts", () => {
  it("the system prompt forbids inventing symbols and demands FQN citations", () => {
    // Arrange
    const required = ["ONLY from the harvest", "FQN"];

    // Act
    const system = SYNTHESIS_SYSTEM;

    // Assert
    assertMentions(system, required);
  });

  it("the user body carries the ask THEN the harvest", () => {
    // Arrange
    const harvest = "# Codebase analysis harvest\nX";

    // Act
    const user = buildSynthesisUser(harvest);

    // Assert
    ok(user.includes("business/domain objects"));
    ok(user.indexOf("business/domain objects") < user.indexOf("# Codebase analysis harvest"));
    ok(user.endsWith("<harvest>\n# Codebase analysis harvest\nX\n</harvest>"), "the harvest is material");
  });

  it("asks to say what the harvest does not hold rather than fill it", () => {
    // Arrange
    const harvest = "X";

    // Act
    const user = buildSynthesisUser(harvest);

    // Assert
    ok(user.includes("not in the harvest"));
  });

  it("asks to mark inferences", () => {
    // Arrange
    const required = ["word an inference as one"];

    // Act
    const system = SYNTHESIS_SYSTEM;

    // Assert
    assertMentions(system, required);
  });
});
