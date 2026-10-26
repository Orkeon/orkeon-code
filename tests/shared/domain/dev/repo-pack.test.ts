// Unit tests for the repository pack reader. Run:
//   node --test tests/shared/domain/dev/repo-pack.test.ts
// tests/fixtures/dev/repo-orkeon.yaml is a copy of the workshop's repo-orkeon pack
// (orkeon-workshop 6873ee2, packs/repo-orkeon/references/repo.yaml); the values pinned
// below are the ones PyYAML 6.0 gives on it (see yaml-subset.test.ts).
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { REPO_PACK_KEYS, missingPackKeyLine, packValue, parseRepoPack } from "../../../../src/shared/domain/dev/repo-pack.ts";
import {
  CLEAN_LAYOUTS, EXPECTED, ORKEON_LAYOUT, PACK_VALUE_CASES, REFUSED_DOCUMENTS, TRAIT_PATTERN_REFUSALS, orkeonPack, parsed,
} from "./repo-pack.fixtures.ts";

describe("REPO_PACK_KEYS", () => {
  it("lists the 23 keys in the order of the design", () => {
    // Arrange
    const expected = Object.keys(EXPECTED);

    // Act
    const keys = [...REPO_PACK_KEYS];

    // Assert
    deepStrictEqual(keys, expected);
  });
});

describe("parseRepoPack on repo-orkeon.yaml", () => {
  it("reports no issue", () => {
    // Arrange
    const text = orkeonPack;

    // Act
    const { issues } = parsed(text);

    // Assert
    deepStrictEqual(issues, []);
  });

  for (const key of REPO_PACK_KEYS) {
    it(`reads ${key}`, () => {
      // Arrange
      const { pack } = parsed(orkeonPack);

      // Act
      const value = packValue(pack, key);

      // Assert
      deepStrictEqual(value, EXPECTED[key]);
    });
  }

  it("maps the keys to camel-case fields", () => {
    // Arrange
    const text = orkeonPack;

    // Act
    const { pack } = parsed(text);

    // Assert
    deepStrictEqual(pack.layout, ORKEON_LAYOUT);
    strictEqual(pack.commands.testClass, EXPECTED["commands.test_class"]);
    strictEqual(pack.tests.traitPattern, undefined);
    deepStrictEqual(pack.accessCost.roots, ["src"]);
    strictEqual(pack.contrib.prTemplate, ".github/PULL_REQUEST_TEMPLATE.md");
  });

  it("keeps the untyped keys in the document", () => {
    // Arrange
    const text = orkeonPack;

    // Act
    const { pack } = parsed(text);

    // Assert
    const layout = pack.document.layout as Record<string, unknown>;
    strictEqual(layout.worktree_gb, 30);
    const coverage = (pack.document.commands as Record<string, unknown>).coverage as string;
    strictEqual(coverage.startsWith("T=\"${XDG_CACHE_HOME:-$HOME/.cache}/quality-tools\"; { test -x"), true);
    strictEqual(coverage.endsWith("\"-assemblyfilters:-*.Tests;-Orkeon.Tests.Shared;-Orkeon.Examples*\""), true);
    strictEqual(coverage.includes("\n") || coverage.includes("  "), false);
  });
});

describe("parseRepoPack field types", () => {
  it("reads tests.trait_pattern when it is set", () => {
    // Arrange
    const text = "tests:\n  trait_pattern: '# rule <id>'\n";

    // Act
    const { pack } = parsed(text);

    // Assert
    strictEqual(pack.tests.traitPattern, "# rule <id>");
  });

  it("reads one string as a one-element list", () => {
    // Arrange
    const text = "tools:\n  access_cost:\n    roots: src\n";

    // Act
    const { pack } = parsed(text);

    // Assert
    deepStrictEqual(pack.accessCost.roots, ["src"]);
  });

  it("turns numbers and booleans into strings, and null into absent", () => {
    // Arrange
    const text = "tests:\n  rule_trait: 7\ncontrib:\n  branch: true\n  commit: ~\n";

    // Act
    const { pack } = parsed(text);

    // Assert
    strictEqual(pack.tests.ruleTrait, "7");
    strictEqual(pack.contrib.branch, "true");
    strictEqual(pack.contrib.commit, undefined);
  });

  it("reports a section of the wrong type and leaves its fields unset", () => {
    // Arrange
    const text = "commands: [a]\n";

    // Act
    const { pack, issues } = parsed(text);

    // Assert
    deepStrictEqual(issues, [{ key: "commands", message: "expected a mapping, found a list" }]);
    strictEqual(pack.commands.test, undefined);
  });

  it("reports a field of the wrong type and leaves it unset", () => {
    // Arrange
    const text = "commands:\n  test: [a]\n  build:\n    x: y\nlayout:\n  shared:\n    a: b\n";

    // Act
    const { pack, issues } = parsed(text);

    // Assert
    deepStrictEqual(issues, [
      { key: "layout.shared", message: "expected a list of strings, found a mapping" },
      { key: "commands.build", message: "expected a string, found a mapping" },
      { key: "commands.test", message: "expected a string, found a list" },
    ]);
    strictEqual(pack.commands.test, undefined);
    deepStrictEqual(pack.layout.shared, []);
  });

  it("reports a layout.tests that is also a source root, and keeps it: the test author and the implementer would both be refused it", () => {
    // Arrange
    const text = "layout:\n  domain: ./src/\n  tests: src\n";

    // Act
    const { pack, issues } = parsed(text);

    // Assert
    deepStrictEqual(issues, [{
      key: "layout.tests",
      message: "'src' is also layout.domain: the test author and the implementer would both be refused that folder; " +
        "drop layout.tests and name the test files with layout.test_files (\"src/*.test.ts\")",
    }]);
    strictEqual(pack.layout.tests, "src");
  });

  for (const text of CLEAN_LAYOUTS) {
    it(`reports no layout whose tests are no source root: ${JSON.stringify(text)}`, () => {
      // Arrange
      const yaml = text;

      // Act
      const { issues } = parsed(yaml);

      // Assert
      deepStrictEqual(issues, []);
    });
  }

  it("never reports an unknown key", () => {
    // Arrange
    const text = "product: X\nextra:\n  - 1\n";

    // Act
    const { pack, issues } = parsed(text);

    // Assert
    deepStrictEqual(issues, []);
    deepStrictEqual(pack.document, { product: "X", extra: [1] });
  });

  for (const [text, expected] of REFUSED_DOCUMENTS) {
    it(`refuses a document that is not a mapping, and keeps a YAML error: ${JSON.stringify(text)}`, () => {
      // Arrange
      const yaml = text;

      // Act
      const r = parseRepoPack(yaml);

      // Assert
      deepStrictEqual(r, expected);
    });
  }
});

describe("packValue", () => {
  for (const [key, expected] of PACK_VALUE_CASES) {
    it(`is undefined for an absent key, an absent list and a key outside the list: ${key}`, () => {
      // Arrange
      const { pack } = parsed("layout:\n  domain: d\n");

      // Act
      const value = packValue(pack, key);

      // Assert
      strictEqual(value, expected);
    });
  }

  it("gives an empty list the document writes as []", () => {
    // Arrange
    const { pack } = parsed("layout:\n  shared: []\n");

    // Act
    const value = packValue(pack, "layout.shared");

    // Assert
    deepStrictEqual(value, []);
  });
});

describe("missingPackKeyLine", () => {
  it("names the pack shown", () => {
    // Arrange
    const pack = ".orkeon/repo.yaml";

    // Act
    const line = missingPackKeyLine("commands.test", pack);

    // Assert
    strictEqual(line, "the repository pack .orkeon/repo.yaml has no commands.test: add it there");
  });

  it("says where to add the key when there is no pack", () => {
    // Arrange
    const pack = null;

    // Act
    const line = missingPackKeyLine("commands.test", pack);

    // Assert
    strictEqual(line, "no repository pack: add commands.test to .orkeon/repo.yaml");
  });
});

describe("parseRepoPack trait keys", () => {
  it("reports a bad tests.rule_trait and leaves it unset", () => {
    // Arrange
    const text = "tests:\n  rule_trait: 'B R'\n";

    // Act
    const { pack, issues } = parsed(text);

    // Assert
    deepStrictEqual(issues, [{ key: "tests.rule_trait", message: "a trait name takes letters, digits, '_' and '-'" }]);
    strictEqual(pack.tests.ruleTrait, undefined);
  });

  for (const [yaml, message] of TRAIT_PATTERN_REFUSALS) {
    it(`reports tests.trait_pattern ${yaml}: ${message}`, () => {
      // Arrange
      const text = `tests:\n  rule_trait: BR\n  trait_pattern: ${yaml}\n`;

      // Act
      const { pack, issues } = parsed(text);

      // Assert
      deepStrictEqual(issues, [{ key: "tests.trait_pattern", message }]);
      strictEqual(pack.tests.traitPattern, undefined);
      strictEqual(pack.tests.ruleTrait, "BR");
    });
  }

  it("reports <name> without tests.rule_trait", () => {
    // Arrange
    const text = "tests:\n  trait_pattern: '// <name>: <id>'\n";

    // Act
    const { pack, issues } = parsed(text);

    // Assert
    deepStrictEqual(issues, [{ key: "tests.trait_pattern", message: "<name> needs tests.rule_trait" }]);
    strictEqual(pack.tests.traitPattern, undefined);
  });

  it("reports <name> when tests.rule_trait was refused", () => {
    // Arrange
    const text = "tests:\n  rule_trait: 'a b'\n  trait_pattern: '// <name>: <id>'\n";

    // Act
    const { issues } = parsed(text);

    // Assert
    deepStrictEqual(issues.map((i) => i.message), [
      "a trait name takes letters, digits, '_' and '-'", "<name> needs tests.rule_trait",
    ]);
  });

  it("keeps a valid Node pattern", () => {
    // Arrange
    const text = "tests:\n  rule_trait: rule\n  trait_pattern: '// <name>: <id>'\n";

    // Act
    const { pack, issues } = parsed(text);

    // Assert
    deepStrictEqual(issues, []);
    deepStrictEqual(pack.tests, { ruleTrait: "rule", traitPattern: "// <name>: <id>" });
  });
});
