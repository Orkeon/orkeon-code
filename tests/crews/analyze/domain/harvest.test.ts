// /analyze — harvest rendering tests, on the payload shapes captured live
// 2026-08-06 (see docs/b14-codeintel-probe-transcript.md) and at the pin. Run:
//   node --test tests/crews/analyze/domain/harvest.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  MAX_ENTRY_PACKAGES, MAX_EXPORTS_PER_PACKAGE, MAX_LISTED_PACKAGES, displayFqn, edgeEndpointToPath, entryPackages,
  isTestPackage, packageCycles, rankExports, rankPackages, renderHarvest, selectPackages, SYNTHESIS_SYSTEM,
  buildSynthesisUser,
} from "../../../../src/crews/analyze/domain/harvest.ts";
import {
  CYCLIC, CYCLIC_CYCLES, DISPLAY_CASES, ENDPOINTS, EXPORTS_IN_INDEX_ORDER, EXPORTS_RANKED, HOSTED, HOSTED_ENTRIES,
  L1_ENTRIES, L1_RANKED, MODULE_GRAPH, PACKAGE, SAMPLED_GRAPH, TEST_PACKAGE_CASES, mapPackages, packageExporting,
  rankedWithSmallHost, readPackage,
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

describe("displayFqn", () => {
  for (const c of DISPLAY_CASES) {
    it(c.name, () => {
      // Arrange
      const { fqn } = c;

      // Act
      const shown = displayFqn(fqn);

      // Assert
      strictEqual(shown, c.shown);
    });
  }
});

describe("entryPackages", () => {
  it("keeps the code packages with an entry module that no package of code depends on, tests aside", () => {
    // Arrange
    const scanned = HOSTED;

    // Act
    const entries = entryPackages(scanned);

    // Assert
    deepStrictEqual(entries.map((p) => p.fqn), HOSTED_ENTRIES);
  });
});

describe("selectPackages", () => {
  it("keeps a small entry package among the largest ones", () => {
    // Arrange
    const { ranked, scanned } = rankedWithSmallHost(20);

    // Act
    const selected = selectPackages(ranked, scanned, 15);

    // Assert
    deepStrictEqual(selected, [...ranked.slice(0, 14), ranked[19]].map((p) => p.fqn));
  });

  it(`keeps ${MAX_ENTRY_PACKAGES} entry packages at most before the largest`, () => {
    // Arrange
    const scanned = Array.from({ length: 10 }, (_, i) => readPackage(`h${i}`, [], i >= 3));
    const ranked = scanned.map((p) => ({ fqn: p.fqn, name: p.name, kind: "package", children: 1 }));

    // Act
    const selected = selectPackages(ranked, scanned, 8);

    // Assert
    deepStrictEqual(selected, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ranked[i].fqn));
  });
});

describe("packageCycles", () => {
  it("names each cycle between the packages read, outside packages ignored", () => {
    // Arrange
    const scanned = CYCLIC;

    // Act
    const cycles = packageCycles(scanned);

    // Assert
    deepStrictEqual(cycles, CYCLIC_CYCLES);
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
    const input = { packages: [PACKAGE], unsummarized: [], scanned: [], moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [
      "## Packages (1 in the index; 1 summarized: the entry packages, then the largest, test packages last; 6 symbol(s) in them)",
      "### `workspace` — 3 file(s), 6 symbol(s)",
      "Entry points: `src/index.ts`",
      "Public exports (2 of the 2 the index returned):\n- `src/types.ts::Order`\n- `src/types.ts::Order.total`",
    ]);
  });

  it("renders module edges as paths, never as node IDs", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["- src/index.ts → src/math.ts"]);
    assertOmits(harvest, ["#module@"]);
  });

  it(`lists ${MAX_EXPORTS_PER_PACKAGE} exports of a package at most, and says how many it returned`, () => {
    // Arrange
    const input = { packages: [packageExporting(50)], unsummarized: [], scanned: [], moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [`Public exports (${MAX_EXPORTS_PER_PACKAGE} of the 50 the index returned)`, "/w/f19.ts::S19"]);
    assertOmits(harvest, ["/w/f20.ts::S20"]);
  });

  it("names the packages not summarized, with their modules, and counts them in the total", () => {
    // Arrange
    const input = { packages: [PACKAGE], unsummarized: mapPackages(2), scanned: [], moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["(3 in the index;", "## Other packages (not summarized)\n- `/w/p0` — 4 module(s)\n- `/w/p1`"]);
  });

  it("says the index holds at least the packages counted when the map reached the entries it was asked for", () => {
    // Arrange
    const input = { packages: [PACKAGE], unsummarized: mapPackages(4), scanned: [], moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 5 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["## Packages (at least 5 in the index;"]);
  });

  it(`names ${MAX_LISTED_PACKAGES} packages not summarized at most, and says how many it left out`, () => {
    // Arrange
    const input = { packages: [], unsummarized: mapPackages(MAX_LISTED_PACKAGES + 5), scanned: [], moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [`… 5 more package(s) omitted (cap ${MAX_LISTED_PACKAGES}).`]);
    assertOmits(harvest, [`/w/p${MAX_LISTED_PACKAGES}\``]);
  });

  it("says the module graph is a sample when it reached the modules it was asked for", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: SAMPLED_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["A sample: the first 200 modules in the index's order, not the whole graph"]);
  });

  it("leaves the edges of a sampled module graph out", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: SAMPLED_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertOmits(harvest, ["src/index.ts → "]);
  });

  it("says nothing of a sample when the module graph is below its cap", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertOmits(harvest, ["A sample"]);
  });

  it("flags the cycles of the whole module graph, and says the index does not name their modules", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: { ...MODULE_GRAPH, cycleCount: 2 }, graphCap: 200, mapCap: 1000 };

    // Act
    const cyclic = renderHarvest(input);

    // Assert
    assertMentions(cyclic, ["Cycles in the whole module graph: 2 ⚠ — the index counts them, it does not name their modules."]);
  });

  it("lists the entry packages with their entry modules", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: HOSTED, moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["## Entry packages (L1)", "- `Cli` — `src/Cli/Program.cs`\n- `Tool` — `src/Tool/Program.cs`"]);
  });

  it("lists the dependencies of every package read", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: HOSTED, moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["## Package dependencies (L1)", "- `Api` → `Core`\n- `Cli` → `Core`, `Api`", "No cycle between packages."]);
  });

  it("names the cycles between packages as risks", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: CYCLIC, moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["2 cycle(s) between packages ⚠:\n- `A` → `B` → `C` → `A`\n- `E` → `F` → `E`"]);
  });

  it("says which packages were not read for their dependencies and entry points", () => {
    // Arrange
    const input = { packages: [], unsummarized: mapPackages(3), scanned: HOSTED.slice(0, 2), moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["Read from the 2 largest packages; the 1 other(s) were not read"]);
  });

  it("gives the edge count of a sampled module graph apart from the cycles of the whole graph", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: { ...SAMPLED_GRAPH, edgeCount: 260, cycleCount: 8 }, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["260 edge(s) between them, left out", "Cycles in the whole module graph: 8 ⚠"]);
  });

  it("says the paths are relative to the checkout", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [`Paths are relative to the checkout (${WORKSPACE})`]);
  });
});

describe("the synthesis prompts", () => {
  it("the system prompt forbids inventing symbols and demands citations as the harvest writes them", () => {
    // Arrange
    const required = ["ONLY from the harvest", "as the harvest writes them"];

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

  it("asks for the entry packages and the members of each cycle", () => {
    // Arrange
    const harvest = "X";

    // Act
    const user = buildSynthesisUser(harvest);

    // Assert
    assertMentions(user, ["the entry packages of the harvest", "naming its members when the harvest does"]);
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
