// The tree snapshot between two acts. Run:
//   node --test src/crews/dev-implement/application/observe.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { contentHash, MAX_SNAPSHOT_PATHS, snapshot } from "./observe.ts";
import { statusShell, WIDE_STATUS, workspaceWithA } from "./observe.fixtures.ts";

describe("snapshot", () => {
  it("hashes each changed path, and marks a deleted one absent", async () => {
    // Arrange
    const shell = statusShell({ stdout: " M src/a.ts\n D src/gone.ts\n" });
    const files = workspaceWithA();

    // Act
    const r = await snapshot({ shell, files });

    // Assert
    deepStrictEqual(r, { ok: true, snapshot: new Map([["src/a.ts", contentHash("x")], ["src/gone.ts", "absent"]]) });
  });

  it("keeps the paths alone of a tree dirtier than it can read", async () => {
    // Arrange
    const shell = statusShell({ stdout: WIDE_STATUS });

    // Act
    const wide = await snapshot({ shell, files: new FakeFiles() });

    // Assert
    strictEqual(wide.ok && wide.snapshot.size === MAX_SNAPSHOT_PATHS + 1 && wide.snapshot.get("f0") === null, true);
  });

  it("refuses a status that fails", async () => {
    // Arrange
    const shell = statusShell({ exitCode: 128 });

    // Act
    const r = await snapshot({ shell, files: new FakeFiles() });

    // Assert
    strictEqual(r.ok, false);
  });

  it("tells two contents apart", () => {
    // Arrange
    const [first, second] = ["ab", "ba"];

    // Act
    const same = contentHash(first) === contentHash(second);

    // Assert
    strictEqual(same, false);
  });
});
