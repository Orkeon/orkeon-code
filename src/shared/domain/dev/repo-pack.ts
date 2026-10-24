// The repository pack: the values a repository gives the dev workflow (its layout, its
// commands, its test trait, the ports the access cost counts, its contribution rules),
// read from a `repo.yaml` written in the YAML subset of yaml-subset.ts. Snake-case keys
// map to camel-case fields; a key of another type is reported, never guessed, and the
// whole document stays available for the keys typed nowhere here. Pure.
import { parseYamlSubset } from "./yaml-subset.ts";
import type { YamlError, YamlMap, YamlValue } from "./yaml-subset.ts";
import { ruleTraitProblem, traitPatternProblem } from "./trait-pattern.ts";

export interface RepoPackLayout {
  domain?: string; application?: string; infrastructure?: string; tests?: string; work?: string;
  shared: string[]; buildOutputs: string[];
  /** Test files a folder cannot name (`x.test.ts` beside `x.ts`): gate patterns, `*` spanning folders. */
  testFiles?: string[];
}
export interface RepoPackCommands {
  restore?: string; build?: string; buildTest?: string; testClass?: string; test?: string;
  testProject?: string; testIntegration?: string; cli?: string;
}
export interface RepoPackTests { ruleTrait?: string; traitPattern?: string }
export interface RepoPackAccessCost { receivers?: string; roots: string[] }
export interface RepoPackContrib { branch?: string; commit?: string; prTemplate?: string }
export interface RepoPack {
  layout: RepoPackLayout; commands: RepoPackCommands; tests: RepoPackTests;
  accessCost: RepoPackAccessCost; contrib: RepoPackContrib;
  /** The whole parsed document, for keys L-1 does not type. */
  document: YamlMap;
}
export interface RepoPackIssue { key: string; message: string }
export type RepoPackParse =
  | { ok: true; pack: RepoPack; issues: RepoPackIssue[] }
  | { ok: false; error: YamlError };

/** The dotted YAML keys of temp/04 § 6, in this order. */
export const REPO_PACK_KEYS: readonly string[] = [
  "layout.domain", "layout.application", "layout.infrastructure", "layout.tests", "layout.work",
  "layout.build_outputs", "layout.shared", "layout.test_files",
  "commands.restore", "commands.build", "commands.build_test", "commands.test_class", "commands.test",
  "commands.test_project", "commands.test_integration", "commands.cli",
  "tests.rule_trait", "tests.trait_pattern",
  "tools.access_cost.receivers", "tools.access_cost.roots",
  "contrib.branch", "contrib.commit", "contrib.pr_template",
];

const LIST_KEYS = new Set(["layout.build_outputs", "layout.shared", "layout.test_files", "tools.access_cost.roots"]);

function isMap(v: YamlValue | undefined): v is YamlMap {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function kindOf(v: YamlValue): string {
  if (Array.isArray(v)) return "list";
  if (isMap(v)) return "mapping";
  return v === null ? "null" : typeof v === "string" ? "string" : typeof v === "number" ? "number" : "boolean";
}

/** The raw value at a dotted key, undefined when a step is absent or not a mapping. */
function lookup(document: YamlMap, key: string): YamlValue | undefined {
  let cur: YamlValue | undefined = document;
  for (const part of key.split(".")) {
    if (!isMap(cur) || !Object.hasOwn(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

class Reader {
  readonly issues: RepoPackIssue[] = [];
  private readonly reported = new Set<string>();
  private readonly document: YamlMap;

  constructor(document: YamlMap) {
    this.document = document;
  }

  /** Reports a section (layout, tools.access_cost…) that is set but is not a mapping. */
  private sections(key: string): boolean {
    const parts = key.split(".");
    for (let n = 1; n < parts.length; n++) {
      const section = parts.slice(0, n).join(".");
      const v = lookup(this.document, section);
      if (v === undefined || v === null) return false;
      if (!isMap(v)) {
        if (!this.reported.has(section)) {
          this.reported.add(section);
          this.issues.push({ key: section, message: `expected a mapping, found a ${kindOf(v)}` });
        }
        return false;
      }
    }
    return true;
  }

  text(key: string): string | undefined {
    if (!this.sections(key)) return undefined;
    const v = lookup(this.document, key);
    if (v === undefined || v === null) return undefined;
    if (Array.isArray(v) || isMap(v)) {
      this.issues.push({ key, message: `expected a string, found a ${kindOf(v)}` });
      return undefined;
    }
    return String(v);
  }

  list(key: string): string[] {
    if (!this.sections(key)) return [];
    const v = lookup(this.document, key);
    if (v === undefined || v === null) return [];
    if (isMap(v)) {
      this.issues.push({ key, message: "expected a list of strings, found a mapping" });
      return [];
    }
    if (!Array.isArray(v)) return [String(v)];
    const bad = v.find((item) => item === null || typeof item === "object");
    if (bad !== undefined) {
      this.issues.push({ key, message: `expected a list of strings, found a list holding a ${kindOf(bad)}` });
      return [];
    }
    return v.map((item) => String(item));
  }
}

/** tests.rule_trait and tests.trait_pattern, each left unset (and reported) when it is not usable. */
function checkedTests(r: Reader): RepoPackTests {
  let ruleTrait = r.text("tests.rule_trait");
  let traitPattern = r.text("tests.trait_pattern");
  if (ruleTrait !== undefined) {
    const message = ruleTraitProblem(ruleTrait);
    if (message !== undefined) { r.issues.push({ key: "tests.rule_trait", message }); ruleTrait = undefined; }
  }
  if (traitPattern !== undefined) {
    const message = traitPatternProblem(traitPattern);
    if (message !== undefined) { r.issues.push({ key: "tests.trait_pattern", message }); traitPattern = undefined; }
  }
  if (traitPattern !== undefined && traitPattern.includes("<name>") && ruleTrait === undefined) {
    r.issues.push({ key: "tests.trait_pattern", message: "<name> needs tests.rule_trait" });
    traitPattern = undefined;
  }
  return { ruleTrait, traitPattern };
}

export function parseRepoPack(text: string): RepoPackParse {
  const parsed = parseYamlSubset(text);
  if (!parsed.ok) return parsed;
  const document = parsed.value;
  if (!isMap(document)) return { ok: false, error: { line: 1, message: "the pack is not a mapping" } };
  const r = new Reader(document);
  const pack: RepoPack = {
    layout: {
      domain: r.text("layout.domain"),
      application: r.text("layout.application"),
      infrastructure: r.text("layout.infrastructure"),
      tests: r.text("layout.tests"),
      work: r.text("layout.work"),
      buildOutputs: r.list("layout.build_outputs"),
      shared: r.list("layout.shared"),
      testFiles: r.list("layout.test_files"),
    },
    commands: {
      restore: r.text("commands.restore"),
      build: r.text("commands.build"),
      buildTest: r.text("commands.build_test"),
      testClass: r.text("commands.test_class"),
      test: r.text("commands.test"),
      testProject: r.text("commands.test_project"),
      testIntegration: r.text("commands.test_integration"),
      cli: r.text("commands.cli"),
    },
    tests: checkedTests(r),
    accessCost: { receivers: r.text("tools.access_cost.receivers"), roots: r.list("tools.access_cost.roots") },
    contrib: {
      branch: r.text("contrib.branch"),
      commit: r.text("contrib.commit"),
      prTemplate: r.text("contrib.pr_template"),
    },
    document,
  };
  return { ok: true, pack, issues: r.issues };
}

const FIELDS: Record<string, (p: RepoPack) => string | string[] | undefined> = {
  "layout.domain": (p) => p.layout.domain,
  "layout.application": (p) => p.layout.application,
  "layout.infrastructure": (p) => p.layout.infrastructure,
  "layout.tests": (p) => p.layout.tests,
  "layout.work": (p) => p.layout.work,
  "layout.build_outputs": (p) => p.layout.buildOutputs,
  "layout.shared": (p) => p.layout.shared,
  "layout.test_files": (p) => p.layout.testFiles,
  "commands.restore": (p) => p.commands.restore,
  "commands.build": (p) => p.commands.build,
  "commands.build_test": (p) => p.commands.buildTest,
  "commands.test_class": (p) => p.commands.testClass,
  "commands.test": (p) => p.commands.test,
  "commands.test_project": (p) => p.commands.testProject,
  "commands.test_integration": (p) => p.commands.testIntegration,
  "commands.cli": (p) => p.commands.cli,
  "tests.rule_trait": (p) => p.tests.ruleTrait,
  "tests.trait_pattern": (p) => p.tests.traitPattern,
  "tools.access_cost.receivers": (p) => p.accessCost.receivers,
  "tools.access_cost.roots": (p) => p.accessCost.roots,
  "contrib.branch": (p) => p.contrib.branch,
  "contrib.commit": (p) => p.contrib.commit,
  "contrib.pr_template": (p) => p.contrib.prTemplate,
};

/** The value of one dotted key of REPO_PACK_KEYS (e.g. "commands.test_class"); undefined when absent. */
export function packValue(pack: RepoPack, key: string): string | readonly string[] | undefined {
  const field = Object.hasOwn(FIELDS, key) ? FIELDS[key] : undefined;
  if (!field) return undefined;
  const value = field(pack);
  if (!LIST_KEYS.has(key) || (Array.isArray(value) && value.length > 0)) return value;
  // An empty list field is a value only when the document writes `[]` there.
  return Array.isArray(lookup(pack.document, key)) ? value : undefined;
}

export function missingPackKeyLine(key: string, packShown: string | null): string {
  return packShown === null
    ? `no repository pack: add ${key} to .orkeon/repo.yaml`
    : `the repository pack ${packShown} has no ${key}: add it there`;
}
