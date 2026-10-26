// The dependency rule and the runtime-globals rule tests/repository/architecture.test.ts enforces (its header says them in
// words), moved here as they were: the layer tables, the import and global parsers, the rules, and the cases the
// rule tests run them on.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { clockReads } from "./syntax.ts";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const GLOBALS = "src/shared/infrastructure/globals.ts";
export const WIRING = "src/shared/infrastructure/orkeon/wiring.ts";
export const INFRASTRUCTURE = "src/shared/infrastructure/";
export const COMMANDS = "src/commands/";
export const COMMANDS_LIB = "src/commands/_lib/";
export const CREW_ENTRY_POINTS = ["crew.ork.ts", "probe.ork.ts"];
export const LAYERS = ["domain", "application", "infrastructure"] as const;
export type Layer = (typeof LAYERS)[number];

export interface Import { from: string; specifier: string; to: string | null }

/** Test code: a test, or the fixtures and assertions files kept beside it. */
export const isTest = (file: string) => [".test.ts", ".fixtures.ts", ".assertions.ts"].some((end) => file.endsWith(end));
/** The checks several test files share, over node:assert alone: a test of any layer may import them. */
export const SHARED_ASSERTIONS = "tests/support/assertions/";
export const SHARED_ASSERTIONS_RULE = "tests/support/assertions/ imports node: built-ins only: a shared check serves every layer";
export const isCrewEntryPoint = (file: string) => CREW_ENTRY_POINTS.includes(posix.basename(file));
export const isCommandEntryPoint = (file: string) => file.endsWith(".cmd.ts");
export const isEntryPoint = (file: string) => isCommandEntryPoint(file) || isCrewEntryPoint(file);
export const edge = (from: string, to: string) => `${from} -> ${to}`;

/** The innermost layer folder a file sits in, or null (entry points, commands/_lib). */
export function layerOf(file: string): Layer | null {
  const segments = file.split("/");
  for (let i = segments.length - 2; i >= 0; i--) {
    const layer = LAYERS.find((l) => l === segments[i]);
    if (layer) return layer;
  }
  return null;
}

/** Every module specifier a source names, in order. */
export function specifiersOf(fileName: string, text: string): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      out.push(arg && ts.isStringLiteralLike(arg) ? arg.text : `<computed: ${arg?.getText() ?? ""}>`);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      out.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true));
  return out;
}

export function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(posix.join(ROOT, dir)).sort()) {
    if (e.startsWith(".") || e === "node_modules") continue;
    const rel = posix.join(dir, e);
    if (statSync(posix.join(ROOT, rel)).isDirectory()) sourceFiles(rel, acc);
    else if (rel.endsWith(".ts") && !rel.endsWith(".d.ts")) acc.push(rel);
  }
  return acc;
}

/** The repository file a relative specifier names; a missing extension is tried with .ts. */
export function resolveImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const target = posix.normalize(posix.join(posix.dirname(from), specifier));
  for (const candidate of [target, `${target}.ts`]) {
    const abs = posix.join(ROOT, candidate);
    if (existsSync(abs) && statSync(abs).isFile()) return candidate;
  }
  return null;
}

/** The sources the rules are read on: src/, and the shared checks of tests/, which serve every layer. */
export function readSources(): Map<string, string> {
  const files = [...sourceFiles("src"), ...sourceFiles(SHARED_ASSERTIONS.slice(0, -1))];
  return new Map(files.map((file) => [file, readFileSync(posix.join(ROOT, file), "utf-8")]));
}

/** Every source of src/ and tests/, by repository path: what the fixtures rule is read on. */
export function readAllSources(): Map<string, string> {
  const files = [...sourceFiles("src"), ...sourceFiles("tests")];
  return new Map(files.map((file) => [file, readFileSync(posix.join(ROOT, file), "utf-8")]));
}

export function collectImports(sources: ReadonlyMap<string, string>): Import[] {
  return [...sources].flatMap(([from, text]) =>
    specifiersOf(from, text).map((specifier) => ({
      from,
      specifier,
      to: resolveImport(from, specifier),
    })),
  );
}

export const LIB_RULE = "commands/_lib/ never imports shared/infrastructure/: the entry point hands it the ports";
export const APPLICATION_RULE = "application imports domain and application only: the runtime comes in through a port";
export const COMMAND_CREWS_RULE = "a *.cmd.ts never imports crews/*/domain nor crews/*/application: a use case of commands/_lib/ does";
const CREW_INNER = /^src\/crews\/[^/]+\/(domain|application)\//u;

/** The rules one import breaks, as messages; empty when it keeps them all. */
export function brokenRules(imp: Import): string[] {
  if (!imp.specifier.startsWith(".")) {
    return (isTest(imp.from) || imp.from.startsWith(SHARED_ASSERTIONS)) && imp.specifier.startsWith("node:")
      ? []
      : ["runtime code imports relative .ts files only (tests may import node: built-ins)"];
  }
  const broken: string[] = [];
  if (!imp.specifier.endsWith(".ts")) broken.push("a relative import names its .ts file");
  if (imp.to === null) return [...broken, "the import resolves to no file"];
  if (imp.from.startsWith(SHARED_ASSERTIONS)) return [...broken, SHARED_ASSERTIONS_RULE];
  const sharedCheck = isTest(imp.from) && imp.to.startsWith(SHARED_ASSERTIONS);
  const fromLayer = layerOf(imp.from);
  if (fromLayer === "domain" && layerOf(imp.to) !== "domain" && !sharedCheck) broken.push("domain imports domain only");
  const inward = layerOf(imp.to) === "domain" || layerOf(imp.to) === "application";
  if (fromLayer === "application" && !inward && !(isTest(imp.from) && imp.to.startsWith("tests/"))) broken.push(APPLICATION_RULE);
  if ((fromLayer === "domain" || fromLayer === "application") && (imp.to.startsWith(COMMANDS) || isEntryPoint(imp.to))) {
    broken.push("domain and application never import commands/ nor an entry point");
  }
  if (imp.to === GLOBALS && !imp.from.startsWith(INFRASTRUCTURE) && !isCrewEntryPoint(imp.from)) {
    broken.push("only shared/infrastructure/ and the crew entry points import globals.ts");
  }
  if (imp.to.startsWith(INFRASTRUCTURE) && imp.from.startsWith(COMMANDS_LIB)) {
    broken.push(LIB_RULE);
  }
  if (isCommandEntryPoint(imp.from) && CREW_INNER.test(imp.to)) broken.push(COMMAND_CREWS_RULE);
  if (imp.to.startsWith("tests/") && !isTest(imp.from)) broken.push("runtime code never imports tests/");
  if (isTest(imp.to) && !isTest(imp.from)) broken.push("runtime code never imports test code (*.test.ts, *.fixtures.ts, *.assertions.ts)");
  return broken;
}

/** The module a file belongs to: its name up to the first dot (`run-dev-learn.decide.test.ts` is `run-dev-learn`). */
export const moduleOf = (file: string) => posix.basename(file).split(".")[0];
export const FIXTURES_RULE =
  "a <module>.fixtures.ts or .assertions.ts serves the tests of its module only: what several modules share goes under tests/support/";
const isModuleSupport = (file: string) => file.endsWith(".fixtures.ts") || file.endsWith(".assertions.ts");

/** The rule an import of a fixtures or assertions file breaks; null when the importer belongs to the module that
 *  file serves (same folder, same module name). A file of tests/support/ is no module's. */
export function brokenFixturesRule(imp: Import): string | null {
  if (imp.to === null || !isModuleSupport(imp.to) || imp.to.startsWith("tests/support/")) return null;
  const sameModule = posix.dirname(imp.from) === posix.dirname(imp.to) && moduleOf(imp.from) === moduleOf(imp.to);
  return sameModule ? null : FIXTURES_RULE;
}

export const PLACEMENT_RULE = "every runtime file of src/ sits in a layer, or is an entry point, a command use case or a declaration";

/** The rule a runtime file of src/ breaks by where it sits; null when it sits in a layer folder, is an entry point,
 *  a command use case of commands/_lib/ or a declaration (.d.ts). */
export function brokenPlacementRule(file: string): string | null {
  const placed = layerOf(file) !== null || isEntryPoint(file) || file.startsWith(COMMANDS_LIB) || file.endsWith(".d.ts");
  return placed ? null : PLACEMENT_RULE;
}

export const CLOCK_RULE = "every clock read sits in shared/infrastructure/: the rest of src/ takes the Clock port";

/** Every clock read of a runtime file outside shared/infrastructure/, as `<file>:<line>: <read>: <rule>`. */
export function clockRuleBreaks(file: string, text: string): string[] {
  if (file.startsWith(INFRASTRUCTURE)) return [];
  return clockReads(file, text, false).map((hit) => `${hit.file}:${hit.line}: ${hit.what}: ${CLOCK_RULE}`);
}

/** The runtime globals: who may use them, and the rule a use elsewhere breaks. */
export const RUNTIME_GLOBALS: ReadonlyArray<{ names: readonly string[]; allowedIn: (file: string) => boolean; rule: string }> = [
  {
    names: ["require"],
    allowedIn: () => false,
    rule: "no require(): the sources are ES modules bundled by esbuild",
  },
  {
    names: ["tools", "agentBuilder", "crewBuilder", "toolBuilder", "rag", "inputs"],
    allowedIn: (file) => file.startsWith(INFRASTRUCTURE) || isCrewEntryPoint(file),
    rule: "only shared/infrastructure/ and the crew entry points read the runtime globals (a port, or globals.ts)",
  },
  {
    names: ["defineCommand", "defineAsyncCommand"],
    allowedIn: isCommandEntryPoint,
    rule: "only a *.cmd.ts registers a command",
  },
];
export const GLOBAL_NAMES = new Set(RUNTIME_GLOBALS.flatMap((g) => g.names));

export interface GlobalUse { file: string; line: number; name: string }

/** Whether an identifier stands where a value or a type is named, not where a
 *  property, a member or a label is. */
export function isReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p)) return p.expression === id;
  if (ts.isQualifiedName(p)) return p.left === id;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p)
    || ts.isMethodDeclaration(p) || ts.isMethodSignature(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)
    || ts.isEnumMember(p)) && p.name === id) {
    return false;
  }
  if ((ts.isBindingElement(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) && p.propertyName === id) return false;
  return true;
}

/** An expression without the parentheses, casts and `!` around it. */
export function unwrapped(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
    node = node.expression;
  }
  return node;
}

/** `globalThis.<name>` or `globalThis["<name>"]`, through parentheses and casts: the name. */
export function globalThisMember(node: ts.Node): string | null {
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return null;
  const name = ts.isPropertyAccessExpression(node)
    ? node.name.text
    : ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null;
  const target = unwrapped(node.expression);
  return name !== null && ts.isIdentifier(target) && target.text === "globalThis" ? name : null;
}

/** Whether a declaration is ambient: under a `declare` modifier, its own or an
 *  enclosing one (`declare const`, `declare global { … }`). */
export function isAmbient(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n !== undefined; n = n.parent) {
    if (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) return true;
  }
  return false;
}

/**
 * Every use of a runtime global in the sources: an identifier of `names` that
 * nothing in its own file declares, imports or binds, a `globalThis.<name>`, and
 * an ambient declaration of one (`declare const tools`, which would otherwise
 * hide the use behind a local declaration). Each file is resolved alone, without
 * the runtime's typings or the default library, so TypeScript's scoping finds
 * exactly what the file itself does not declare.
 */
export function runtimeGlobalUses(sources: ReadonlyMap<string, string>, names: ReadonlySet<string>): GlobalUse[] {
  const options: ts.CompilerOptions = {
    noLib: true, noResolve: true, types: [], noEmit: true, allowImportingTsExtensions: true,
    moduleDetection: ts.ModuleDetectionKind.Force, target: ts.ScriptTarget.Latest,
  };
  const host: ts.CompilerHost = {
    getSourceFile: (name, target) =>
      sources.has(name) ? ts.createSourceFile(name, sources.get(name)!, target, true) : undefined,
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "",
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => sources.has(name),
    readFile: (name) => sources.get(name),
  };
  const program = ts.createProgram([...sources.keys()], options, host);
  const checker = program.getTypeChecker();
  const uses: GlobalUse[] = [];
  for (const file of sources.keys()) {
    const sf = program.getSourceFile(file)!;
    const use = (node: ts.Node, name: string) =>
      uses.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, name });
    const visit = (node: ts.Node): void => {
      const member = globalThisMember(node);
      if (member !== null && names.has(member)) use(node, member);
      if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name)
        && names.has(node.name.text) && isAmbient(node)) {
        use(node, node.name.text);
      }
      if (ts.isIdentifier(node) && names.has(node.text) && isReference(node)) {
        const symbol = ts.isShorthandPropertyAssignment(node.parent)
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node);
        if (symbol === undefined) use(node, node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return uses;
}

/** The rule a use of a runtime global breaks; null when its file may use it. */
export function brokenGlobalRule(use: GlobalUse): string | null {
  const global = RUNTIME_GLOBALS.find((g) => g.names.includes(use.name))!;
  return global.allowedIn(use.file) ? null : global.rule;
}

export function graphOf(imports: Import[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const { from, to } of imports) {
    if (to === null) continue;
    const next = graph.get(from) ?? [];
    if (!next.includes(to)) next.push(to);
    graph.set(from, next);
  }
  return graph;
}

/** One path per cycle closed by a back edge of a depth-first walk, as "a -> b -> a". */
export function cyclesOf(graph: Map<string, string[]>): string[] {
  const cycles: string[] = [];
  const done = new Set<string>();
  const stack: string[] = [];
  const walk = (file: string): void => {
    stack.push(file);
    for (const next of graph.get(file) ?? []) {
      const at = stack.indexOf(next);
      if (at >= 0) cycles.push([...stack.slice(at), next].join(" -> "));
      else if (!done.has(next)) walk(next);
    }
    stack.pop();
    done.add(file);
  };
  for (const file of [...graph.keys()].sort()) if (!done.has(file)) walk(file);
  return cycles;
}

// ── The cases the rule tests run ─────────────────────────────────────────────

/** One import of every form the parser reads, and two it must not (a comment, a string). */
export const IMPORT_FORMS_SOURCE = [
  `import { a } from "./a.ts";`,
  `import type { B } from "./b.ts";`,
  `export { c } from "./c.ts";`,
  `export * from "./d.ts";`,
  `// import { x } from "./commented.ts";`,
  `const text = 'import { y } from "./quoted.ts"';`,
  `type E = import("./e.ts").E;`,
  `async function f() { return import("./f.ts"); }`,
].join("\n");

/** A file and the layer its innermost layer folder gives it. */
export const LAYER_CASES: ReadonlyArray<{ file: string; layer: Layer | null }> = [
  { file: "src/shared/domain/types.ts", layer: "domain" },
  { file: "src/crews/main-loop/application/run-main-loop.ts", layer: "application" },
  { file: GLOBALS, layer: "infrastructure" },
  { file: "src/commands/settings/mode.cmd.ts", layer: null },
  { file: "src/commands/_lib/args.ts", layer: null },
];

/** An import and the rules it breaks, by the behaviour it shows. */
export interface ImportCase { name: string; imp: Import; broken: string[] }

const GLOBALS_RULE = "only shared/infrastructure/ and the crew entry points import globals.ts";
const importOfGlobals = (from: string): Import => ({ from, specifier: "./globals.ts", to: GLOBALS });

/** Who may import globals.ts: the crew entry points and the infrastructure, not a command. */
export const GLOBALS_IMPORT_CASES: readonly ImportCase[] = [
  { name: "lets a crew entry point import globals.ts", imp: importOfGlobals("src/crews/analyze/crew.ork.ts"), broken: [] },
  { name: "lets a probe entry point import globals.ts", imp: importOfGlobals("src/crews/_probe-budget/probe.ork.ts"), broken: [] },
  { name: "lets the wiring of shared/infrastructure/ import globals.ts", imp: importOfGlobals(WIRING), broken: [] },
  { name: "refuses globals.ts to a command entry point", imp: importOfGlobals("src/commands/status/doctor.cmd.ts"), broken: [GLOBALS_RULE] },
  {
    name: "refuses globals.ts to a use case of commands/_lib/, which never imports shared/infrastructure/",
    imp: importOfGlobals("src/commands/_lib/doctor.ts"),
    broken: [GLOBALS_RULE, LIB_RULE],
  },
];

/** An adapter imported by a command entry point (allowed) and by a use case of commands/_lib/ (refused). */
export const ADAPTER_IMPORT_CASES: readonly ImportCase[] = [WIRING, "src/shared/infrastructure/orkeon/crew-host.ts"].flatMap((to) => [
  { name: `lets a command import the adapter ${to}`, imp: { from: "src/commands/status/doctor.cmd.ts", specifier: "./x.ts", to }, broken: [] },
  {
    name: `refuses the adapter ${to} to a use case of commands/_lib/`,
    imp: { from: "src/commands/_lib/dispatch.ts", specifier: "./x.ts", to },
    broken: [LIB_RULE],
  },
]);

const OUT_OF_COMMANDS_RULE = "domain and application never import commands/ nor an entry point";
const importOf = (from: string, to: string): Import => ({ from, specifier: "./x.ts", to });

/** commands/ and the entry points stay out of domain and application, and only there. */
export const LAYER_IMPORT_CASES: readonly ImportCase[] = [
  {
    name: "refuses commands/_lib/ to application",
    imp: importOf("src/crews/main-loop/application/turn-prompt.ts", "src/commands/_lib/args.ts"),
    broken: [APPLICATION_RULE, OUT_OF_COMMANDS_RULE],
  },
  {
    name: "refuses a command entry point to application",
    imp: importOf("src/shared/application/session-io.ts", "src/commands/settings/mode.cmd.ts"),
    broken: [APPLICATION_RULE, OUT_OF_COMMANDS_RULE],
  },
  {
    name: "refuses a crew entry point to domain",
    imp: importOf("src/shared/domain/types.ts", "src/crews/analyze/crew.ork.ts"),
    broken: ["domain imports domain only", OUT_OF_COMMANDS_RULE],
  },
  {
    name: "refuses a probe entry point to domain",
    imp: importOf("src/crews/x/domain/rules.ts", "src/crews/_probe-budget/probe.ork.ts"),
    broken: ["domain imports domain only", OUT_OF_COMMANDS_RULE],
  },
  {
    name: "lets commands/_lib/ import commands/_lib/",
    imp: importOf("src/commands/_lib/mode.ts", "src/commands/_lib/args.ts"),
    broken: [],
  },
  {
    name: "lets a crew entry point import its application",
    imp: importOf("src/crews/analyze/crew.ork.ts", "src/crews/analyze/application/run-analyze.ts"),
    broken: [],
  },
];

/** What application may import: domain and application, and its tests tests/ besides; nothing else. */
export const APPLICATION_IMPORT_CASES: readonly ImportCase[] = [
  {
    name: "lets application import domain",
    imp: importOf("src/crews/x/application/run-x.ts", "src/shared/domain/types.ts"),
    broken: [],
  },
  {
    name: "lets application import application, a port included",
    imp: importOf("src/crews/x/application/run-x.ts", "src/shared/application/ports.ts"),
    broken: [],
  },
  {
    name: "refuses infrastructure to application",
    imp: importOf("src/crews/x/application/run-x.ts", "src/shared/infrastructure/orkeon/shell.ts"),
    broken: [APPLICATION_RULE],
  },
  {
    name: "refuses to application a file in no layer",
    imp: importOf("src/crews/x/application/run-x.ts", "src/crews/x/helpers.ts"),
    broken: [APPLICATION_RULE],
  },
  {
    name: "refuses infrastructure to an application test as well",
    imp: importOf("src/crews/x/application/run-x.test.ts", "src/shared/infrastructure/orkeon/shell.ts"),
    broken: [APPLICATION_RULE],
  },
];

/** What a command entry point may import of a crew: nothing of its domain nor of its application. */
export const COMMAND_IMPORT_CASES: readonly ImportCase[] = [
  {
    name: "refuses a crew's domain to a command entry point",
    imp: importOf("src/commands/git/commit.cmd.ts", "src/crews/dev-plan/domain/plan-render.ts"),
    broken: [COMMAND_CREWS_RULE],
  },
  {
    name: "refuses a crew's application to a command entry point",
    imp: importOf("src/commands/dev/dev-implement.cmd.ts", "src/crews/dev-implement/application/run-dev-implement.ts"),
    broken: [COMMAND_CREWS_RULE],
  },
  {
    name: "lets a command entry point import its use case of commands/_lib/",
    imp: importOf("src/commands/git/commit.cmd.ts", "src/commands/_lib/commit.ts"),
    broken: [],
  },
  {
    name: "lets a command entry point import shared/domain/",
    imp: importOf("src/commands/git/commit.cmd.ts", "src/shared/domain/types.ts"),
    broken: [],
  },
  {
    name: "lets a crew entry point import its crew's application",
    imp: importOf("src/crews/git-commit/crew.ork.ts", "src/crews/git-commit/application/run-git-commit.ts"),
    broken: [],
  },
];

/** An import of a fixtures or assertions file, and the rule it breaks (null: the importer is of the same module). */
export const FIXTURES_IMPORT_CASES: ReadonlyArray<{ name: string; imp: Import; rule: string | null }> = [
  {
    name: "lets a test import the fixtures of its module",
    imp: importOf("src/crews/x/domain/plan.test.ts", "src/crews/x/domain/plan.fixtures.ts"),
    rule: null,
  },
  {
    name: "lets a facet test import the fixtures of its module",
    imp: importOf("src/crews/x/application/run-x.decide.test.ts", "src/crews/x/application/run-x.fixtures.ts"),
    rule: null,
  },
  {
    name: "lets the fixtures of a facet import the fixtures of its module",
    imp: importOf("src/crews/x/application/run-x.decide.fixtures.ts", "src/crews/x/application/run-x.fixtures.ts"),
    rule: null,
  },
  {
    name: "lets a test import the assertions of its module",
    imp: importOf("src/crews/x/domain/plan.test.ts", "src/crews/x/domain/plan.assertions.ts"),
    rule: null,
  },
  {
    name: "lets any test import the shared fixtures of tests/support/",
    imp: importOf("src/crews/x/application/run-x.test.ts", "tests/support/fixtures/linked-worktree-files.ts"),
    rule: null,
  },
  {
    name: "refuses the fixtures of a module to the test of another module",
    imp: importOf("src/crews/x/domain/render.test.ts", "src/crews/x/domain/plan.fixtures.ts"),
    rule: FIXTURES_RULE,
  },
  {
    name: "refuses the fixtures of a module to the fixtures of another module",
    imp: importOf("src/crews/x/domain/render.fixtures.ts", "src/crews/x/domain/plan.fixtures.ts"),
    rule: FIXTURES_RULE,
  },
  {
    name: "refuses the assertions of a module to the test of another module",
    imp: importOf("src/crews/x/domain/render.test.ts", "src/crews/x/domain/plan.assertions.ts"),
    rule: FIXTURES_RULE,
  },
  {
    name: "refuses the fixtures of a module to a test of the same name in another folder",
    imp: importOf("src/crews/y/domain/plan.test.ts", "src/crews/x/domain/plan.fixtures.ts"),
    rule: FIXTURES_RULE,
  },
];

/** A runtime file of src/, and the rule its place breaks (null: it sits where the architecture puts files). */
export const PLACEMENT_CASES: ReadonlyArray<{ file: string; rule: string | null }> = [
  { file: "src/shared/domain/types.ts", rule: null },
  { file: "src/crews/x/application/run-x.ts", rule: null },
  { file: WIRING, rule: null },
  { file: "src/crews/x/crew.ork.ts", rule: null },
  { file: "src/crews/_probe-budget/probe.ork.ts", rule: null },
  { file: "src/commands/settings/mode.cmd.ts", rule: null },
  { file: "src/commands/_lib/args.ts", rule: null },
  { file: "src/crews/.orkeon/orkeon.d.ts", rule: null },
  { file: "src/crews/x/helpers.ts", rule: PLACEMENT_RULE },
  { file: "src/commands/settings/mode-view.ts", rule: PLACEMENT_RULE },
  { file: "src/shared/util.ts", rule: PLACEMENT_RULE },
];

/** A runtime file reading the clock or not, and the breaks the clock rule finds in it. */
export const CLOCK_CASES: ReadonlyArray<{ name: string; file: string; text: string; breaks: string[] }> = [
  {
    name: "refuses new Date() to application",
    file: "src/crews/x/application/run-x.ts",
    text: "const at = new Date();",
    breaks: [`src/crews/x/application/run-x.ts:1: new Date(): ${CLOCK_RULE}`],
  },
  {
    name: "refuses Date.now() to domain",
    file: "src/shared/domain/age.ts",
    text: "export const age = (t: number) => Date.now() - t;",
    breaks: [`src/shared/domain/age.ts:1: Date.now(): ${CLOCK_RULE}`],
  },
  {
    name: "refuses a clock read to a use case of commands/_lib/",
    file: "src/commands/_lib/status.ts",
    text: "const stamp = String(new Date());",
    breaks: [`src/commands/_lib/status.ts:1: new Date(): ${CLOCK_RULE}`],
  },
  {
    name: "lets shared/infrastructure/ read the clock",
    file: WIRING,
    text: "export const orkeonClock = () => new Date();",
    breaks: [],
  },
  {
    name: "lets any file build a date from a value, parse one or compose one",
    file: "src/shared/domain/age.ts",
    text: "const a = new Date(0); const b = Date.parse(s); const c = Date.UTC(2026, 9);",
    breaks: [],
  },
];

const FAKE_SHELL = "tests/support/doubles/fake-shell.ts";
const SHARED_TEXT = "tests/support/assertions/text.ts";

/** tests/ is refused to runtime code, not to a test. */
export const TESTS_IMPORT_CASES: readonly ImportCase[] = [
  {
    name: "refuses an import of tests/ from runtime code",
    imp: { from: "src/crews/x/application/run.ts", specifier: "../../../../" + FAKE_SHELL, to: FAKE_SHELL },
    broken: [APPLICATION_RULE, "runtime code never imports tests/"],
  },
  {
    name: "lets a test import tests/",
    imp: { from: "src/crews/x/application/run.test.ts", specifier: "../../../../" + FAKE_SHELL, to: FAKE_SHELL },
    broken: [],
  },
  {
    name: "refuses a double to a domain test: a fake implements a port of the application",
    imp: { from: "src/crews/x/domain/plan.test.ts", specifier: "../../../../" + FAKE_SHELL, to: FAKE_SHELL },
    broken: ["domain imports domain only"],
  },
  {
    name: "lets a domain test import a shared check",
    imp: { from: "src/crews/x/domain/plan.test.ts", specifier: "../../../../" + SHARED_TEXT, to: SHARED_TEXT },
    broken: [],
  },
  {
    name: "lets a shared check import node:assert",
    imp: { from: SHARED_TEXT, specifier: "node:assert", to: null },
    broken: [],
  },
  {
    name: "refuses a relative import to a shared check, which serves every layer",
    imp: { from: SHARED_TEXT, specifier: "../doubles/fake-shell.ts", to: FAKE_SHELL },
    broken: [SHARED_ASSERTIONS_RULE],
  },
];

/** The runtime globals a file's own scope does not bind, as `<line>:<name>`. */
export const usesIn = (text: string, file = "src/x.ts") => runtimeGlobalUses(new Map([[file, text]]), GLOBAL_NAMES)
  .map((u) => `${u.line}:${u.name}`);

/** A global on each line, read bare, through globalThis, in a shorthand, re-declared or as a type. */
export const UNBOUND_GLOBALS_SOURCE = [
  `tools.shellCommand({ command: "ls" });`,
  `const t = (globalThis as any).tools;`,
  `const b = globalThis["agentBuilder"];`,
  `const o = { tools };`,
  `declare function defineCommand(desc: unknown): void;`,
  `const fs = require("node:fs");`,
  `type T = typeof inputs;`,
  `declare global { const crewBuilder: () => unknown; }`,
  `const d = (globalThis.tools as any)!;`,
].join("\n");

export const UNBOUND_GLOBALS_USES = [
  "1:tools", "2:tools", "3:agentBuilder", "4:tools", "5:defineCommand", "6:require", "7:inputs", "8:crewBuilder",
  "9:tools",
];

/** The names of the globals, each declared, imported or bound by the file, or a member of another object. */
export const BOUND_NAMES_SOURCE = [
  `import { inputs } from "./globals.ts";`,
  `import type { tools as T } from "./x.ts";`,
  `function f(tools: string[], { crewBuilder }: any) { return tools.length + crewBuilder; }`,
  `const g = (require: unknown) => require;`,
  `const ctx = { tools: [], defineCommand: 1 };`,
  `ctx.tools.push(ctx.defineCommand);`,
  `const { tools: renamed } = ctx;`,
  `for (const agentBuilder of []) agentBuilder;`,
  `inputs();`,
  `// tools.shellCommand(...) in a comment, and "tools.x" in a string`,
].join("\n");

/** A use of a global in a file, and the rule it breaks there (null: allowed). */
export const GLOBAL_RULE_CASES: ReadonlyArray<{ name: string; file: string; rule: string | null }> = [
  { name: "tools", file: "src/shared/infrastructure/globals.ts", rule: null },
  { name: "tools", file: "src/crews/_probe-raggable/probe.ork.ts", rule: null },
  { name: "tools", file: "src/commands/status/doctor.cmd.ts", rule: RUNTIME_GLOBALS[1].rule },
  { name: "tools", file: "src/crews/x/application/run-x.ts", rule: RUNTIME_GLOBALS[1].rule },
  { name: "defineCommand", file: "src/commands/settings/fast.cmd.ts", rule: null },
  { name: "defineCommand", file: "src/commands/_lib/session-config.ts", rule: RUNTIME_GLOBALS[2].rule },
  { name: "require", file: "src/shared/infrastructure/globals.ts", rule: RUNTIME_GLOBALS[0].rule },
];
