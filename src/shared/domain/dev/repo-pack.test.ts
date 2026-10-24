// Unit tests for the repository pack reader. Run:
//   node --test src/shared/domain/dev/repo-pack.test.ts
// tests/fixtures/dev/repo-orkeon.yaml is a copy of the workshop's repo-orkeon pack
// (orkeon-workshop 6873ee2, packs/repo-orkeon/references/repo.yaml); the values pinned
// below are the ones PyYAML 6.0 gives on it (see yaml-subset.test.ts).
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { REPO_PACK_KEYS, missingPackKeyLine, packValue, parseRepoPack } from "./repo-pack.ts";
import type { RepoPack, RepoPackIssue } from "./repo-pack.ts";

const orkeonPack = readFileSync(new URL("../../../../tests/fixtures/dev/repo-orkeon.yaml", import.meta.url), "utf8");

function parsed(text: string): { pack: RepoPack; issues: RepoPackIssue[] } {
  const r = parseRepoPack(text);
  if (!r.ok) throw new Error(`refused: ${r.error.line}: ${r.error.message}`);
  return r;
}

const FILTER_FAST = "--filter \"Category!=Integration&Category!=Slow\"";
const EXPECTED: Record<string, string | string[] | undefined> = {
  "layout.domain": "src/core/Orkeon.Domain",
  "layout.application": "src/core/Orkeon.Application",
  "layout.infrastructure": "src/core/Orkeon.Infrastructure",
  "layout.tests": "tests",
  "layout.work": "backstage/tasks",
  "layout.build_outputs": ["bin", "obj"],
  "layout.shared": ["packages"],
  "commands.restore": "dotnet restore Orkeon.sln -p:NuGetAudit=false",
  "commands.build": "dotnet build Orkeon.sln -c Release --no-restore -warnaserror",
  "commands.build_test": "dotnet build <test project> -c Release --no-restore",
  "commands.test_class": "dotnet test <test project> -c Release --no-build --filter \"FullyQualifiedName~<Class>\"",
  "commands.test": `dotnet test Orkeon.sln -c Release --no-build ${FILTER_FAST}`,
  "commands.test_project": `dotnet test <test project> -c Release --no-build ${FILTER_FAST} -- --ignore-exit-code 8`,
  "commands.test_integration": "dotnet test Orkeon.sln -c Release --no-build --filter \"Category=Integration|Category=Slow\" -- --ignore-exit-code 8",
  "commands.cli": "dotnet run --project src/scripting/Orkeon.Scripting.Cli --",
  "tests.rule_trait": "BR",
  "tests.trait_pattern": undefined,
  "tools.access_cost.receivers": "toolInvocation|checkpoint|coordinator|orchestrator|shortTerm|longTerm|llm|embedding|a2a|eventHub",
  "tools.access_cost.roots": ["src"],
  "contrib.branch": "feature|fix|chore/<slug>",
  "contrib.commit": "type(scope): summary",
  "contrib.pr_template": ".github/PULL_REQUEST_TEMPLATE.md",
};

describe("REPO_PACK_KEYS", () => {
  it("lists the 22 keys in the order of the design", () => {
    deepStrictEqual([...REPO_PACK_KEYS], Object.keys(EXPECTED));
  });
});

describe("parseRepoPack on repo-orkeon.yaml", () => {
  const { pack, issues } = parsed(orkeonPack);
  it("reports no issue", () => deepStrictEqual(issues, []));
  for (const key of REPO_PACK_KEYS) {
    it(`reads ${key}`, () => deepStrictEqual(packValue(pack, key), EXPECTED[key]));
  }
  it("maps the keys to camel-case fields", () => {
    deepStrictEqual(pack.layout, {
      domain: "src/core/Orkeon.Domain", application: "src/core/Orkeon.Application",
      infrastructure: "src/core/Orkeon.Infrastructure", tests: "tests", work: "backstage/tasks",
      shared: ["packages"], buildOutputs: ["bin", "obj"],
    });
    strictEqual(pack.commands.testClass, EXPECTED["commands.test_class"]);
    strictEqual(pack.tests.traitPattern, undefined);
    deepStrictEqual(pack.accessCost.roots, ["src"]);
    strictEqual(pack.contrib.prTemplate, ".github/PULL_REQUEST_TEMPLATE.md");
  });
  it("keeps the untyped keys in the document", () => {
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
    strictEqual(parsed("tests:\n  trait_pattern: '# rule <id>'\n").pack.tests.traitPattern, "# rule <id>");
  });
  it("reads one string as a one-element list", () => {
    deepStrictEqual(parsed("tools:\n  access_cost:\n    roots: src\n").pack.accessCost.roots, ["src"]);
  });
  it("turns numbers and booleans into strings, and null into absent", () => {
    const { pack } = parsed("tests:\n  rule_trait: 7\ncontrib:\n  branch: true\n  commit: ~\n");
    strictEqual(pack.tests.ruleTrait, "7");
    strictEqual(pack.contrib.branch, "true");
    strictEqual(pack.contrib.commit, undefined);
  });
  it("reports a section of the wrong type and leaves its fields unset", () => {
    const { pack, issues } = parsed("commands: [a]\n");
    deepStrictEqual(issues, [{ key: "commands", message: "expected a mapping, found a list" }]);
    strictEqual(pack.commands.test, undefined);
  });
  it("reports a field of the wrong type and leaves it unset", () => {
    const { pack, issues } = parsed("commands:\n  test: [a]\n  build:\n    x: y\nlayout:\n  shared:\n    a: b\n");
    deepStrictEqual(issues, [
      { key: "layout.shared", message: "expected a list of strings, found a mapping" },
      { key: "commands.build", message: "expected a string, found a mapping" },
      { key: "commands.test", message: "expected a string, found a list" },
    ]);
    strictEqual(pack.commands.test, undefined);
    deepStrictEqual(pack.layout.shared, []);
  });
  it("never reports an unknown key", () => {
    const { pack, issues } = parsed("product: X\nextra:\n  - 1\n");
    deepStrictEqual(issues, []);
    deepStrictEqual(pack.document, { product: "X", extra: [1] });
  });
  it("refuses a document that is not a mapping, and keeps a YAML error", () => {
    deepStrictEqual(parseRepoPack("- a\n"), { ok: false, error: { line: 1, message: "the pack is not a mapping" } });
    deepStrictEqual(parseRepoPack(""), { ok: false, error: { line: 1, message: "the pack is not a mapping" } });
    deepStrictEqual(parseRepoPack("a: 1\na: 2\n"), { ok: false, error: { line: 2, message: "a duplicate key 'a'" } });
  });
});

describe("packValue", () => {
  it("is undefined for an absent key, an absent list and a key outside the list", () => {
    const { pack } = parsed("layout:\n  domain: d\n");
    strictEqual(packValue(pack, "layout.domain"), "d");
    strictEqual(packValue(pack, "layout.work"), undefined);
    strictEqual(packValue(pack, "layout.shared"), undefined);
    strictEqual(packValue(pack, "release.tag"), undefined);
  });
  it("gives an empty list the document writes as []", () => {
    deepStrictEqual(packValue(parsed("layout:\n  shared: []\n").pack, "layout.shared"), []);
  });
});

describe("missingPackKeyLine", () => {
  it("names the pack shown", () => {
    strictEqual(missingPackKeyLine("commands.test", ".orkeon/repo.yaml"),
      "the repository pack .orkeon/repo.yaml has no commands.test: add it there");
  });
  it("says where to add the key when there is no pack", () => {
    strictEqual(missingPackKeyLine("commands.test", null), "no repository pack: add commands.test to .orkeon/repo.yaml");
  });
});

describe("parseRepoPack trait keys", () => {
  it("reports a bad tests.rule_trait and leaves it unset", () => {
    const { pack, issues } = parsed("tests:\n  rule_trait: 'B R'\n");
    deepStrictEqual(issues, [{ key: "tests.rule_trait", message: "a trait name takes letters, digits, '_' and '-'" }]);
    strictEqual(pack.tests.ruleTrait, undefined);
  });
  const refusals: Array<[string, string]> = [
    ["'  '", "the pattern is empty"],
    [`'${"x".repeat(81)}<id>'`, "the pattern is longer than 80 characters"],
    ['"a\\t<id>"', "a tab or a line break is not allowed"],
    ["\"it's <id>\"", "a single quote is not allowed"],
    ["'rule BR-01'", "the pattern must hold <id> exactly once"],
    ["'<name> <name> <id>'", "the pattern may hold <name> once at most"],
    ["'<x> <id>'", "'<' and '>' may only enclose <id> and <name>"],
    ["'# <id>'", "the pattern needs at least two characters around <id>"],
  ];
  for (const [yaml, message] of refusals) {
    it(`reports tests.trait_pattern ${yaml}: ${message}`, () => {
      const { pack, issues } = parsed(`tests:\n  rule_trait: BR\n  trait_pattern: ${yaml}\n`);
      deepStrictEqual(issues, [{ key: "tests.trait_pattern", message }]);
      strictEqual(pack.tests.traitPattern, undefined);
      strictEqual(pack.tests.ruleTrait, "BR");
    });
  }
  it("reports <name> without tests.rule_trait", () => {
    const { pack, issues } = parsed("tests:\n  trait_pattern: '// <name>: <id>'\n");
    deepStrictEqual(issues, [{ key: "tests.trait_pattern", message: "<name> needs tests.rule_trait" }]);
    strictEqual(pack.tests.traitPattern, undefined);
  });
  it("reports <name> when tests.rule_trait was refused", () => {
    const { issues } = parsed("tests:\n  rule_trait: 'a b'\n  trait_pattern: '// <name>: <id>'\n");
    deepStrictEqual(issues.map((i) => i.message), [
      "a trait name takes letters, digits, '_' and '-'", "<name> needs tests.rule_trait",
    ]);
  });
  it("keeps a valid Node pattern", () => {
    const { pack, issues } = parsed("tests:\n  rule_trait: rule\n  trait_pattern: '// <name>: <id>'\n");
    deepStrictEqual(issues, []);
    deepStrictEqual(pack.tests, { ruleTrait: "rule", traitPattern: "// <name>: <id>" });
  });
});
