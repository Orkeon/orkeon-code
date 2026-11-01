// Run: node --test tests/crews/project-init/domain/package-map.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { MAX_MAP_PACKAGES, MAX_PACKAGE_MAP_CHARS, renderPackageMap } from "../../../../src/crews/project-init/domain/package-map.ts";
import { EMPTY_GRAPH, ENTRIES, RENDERED, manyPackages, packageGraph } from "./package-map.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("renderPackageMap", () => {
  it("writes one line per package, the largest first, with the packages it depends on", () => {
    // Arrange
    const graph = packageGraph();

    // Act
    const map = renderPackageMap(ENTRIES, graph);

    // Assert
    strictEqual(map, RENDERED);
  });

  it("writes nothing when the index holds no package", () => {
    // Arrange
    const graph = packageGraph();

    // Act
    const map = renderPackageMap([], graph);

    // Assert
    strictEqual(map, "");
  });

  it(`stops at ${MAX_PACKAGE_MAP_CHARS} characters and marks the cut`, () => {
    // Arrange
    const entries = manyPackages(200);

    // Act
    const map = renderPackageMap(entries, EMPTY_GRAPH);

    // Assert
    ok(map.length <= MAX_PACKAGE_MAP_CHARS + 80, `${map.length} characters`);
    assertMentions(map, ["characters of the package map not shown …]"]);
  });

  it(`says the map shows at most ${MAX_MAP_PACKAGES} packages when it holds that many`, () => {
    // Arrange
    const entries = manyPackages(MAX_MAP_PACKAGES);

    // Act
    const map = renderPackageMap(entries, EMPTY_GRAPH);

    // Assert
    assertMentions(map, [`${MAX_MAP_PACKAGES} package(s), the map shows at most ${MAX_MAP_PACKAGES} packages, each`]);
  });
});
