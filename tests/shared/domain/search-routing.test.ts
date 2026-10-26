// Search routing by file type (tree vs rag). Run:
//   node --test tests/shared/domain/search-routing.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  TREE_CODE_EXTENSIONS, RAG_DOCUMENT_EXTENSIONS, WORKSPACE_DOCS_COLLECTION,
  extensionOf, routeForPath, hasRagLoader, describeSearchRouting,
} from "../../../src/shared/domain/search-routing.ts";
import {
  ADAPTER_EXTENSIONS, EXTENSION_CASES, LOADER_CASES, ROUTE_GROUPS, UPPER_CASE_ROUTES,
} from "./search-routing.fixtures.ts";
import { assertHoldsEvery } from "./search-routing.assertions.ts";
import { assertMentions } from "../../support/assertions/text.ts";

describe("the extension partition", () => {
  it("mirrors the thirteen Tree-sitter adapters exactly", () => {
    // Arrange
    const adapters = ADAPTER_EXTENSIONS;

    // Act
    const extensions = TREE_CODE_EXTENSIONS;

    // Assert
    strictEqual(extensions.length, 23);
    assertHoldsEvery(extensions, adapters);
  });

  it("keeps the two sides disjoint", () => {
    // An extension in both lists would make the routing rule ambiguous — the whole
    // point is that each file has ONE right tool.
    // Arrange
    const rag = RAG_DOCUMENT_EXTENSIONS;

    // Act
    const inBoth = TREE_CODE_EXTENSIONS.filter((ext) => rag.includes(ext));

    // Assert
    deepStrictEqual(inBoth, [], `${inBoth.join(", ")} in both lists`);
  });
});

describe("routeForPath", () => {
  for (const group of ROUTE_GROUPS) {
    for (const p of group.paths) {
      it(`${group.name}: ${p}`, () => {
        // Arrange
        const path = p;

        // Act
        const route = routeForPath(path);

        // Assert
        strictEqual(route, group.route, p);
      });
    }
  }

  for (const c of UPPER_CASE_ROUTES) {
    it(`is case-insensitive on the extension: ${c.path}`, () => {
      // Arrange
      const { path } = c;

      // Act
      const route = routeForPath(path);

      // Assert
      strictEqual(route, c.route);
    });
  }
});

describe("extensionOf", () => {
  for (const c of EXTENSION_CASES) {
    it(`${c.name}: ${c.path}`, () => {
      // Arrange
      const { path } = c;

      // Act
      const extension = extensionOf(path);

      // Assert
      strictEqual(extension, c.extension);
    });
  }
});

describe("hasRagLoader", () => {
  for (const c of LOADER_CASES) {
    it(`true for declared loader extensions, false for the rest: ${c.path}`, () => {
      // Arrange
      const { path } = c;

      // Act
      const has = hasRagLoader(path);

      // Assert
      strictEqual(has, c.has);
    });
  }
});

describe("describeSearchRouting — the playbook renders THIS", () => {
  it("names both tools, the collection, and the self-healing ingest path", () => {
    // Arrange
    const parts = [
      "codebase_search", "rag_search", WORKSPACE_DOCS_COLLECTION, "rag_ingest",
      // The one instruction that stops the wrong-tool retry loop:
      "do not retry there",
      // The ingest example names the files to ingest, not only Markdown.
      "globs of those files",
    ];

    // Act
    const text = describeSearchRouting();

    // Assert
    assertMentions(text, parts);
  });
});
