// The CLI metadata of commands/_lib/status/meta.ts (/status's version row and the pin check). Run:
//   node --test tests/commands/_lib/status/meta.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { isPinnedCommit } from "../../../../src/commands/_lib/status/meta.ts";
import { META_SOURCE, PINNED_COMMIT_CASES } from "./meta.fixtures.ts";

describe("B-11 audit — the metadata that had gone stale", () => {
  it("no longer claims to mirror the framework version", () => {
    // Arrange
    // meta.ts said it mirrored src/Directory.Build.props while that file read
    // 0.9.2-beta. The two version independently; the header now says so.
    const path = META_SOURCE;

    // Act
    const src = readFileSync(path, "utf-8");

    // Assert
    strictEqual(/Version mirrors src\/Directory\.Build\.props/.test(src), false);
  });
});

describe("isPinnedCommit", () => {
  for (const c of PINNED_COMMIT_CASES) {
    it(c.name, () => {
      // Arrange
      const commit = c.commit;

      // Act
      const pinned = isPinnedCommit(commit);

      // Assert
      strictEqual(pinned, c.pinned);
    });
  }
});
