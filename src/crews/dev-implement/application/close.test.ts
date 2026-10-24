// The close's grouping of the files per layer. Run:
//   node --test src/crews/dev-implement/application/close.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import { layersOf } from "./close.ts";

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
