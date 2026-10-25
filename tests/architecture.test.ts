// Dependency rule, checked statically over every import of every .ts file under
// src/ (static `import … from`, `export … from`, dynamic `import("…")` and type
// `import("…")`):
//   - a file under domain/ imports domain files only;
//   - a file under application/ never imports infrastructure/;
//   - a file under domain/ or application/ never imports commands/ nor an entry
//     point (*.cmd.ts, crew.ork.ts, probe.ork.ts);
//   - only shared/infrastructure/ and the crew entry points (crew.ork.ts,
//     probe.ork.ts, which need the builders and inputs()) import
//     shared/infrastructure/globals.ts: a command reaches the runtime through the
//     adapters of orkeon/wiring.ts;
//   - commands/_lib/ never imports shared/infrastructure/: its use cases take
//     their ports as parameters, the entry points wire the adapters, so a test
//     imports them;
//   - a relative import names its .ts file (the runtime bundler resolves
//     specifiers as written), and runtime code imports nothing but relative
//     files (tests may import node: built-ins);
//   - runtime code never imports tests/: the doubles of tests/support/ are
//     never bundled (tests next to the code may import them);
//   - runtime code never imports test code: a *.test.ts, or the *.fixtures.ts
//     and *.assertions.ts files the tests next to it keep their data and checks in;
//   - no import cycle between files.
// The runtime globals are checked the same way, over every identifier that
// nothing in its file declares, imports or binds (TypeScript's own scoping), every
// `globalThis.<name>` and every ambient re-declaration (`declare const tools`):
//   - no require(): the sources are ES modules bundled by esbuild;
//   - only shared/infrastructure/ and the crew entry points read `tools`, `rag`,
//     `agentBuilder`, `crewBuilder` and `inputs` (src/crews/.orkeon/orkeon.d.ts
//     declares them for every file, so the type check lets any file call
//     `tools.shellCommand(...)`);
//   - only a *.cmd.ts calls defineCommand or defineAsyncCommand.
// There is no exception list: the last entries went with the compaction's move
// onto the ports, so an import or a global that breaks a rule fails the test.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GLOBALS = "src/shared/infrastructure/globals.ts";
const WIRING = "src/shared/infrastructure/orkeon/wiring.ts";
const INFRASTRUCTURE = "src/shared/infrastructure/";
const COMMANDS = "src/commands/";
const COMMANDS_LIB = "src/commands/_lib/";
const CREW_ENTRY_POINTS = ["crew.ork.ts", "probe.ork.ts"];
const LAYERS = ["domain", "application", "infrastructure"] as const;
type Layer = (typeof LAYERS)[number];

interface Import { from: string; specifier: string; to: string | null }

/** Test code: a test, or the fixtures and assertions files kept beside it. */
const isTest = (file: string) => [".test.ts", ".fixtures.ts", ".assertions.ts"].some((end) => file.endsWith(end));
const isCrewEntryPoint = (file: string) => CREW_ENTRY_POINTS.includes(posix.basename(file));
const isCommandEntryPoint = (file: string) => file.endsWith(".cmd.ts");
const isEntryPoint = (file: string) => isCommandEntryPoint(file) || isCrewEntryPoint(file);
const edge = (from: string, to: string) => `${from} -> ${to}`;

/** The innermost layer folder a file sits in, or null (entry points, commands/_lib). */
function layerOf(file: string): Layer | null {
  const segments = file.split("/");
  for (let i = segments.length - 2; i >= 0; i--) {
    const layer = LAYERS.find((l) => l === segments[i]);
    if (layer) return layer;
  }
  return null;
}

/** Every module specifier a source names, in order. */
function specifiersOf(fileName: string, text: string): string[] {
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

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(posix.join(ROOT, dir)).sort()) {
    if (e.startsWith(".") || e === "node_modules") continue;
    const rel = posix.join(dir, e);
    if (statSync(posix.join(ROOT, rel)).isDirectory()) sourceFiles(rel, acc);
    else if (rel.endsWith(".ts") && !rel.endsWith(".d.ts")) acc.push(rel);
  }
  return acc;
}

/** The repository file a relative specifier names; a missing extension is tried with .ts. */
function resolveImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const target = posix.normalize(posix.join(posix.dirname(from), specifier));
  for (const candidate of [target, `${target}.ts`]) {
    const abs = posix.join(ROOT, candidate);
    if (existsSync(abs) && statSync(abs).isFile()) return candidate;
  }
  return null;
}

/** Every source of src/, by repository path. */
function readSources(): Map<string, string> {
  return new Map(sourceFiles("src").map((file) => [file, readFileSync(posix.join(ROOT, file), "utf-8")]));
}

function collectImports(sources: ReadonlyMap<string, string>): Import[] {
  return [...sources].flatMap(([from, text]) =>
    specifiersOf(from, text).map((specifier) => ({
      from,
      specifier,
      to: resolveImport(from, specifier),
    })),
  );
}

const LIB_RULE = "commands/_lib/ never imports shared/infrastructure/: the entry point hands it the ports";

/** The rules one import breaks, as messages; empty when it keeps them all. */
function brokenRules(imp: Import): string[] {
  if (!imp.specifier.startsWith(".")) {
    return isTest(imp.from) && imp.specifier.startsWith("node:")
      ? []
      : ["runtime code imports relative .ts files only (tests may import node: built-ins)"];
  }
  const broken: string[] = [];
  if (!imp.specifier.endsWith(".ts")) broken.push("a relative import names its .ts file");
  if (imp.to === null) return [...broken, "the import resolves to no file"];
  const fromLayer = layerOf(imp.from);
  if (fromLayer === "domain" && layerOf(imp.to) !== "domain") broken.push("domain imports domain only");
  if (fromLayer === "application" && layerOf(imp.to) === "infrastructure") broken.push("application never imports infrastructure");
  if ((fromLayer === "domain" || fromLayer === "application") && (imp.to.startsWith(COMMANDS) || isEntryPoint(imp.to))) {
    broken.push("domain and application never import commands/ nor an entry point");
  }
  if (imp.to === GLOBALS && !imp.from.startsWith(INFRASTRUCTURE) && !isCrewEntryPoint(imp.from)) {
    broken.push("only shared/infrastructure/ and the crew entry points import globals.ts");
  }
  if (imp.to.startsWith(INFRASTRUCTURE) && imp.from.startsWith(COMMANDS_LIB)) {
    broken.push(LIB_RULE);
  }
  if (imp.to.startsWith("tests/") && !isTest(imp.from)) broken.push("runtime code never imports tests/");
  if (isTest(imp.to) && !isTest(imp.from)) broken.push("runtime code never imports test code (*.test.ts, *.fixtures.ts, *.assertions.ts)");
  return broken;
}

/** The runtime globals: who may use them, and the rule a use elsewhere breaks. */
const RUNTIME_GLOBALS: ReadonlyArray<{ names: readonly string[]; allowedIn: (file: string) => boolean; rule: string }> = [
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
const GLOBAL_NAMES = new Set(RUNTIME_GLOBALS.flatMap((g) => g.names));

interface GlobalUse { file: string; line: number; name: string }

/** Whether an identifier stands where a value or a type is named, not where a
 *  property, a member or a label is. */
function isReference(id: ts.Identifier): boolean {
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
function unwrapped(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
    node = node.expression;
  }
  return node;
}

/** `globalThis.<name>` or `globalThis["<name>"]`, through parentheses and casts: the name. */
function globalThisMember(node: ts.Node): string | null {
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return null;
  const name = ts.isPropertyAccessExpression(node)
    ? node.name.text
    : ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null;
  const target = unwrapped(node.expression);
  return name !== null && ts.isIdentifier(target) && target.text === "globalThis" ? name : null;
}

/** Whether a declaration is ambient: under a `declare` modifier, its own or an
 *  enclosing one (`declare const`, `declare global { … }`). */
function isAmbient(node: ts.Node): boolean {
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
function runtimeGlobalUses(sources: ReadonlyMap<string, string>, names: ReadonlySet<string>): GlobalUse[] {
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
function brokenGlobalRule(use: GlobalUse): string | null {
  const global = RUNTIME_GLOBALS.find((g) => g.names.includes(use.name))!;
  return global.allowedIn(use.file) ? null : global.rule;
}

function graphOf(imports: Import[]): Map<string, string[]> {
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
function cyclesOf(graph: Map<string, string[]>): string[] {
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

describe("architecture: import parsing", () => {
  it("sees static, re-export, type-only and dynamic imports, and ignores comments and strings", () => {
    const source = [
      `import { a } from "./a.ts";`,
      `import type { B } from "./b.ts";`,
      `export { c } from "./c.ts";`,
      `export * from "./d.ts";`,
      `// import { x } from "./commented.ts";`,
      `const text = 'import { y } from "./quoted.ts"';`,
      `type E = import("./e.ts").E;`,
      `async function f() { return import("./f.ts"); }`,
    ].join("\n");
    deepStrictEqual(specifiersOf("probe.ts", source), ["./a.ts", "./b.ts", "./c.ts", "./d.ts", "./e.ts", "./f.ts"]);
  });

  it("finds the layer of a file from its innermost layer folder", () => {
    deepStrictEqual(
      ["src/shared/domain/types.ts", "src/crews/main-loop/application/run-main-loop.ts", GLOBALS, "src/commands/mode.cmd.ts", "src/commands/_lib/args.ts"].map(layerOf),
      ["domain", "application", "infrastructure", null, null],
    );
  });

  it("lets the crew entry points import globals.ts, and no command", () => {
    const rule = "only shared/infrastructure/ and the crew entry points import globals.ts";
    const from = (file: string) => brokenRules({ from: file, specifier: "./globals.ts", to: GLOBALS });
    deepStrictEqual(from("src/crews/analyze/crew.ork.ts"), []);
    deepStrictEqual(from("src/crews/_probe-budget/probe.ork.ts"), []);
    deepStrictEqual(from(WIRING), []);
    deepStrictEqual(from("src/commands/doctor.cmd.ts"), [rule]);
    deepStrictEqual(from("src/commands/_lib/doctor.ts"), [rule, LIB_RULE]);
  });

  it("lets a command import an adapter, not a use case of commands/_lib/", () => {
    for (const to of [WIRING, "src/shared/infrastructure/orkeon/crew-host.ts"]) {
      const from = (file: string) => brokenRules({ from: file, specifier: "./x.ts", to });
      deepStrictEqual(from("src/commands/doctor.cmd.ts"), []);
      deepStrictEqual(from("src/commands/_lib/dispatch.ts"), [LIB_RULE]);
    }
  });

  it("keeps commands/ and the entry points out of domain and application", () => {
    const rule = "domain and application never import commands/ nor an entry point";
    const from = (file: string, to: string) => brokenRules({ from: file, specifier: "./x.ts", to });
    deepStrictEqual(from("src/crews/main-loop/application/turn-prompt.ts", "src/commands/_lib/args.ts"), [rule]);
    deepStrictEqual(from("src/shared/application/session-io.ts", "src/commands/mode.cmd.ts"), [rule]);
    deepStrictEqual(from("src/shared/domain/types.ts", "src/crews/analyze/crew.ork.ts"), ["domain imports domain only", rule]);
    deepStrictEqual(from("src/crews/x/domain/rules.ts", "src/crews/_probe-budget/probe.ork.ts"), ["domain imports domain only", rule]);
    deepStrictEqual(from("src/commands/_lib/mode.ts", "src/commands/_lib/args.ts"), []);
    deepStrictEqual(from("src/crews/analyze/crew.ork.ts", "src/crews/analyze/application/run-analyze.ts"), []);
  });

  it("refuses an import of tests/ from runtime code, not from a test", () => {
    const fake = "tests/support/fake-shell.ts";
    const rule = "runtime code never imports tests/";
    deepStrictEqual(brokenRules({ from: "src/crews/x/application/run.ts", specifier: "../../../../" + fake, to: fake }), [rule]);
    deepStrictEqual(brokenRules({ from: "src/crews/x/application/run.test.ts", specifier: "../../../../" + fake, to: fake }), []);
  });

  it("refuses an import of a fixtures or assertions file from runtime code", () => {
    // Arrange
    const fixtures = "src/crews/x/domain/plan.fixtures.ts";
    const imp = { from: "src/crews/x/domain/plan.ts", specifier: "./plan.fixtures.ts", to: fixtures };

    // Act
    const broken = brokenRules(imp);

    // Assert
    deepStrictEqual(broken, ["runtime code never imports test code (*.test.ts, *.fixtures.ts, *.assertions.ts)"]);
  });

  it("lets a test import its fixtures and assertions, and an assertions file import node:assert", () => {
    // Arrange
    const imports = [
      { from: "src/crews/x/domain/plan.test.ts", specifier: "./plan.fixtures.ts", to: "src/crews/x/domain/plan.fixtures.ts" },
      { from: "src/crews/x/domain/plan.test.ts", specifier: "./plan.assertions.ts", to: "src/crews/x/domain/plan.assertions.ts" },
      { from: "src/crews/x/domain/plan.assertions.ts", specifier: "node:assert", to: null },
    ];

    // Act
    const broken = imports.flatMap(brokenRules);

    // Assert
    deepStrictEqual(broken, []);
  });
});

describe("architecture: runtime globals", () => {
  const usesIn = (text: string, file = "src/x.ts") => runtimeGlobalUses(new Map([[file, text]]), GLOBAL_NAMES)
    .map((u) => `${u.line}:${u.name}`);

  it("sees a global no declaration binds, through globalThis or re-declared", () => {
    const source = [
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
    deepStrictEqual(usesIn(source), [
      "1:tools", "2:tools", "3:agentBuilder", "4:tools", "5:defineCommand", "6:require", "7:inputs", "8:crewBuilder",
      "9:tools",
    ]);
  });

  it("ignores what the file declares, imports or binds, and members of other objects", () => {
    const source = [
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
    deepStrictEqual(usesIn(source), []);
  });

  it("lets each global be used where its rule allows it, and nowhere else", () => {
    const at = (name: string, file: string) => brokenGlobalRule({ file, line: 1, name });
    strictEqual(at("tools", "src/shared/infrastructure/globals.ts"), null);
    strictEqual(at("tools", "src/crews/_probe-raggable/probe.ork.ts"), null);
    strictEqual(at("tools", "src/commands/doctor.cmd.ts"), RUNTIME_GLOBALS[1].rule);
    strictEqual(at("tools", "src/crews/x/application/run-x.ts"), RUNTIME_GLOBALS[1].rule);
    strictEqual(at("defineCommand", "src/commands/fast.cmd.ts"), null);
    strictEqual(at("defineCommand", "src/commands/_lib/session-config.ts"), RUNTIME_GLOBALS[2].rule);
    strictEqual(at("require", "src/shared/infrastructure/globals.ts"), RUNTIME_GLOBALS[0].rule);
  });
});

describe("architecture: dependency rule", () => {
  const sources = readSources();
  const imports = collectImports(sources);

  it("every import keeps the rule", () => {
    const broken = imports.flatMap((imp) =>
      brokenRules(imp).map((rule) => `${edge(imp.from, imp.to ?? imp.specifier)}: ${rule}`));
    deepStrictEqual([...new Set(broken)], []);
  });

  it("no import cycle between files", () => {
    deepStrictEqual(cyclesOf(graphOf(imports)), []);
  });

  it("every use of a runtime global keeps its rule", () => {
    const broken = runtimeGlobalUses(sources, GLOBAL_NAMES).flatMap((use) => {
      const rule = brokenGlobalRule(use);
      return rule === null ? [] : [`${use.file}:${use.line}: ${use.name}: ${rule}`];
    });
    deepStrictEqual(broken, []);
  });
});
