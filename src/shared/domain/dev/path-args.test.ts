// A relative path of a tool call resolved under the project. Run:
//   node --test src/shared/domain/dev/path-args.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { resolvePathInput, resolvedPath } from "./path-args.ts";
import { RESOLVE_CASES } from "./path-args.fixtures.ts";
import { WORKSPACE } from "../vfs.ts";

describe("resolvePathInput", () => {
  for (const c of RESOLVE_CASES) {
    it(c.name, () => {
      // Arrange
      const { tool, input, base } = c;

      // Act
      const resolved = resolvePathInput(tool, input, base);

      // Assert
      deepStrictEqual(resolved, c.expected);
    });
  }

  it("leaves the input it was given untouched", () => {
    // Arrange
    const input = { path: "src/a.ts" };

    // Act
    resolvePathInput("file_read", input);

    // Assert
    deepStrictEqual(input, { path: "src/a.ts" });
  });
});

describe("resolvedPath", () => {
  it("puts a relative path under the checkout by default", () => {
    // Arrange
    const path = "src/a.ts";

    // Act
    const resolved = resolvedPath(path);

    // Assert
    strictEqual(resolved, `${WORKSPACE}/src/a.ts`);
  });
});
