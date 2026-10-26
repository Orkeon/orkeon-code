// The mount of the VFS: a path made relative to the checkout. Run:
//   node --test tests/shared/domain/vfs.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { workspaceRelative } from "../../../src/shared/domain/vfs.ts";
import { RELATIVE_CASES } from "./vfs.fixtures.ts";

describe("workspaceRelative", () => {
  for (const c of RELATIVE_CASES) {
    it(c.name, () => {
      // Arrange
      const { path } = c;

      // Act
      const relative = workspaceRelative(path);

      // Assert
      strictEqual(relative, c.expected);
    });
  }
});
