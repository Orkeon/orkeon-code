// The close's grouping of the files per layer. Run:
//   node --test src/crews/dev-implement/application/close.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import { layersOf, workBranchName } from "./close.ts";

describe("layersOf", () => {
  it("groups the paths under the pack's roots, the rest last", () => {
    const parsed = parseRepoPack("layout:\n  domain: src/domain\n  tests: tests\n");
    if (!parsed.ok) throw new Error("pack");
    deepStrictEqual(layersOf(parsed.pack, ["tests/a.test.ts", "src/domain/a.ts", "README.md"]), [
      { layer: "domain", paths: ["src/domain/a.ts"] },
      { layer: "tests", paths: ["tests/a.test.ts"] },
      { layer: "other", paths: ["README.md"] },
    ]);
  });
});

describe("workBranchName", () => {
  it("takes the pattern's first alternative before the slash, then <code>-f<n>", () => {
    strictEqual(workBranchName("feature|fix/<slug>", "demo", "F2"), "feature/demo-f2");
    strictEqual(workBranchName("feat/<slug>", "demo", "F1"), "feat/demo-f1");
    strictEqual(workBranchName("<slug>", "demo", "F1"), null);
  });
});
