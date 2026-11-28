// /analyze — harvest rendering tests, on the payload shapes captured live
// 2026-08-06 (see docs/b14-codeintel-probe-transcript.md) and at the pin. Run:
//   node --test tests/crews/analyze/domain/harvest.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  MAX_ENTRY_PACKAGES, MAX_EXPORTS_PER_PACKAGE, MAX_LISTED_PACKAGES, displayFqn, edgeEndpointToPath, entryPackages,
  isTestPackage, packageCycles, rankExports, rankPackages, renderHarvest, selectPackages, startsProcess,
  buildSynthesisUser, MAX_SYNTHESIS_CONCEPTS,
} from "../../../../src/crews/analyze/domain/harvest.ts";
import { SYNTHESIS_SYSTEM } from "../../../../src/crews/analyze/domain/prompts.ts";
import {
  CYCLIC, CYCLIC_CYCLES, DISPLAY_CASES, ENDPOINTS, EXPORTS_IN_INDEX_ORDER, EXPORTS_RANKED, HOSTED, HOSTED_ENTRIES,
  L1_ENTRIES, L1_RANKED, MODULE_GRAPH, NAMED_CYCLES_GRAPH, PACKAGE, SAMPLED_GRAPH, TEST_PACKAGE_CASES, mapPackages, packageExporting,
  rankedWithSmallHost, readPackage,
  HOSTS, HOSTS_ENTRIES, PROCESS_CASES, harvestAcrossRepositories, rankedAcrossRepositories,
} from "./harvest.fixtures.ts";
import { assertBefore, assertMentions, assertOmits } from "../../../support/assertions/text.ts";
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

  it("keeps a package that starts a process when only packages that start one depend on it, and drops one a library depends on", () => {
    // Arrange
    const scanned = HOSTS;

    // Act
    const entries = entryPackages(scanned);

    // Assert
    deepStrictEqual(entries.map((p) => p.fqn), HOSTS_ENTRIES);
  });
});

describe("startsProcess", () => {
  for (const c of PROCESS_CASES) {
    it(c.name, () => {
      // Arrange
      const pkg = readPackage("P", [], c.module);

      // Act
      const starts = startsProcess(pkg);

      // Assert
      strictEqual(starts, c.starts);
    });
  }
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

describe("selectPackages over several repositories", () => {
  it("gives each repository its turn, its entry package first, so that the largest does not fill the summaries alone", () => {
    // Arrange
    const { ranked, scanned, repositories } = rankedAcrossRepositories();

    // Act
    const selected = selectPackages(ranked, scanned, 6, repositories);

    // Assert
    deepStrictEqual(selected, ["big0", "big1", "big2", "small0", "small1", "small2"].map((n) => `${WORKSPACE}::${n}`));
  });

  it("takes a package in no repository only once the repositories are through", () => {
    // Arrange
    const { ranked, scanned, repositories } = rankedAcrossRepositories();

    // Act
    const selected = selectPackages(ranked, scanned, 13, repositories);

    // Assert
    deepStrictEqual(selected, ranked.filter((p) => p.name !== "loose").map((p) => p.fqn));
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

  it("flags the cycles of the whole module graph, and says the index does not name their modules, on a runtime that only counts them", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: { ...MODULE_GRAPH, cycleCount: 2 }, graphCap: 200, mapCap: 1000 };

    // Act
    const cyclic = renderHarvest(input);

    // Assert
    assertMentions(cyclic, ["Cycles in the whole module graph: 2 ⚠ — the index counts them, it does not name their modules."]);
  });

  it("names the modules of each cycle of the module graph, the largest first (Orkeon #272)", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: NAMED_CYCLES_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["- 4 modules: `src/a.ts`, `src/b.ts`, `src/c.ts`, and 1 more\n- 2 modules: `src/d.ts`, `src/e.ts`"]);
  });

  it("says how many of the module cycles are named when the index cut their list", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: NAMED_CYCLES_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["Cycles in the whole module graph: 5 ⚠ (the 2 largest named):"]);
  });

  it("names the module cycles of a sampled graph too, since they cover the whole graph", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: [], moduleGraph: { ...NAMED_CYCLES_GRAPH, nodeCount: 200 }, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["A sample: the first 200 modules", "- 2 modules: `src/d.ts`, `src/e.ts`"]);
  });

  it("lists the entry packages with their entry modules", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: HOSTED, moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["## Entry packages (L1)", "- `Cli` — `src/Cli/index.ts`\n- `Tool` — `src/Tool/index.ts`"]);
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

describe("renderHarvest over several repositories", () => {
  it("names each repository with the packages read and summarized in it, and the packages in none", () => {
    // Arrange
    const input = harvestAcrossRepositories();

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [
      "## Repositories\nThe checkout is no repository itself: 2 of its top folders are",
      "- `api` — 2 package(s) read, 1 summarized\n- `platform` — 2 package(s) read, 0 summarized\n" +
      "- In no single repository: `convert`",
    ]);
  });

  it("lists what crosses from a repository to another, package by package", () => {
    // Arrange
    const input = harvestAcrossRepositories();

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [
      "## Dependencies between repositories",
      "- `api` → `platform`: `Api` → `Platform.Sdk`, `Platform.Models`; `Api.Tests` → `Platform.Sdk`",
    ]);
  });

  it("says so when nothing crosses between the repositories", () => {
    // Arrange
    const input = { ...harvestAcrossRepositories(), scanned: [readPackage("Api"), readPackage("Platform.Sdk")] };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["No package of a repository depends on a package of another."]);
  });

  it("names the repository of a package summarized, of an entry package and of a package only listed", () => {
    // Arrange
    const input = harvestAcrossRepositories();

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, [
      "### `Api` (repository `api`) — 2 file(s), 4 symbol(s)",
      "- `Api` (repository `api`) — `src/Api/Program.cs`",
      "- `Platform.Sdk` (repository `platform`) — 3 module(s)",
      "- `convert` — 3 module(s)",
    ]);
  });

  it("puts the repositories before the packages", () => {
    // Arrange
    const input = harvestAcrossRepositories();

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertBefore(harvest, "## Dependencies between repositories", "## Packages (");
  });

  it("says nothing of repositories in an ordinary checkout", () => {
    // Arrange
    const input = { ...harvestAcrossRepositories(), repositories: new Map<string, string>() };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertOmits(harvest, ["## Repositories", "## Dependencies between repositories", "(repository"]);
  });

  it("says a package that starts a process stays an entry package under the packages that start one too", () => {
    // Arrange
    const input = { packages: [], unsummarized: [], scanned: HOSTS, moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000 };

    // Act
    const harvest = renderHarvest(input);

    // Assert
    assertMentions(harvest, ["one with a main or program module stays an entry package when only packages that have one too depend on it"]);
  });
});

describe("the synthesis prompts", () => {
  it("asks for the repository of each concept and entry package, and a line per dependency between repositories", () => {
    // Arrange
    const harvest = "X";

    // Act
    const user = buildSynthesisUser(harvest);

    // Assert
    assertMentions(user, [
      "When the harvest lists repositories, name the repository of each concept and of each entry package",
      "one line per dependency between repositories, naming the packages that carry it",
      "say so when the harvest shows none",
    ]);
  });

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

  it("bounds each part of the synthesis to a line per item, so a large harvest still fits a screen", () => {
    // Arrange
    const harvest = "X";

    // Act
    const user = buildSynthesisUser(harvest);

    // Assert
    assertMentions(user, [
      "fits on one screen",
      `one line per concept, at most about ${MAX_SYNTHESIS_CONCEPTS} concepts, those with the most symbols first`,
      "one line per dependency group and one line per cycle",
      "one line per entry package",
    ]);
  });

  it("ends with the language to write in when the session sets one", () => {
    // Arrange
    const harvest = "X";

    // Act
    const user = buildSynthesisUser(harvest, "French");

    // Assert
    ok(user.endsWith("</harvest>\n\nWrite the analysis in French, and \"not in the harvest\" in French too."), "the language closes the ask");
  });

  it("asks for the not-in-the-harvest note in the session's language", () => {
    // Arrange
    const harvest = "X";

    // Act
    const user = buildSynthesisUser(harvest, "French");

    // Assert
    assertMentions(user, ["\"not in the harvest\" in French too"]);
  });

  it("names no language when the session sets none", () => {
    // Arrange
    const harvest = "X";

    // Act
    const user = buildSynthesisUser(harvest);

    // Assert
    assertOmits(user, ["Write the analysis in"]);
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
