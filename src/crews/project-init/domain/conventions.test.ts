// Run: node_modules/.bin/tsx --test crews/project-init/domain/conventions.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { fallbackConventions, CONFIG_CANDIDATES } from "./conventions.ts";

describe("CONFIG_CANDIDATES", () => {
  it("reads package.json first", () => {
    strictEqual(CONFIG_CANDIDATES[0], "package.json");
  });
});

describe("fallbackConventions", () => {
  it("pulls scripts + devDependencies from package.json", () => {
    const pkg = JSON.stringify({
      scripts: { build: "tsc", test: "vitest", lint: "eslint ." },
      devDependencies: { vitest: "1", typescript: "5" },
    });
    const c = fallbackConventions(pkg);
    strictEqual(c.buildCommand, "tsc");
    strictEqual(c.testCommand, "vitest");
    strictEqual(c.lintCommand, "eslint .");
    deepStrictEqual(c.frameworks, ["vitest", "typescript"]);
  });
  it("returns empty conventions on unparseable input", () => {
    deepStrictEqual(fallbackConventions("{not json"), { frameworks: [], conventions: [] });
  });
  it("tolerates a package.json with no scripts", () => {
    const c = fallbackConventions("{}");
    strictEqual(c.buildCommand, undefined);
    deepStrictEqual(c.frameworks, []);
  });
});
