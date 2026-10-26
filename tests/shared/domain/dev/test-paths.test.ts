// Which paths are tests, by the pack. Run:
//   node --test src/shared/domain/dev/test-paths.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { hasTestLayout, isTestPath, relativePath } from "../../../../src/shared/domain/dev/test-paths.ts";
import { HAS_TEST_LAYOUT_CASES, TEST_PATH_CASES } from "./test-paths.fixtures.ts";

describe("isTestPath", () => {
  for (const c of TEST_PATH_CASES) {
    it(c.name, () => {
      // Arrange
      const { path, layout } = c;

      // Act
      const result = isTestPath(path, layout);

      // Assert
      strictEqual(result, c.expected);
    });
  }

  for (const c of HAS_TEST_LAYOUT_CASES) {
    it(c.name, () => {
      // Arrange
      const { layout } = c;

      // Act
      const result = hasTestLayout(layout);

      // Assert
      strictEqual(result, c.expected);
    });
  }

  it("drops the leading ./ and the trailing slash", () => {
    // Arrange
    const path = "./a/b/";

    // Act
    const result = relativePath(path);

    // Assert
    strictEqual(result, "a/b");
  });
});
