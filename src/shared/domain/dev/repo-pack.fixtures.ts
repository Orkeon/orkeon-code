// The pack texts and the values the repository pack reader is tested on.
// tests/fixtures/dev/repo-orkeon.yaml is a copy of the workshop's repo-orkeon pack
// (orkeon-workshop 6873ee2, packs/repo-orkeon/references/repo.yaml); the values pinned
// below are the ones PyYAML 6.0 gives on it (see yaml-subset.test.ts).
import { readFileSync } from "node:fs";

import { parseRepoPack } from "./repo-pack.ts";
import type { RepoPack, RepoPackIssue, RepoPackParse } from "./repo-pack.ts";

export const orkeonPack = readFileSync(new URL("../../../../tests/fixtures/dev/repo-orkeon.yaml", import.meta.url), "utf8");

/** The pack and issues `text` reads as; throws on a refusal. */
export function parsed(text: string): { pack: RepoPack; issues: RepoPackIssue[] } {
  const r = parseRepoPack(text);
  if (!r.ok) throw new Error(`refused: ${r.error.line}: ${r.error.message}`);
  return r;
}

const FILTER_FAST = "--filter \"Category!=Integration&Category!=Slow\"";

/** Each key of repo-orkeon.yaml, in the order of the design, and its value. */
export const EXPECTED: Record<string, string | string[] | undefined> = {
  "layout.domain": "src/core/Orkeon.Domain",
  "layout.application": "src/core/Orkeon.Application",
  "layout.infrastructure": "src/core/Orkeon.Infrastructure",
  "layout.tests": "tests",
  "layout.work": "backstage/tasks",
  "layout.build_outputs": ["bin", "obj"],
  "layout.shared": ["packages"],
  "layout.test_files": undefined,
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

/** The layout of repo-orkeon.yaml, in camel-case fields. */
export const ORKEON_LAYOUT = {
  domain: "src/core/Orkeon.Domain", application: "src/core/Orkeon.Application",
  infrastructure: "src/core/Orkeon.Infrastructure", tests: "tests", work: "backstage/tasks",
  shared: ["packages"], buildOutputs: ["bin", "obj"], testFiles: [],
};

/** Layouts whose tests are no source root. */
export const CLEAN_LAYOUTS: readonly string[] = [
  "layout:\n  domain: src\n  test_files: [\"src/*.test.ts\"]\n",
  "layout:\n  domain: src\n  tests: src-tests\n",
];

/** Documents the reader refuses, and its refusal. */
export const REFUSED_DOCUMENTS: ReadonlyArray<[text: string, refusal: RepoPackParse]> = [
  ["- a\n", { ok: false, error: { line: 1, message: "the pack is not a mapping" } }],
  ["", { ok: false, error: { line: 1, message: "the pack is not a mapping" } }],
  ["a: 1\na: 2\n", { ok: false, error: { line: 2, message: "a duplicate key 'a'" } }],
];

/** Keys of the pack "layout:\n  domain: d\n", and their value. */
export const PACK_VALUE_CASES: ReadonlyArray<[key: string, value: string | undefined]> = [
  ["layout.domain", "d"],
  ["layout.work", undefined],
  ["layout.shared", undefined],
  ["release.tag", undefined],
];

/** Bad tests.trait_pattern values, as YAML, and the issue each one gets. */
export const TRAIT_PATTERN_REFUSALS: ReadonlyArray<[yaml: string, message: string]> = [
  ["'  '", "the pattern is empty"],
  [`'${"x".repeat(81)}<id>'`, "the pattern is longer than 80 characters"],
  ['"a\\t<id>"', "a tab or a line break is not allowed"],
  ["\"it's <id>\"", "a single quote is not allowed"],
  ["'rule BR-01'", "the pattern must hold <id> exactly once"],
  ["'<name> <name> <id>'", "the pattern may hold <name> once at most"],
  ["'<x> <id>'", "'<' and '>' may only enclose <id> and <name>"],
  ["'# <id>'", "the pattern needs at least two characters around <id>"],
];
