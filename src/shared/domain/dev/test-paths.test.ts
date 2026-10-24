// Which paths are tests, by the pack. Run:
//   node --test src/shared/domain/dev/test-paths.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { hasTestLayout, isTestPath, relativePath } from "./test-paths.ts";

describe("isTestPath", () => {
  it("reads the test folder and the test file patterns, in either path form", () => {
    const layout = { tests: "tests/", testFiles: ["src/*.test.ts"] };
    strictEqual(isTestPath("tests/a.ts", layout), true);
    strictEqual(isTestPath("/workspace/src/x/a.test.ts", layout), true);
    strictEqual(isTestPath("src/x/a.ts", layout), false);
    strictEqual(isTestPath("tests2/a.ts", layout), false);
    strictEqual(isTestPath("src/a.ts", { tests: "" }), false);
  });
  it("says whether the pack names any test at all", () => {
    strictEqual(hasTestLayout({ tests: " " }), false);
    strictEqual(hasTestLayout({ testFiles: ["*.spec.ts"] }), true);
    strictEqual(relativePath("./a/b/"), "a/b");
  });
});
