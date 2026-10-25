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
// The rules, the layer tables and the parsers live in architecture.fixtures.ts, with the cases they are tested on.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import {
  ADAPTER_IMPORT_CASES, BOUND_NAMES_SOURCE, GLOBAL_NAMES, GLOBAL_RULE_CASES, GLOBALS_IMPORT_CASES, IMPORT_FORMS_SOURCE,
  LAYER_CASES, LAYER_IMPORT_CASES, TESTS_IMPORT_CASES, UNBOUND_GLOBALS_SOURCE, UNBOUND_GLOBALS_USES,
  brokenGlobalRule, brokenRules, collectImports, cyclesOf, edge, graphOf, layerOf, readSources, runtimeGlobalUses,
  specifiersOf, usesIn,
} from "./architecture.fixtures.ts";

describe("architecture: import parsing", () => {
  it("sees static, re-export, type-only and dynamic imports, and ignores comments and strings", () => {
    // Arrange
    const source = IMPORT_FORMS_SOURCE;

    // Act
    const specifiers = specifiersOf("probe.ts", source);

    // Assert
    deepStrictEqual(specifiers, ["./a.ts", "./b.ts", "./c.ts", "./d.ts", "./e.ts", "./f.ts"]);
  });

  for (const c of LAYER_CASES) {
    it(`finds the layer of a file from its innermost layer folder: ${c.file} is ${c.layer ?? "in no layer"}`, () => {
      // Arrange
      const { file } = c;

      // Act
      const layer = layerOf(file);

      // Assert
      strictEqual(layer, c.layer);
    });
  }

  for (const c of [...GLOBALS_IMPORT_CASES, ...ADAPTER_IMPORT_CASES, ...LAYER_IMPORT_CASES, ...TESTS_IMPORT_CASES]) {
    it(c.name, () => {
      // Arrange
      const { imp } = c;

      // Act
      const broken = brokenRules(imp);

      // Assert
      deepStrictEqual(broken, c.broken);
    });
  }

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
  it("sees a global no declaration binds, through globalThis or re-declared", () => {
    // Arrange
    const source = UNBOUND_GLOBALS_SOURCE;

    // Act
    const uses = usesIn(source);

    // Assert
    deepStrictEqual(uses, UNBOUND_GLOBALS_USES);
  });

  it("ignores what the file declares, imports or binds, and members of other objects", () => {
    // Arrange
    const source = BOUND_NAMES_SOURCE;

    // Act
    const uses = usesIn(source);

    // Assert
    deepStrictEqual(uses, []);
  });

  for (const c of GLOBAL_RULE_CASES) {
    it(`lets each global be used where its rule allows it, and nowhere else: ${c.name} in ${c.file}`, () => {
      // Arrange
      const use = { file: c.file, line: 1, name: c.name };

      // Act
      const rule = brokenGlobalRule(use);

      // Assert
      strictEqual(rule, c.rule);
    });
  }
});

describe("architecture: dependency rule", () => {
  it("every import keeps the rule", () => {
    // Arrange
    const imports = collectImports(readSources());

    // Act
    const broken = imports.flatMap((imp) =>
      brokenRules(imp).map((rule) => `${edge(imp.from, imp.to ?? imp.specifier)}: ${rule}`));

    // Assert
    deepStrictEqual([...new Set(broken)], []);
  });

  it("no import cycle between files", () => {
    // Arrange
    const imports = collectImports(readSources());

    // Act
    const cycles = cyclesOf(graphOf(imports));

    // Assert
    deepStrictEqual(cycles, []);
  });

  it("every use of a runtime global keeps its rule", () => {
    // Arrange
    const sources = readSources();

    // Act
    const broken = runtimeGlobalUses(sources, GLOBAL_NAMES).flatMap((use) => {
      const rule = brokenGlobalRule(use);
      return rule === null ? [] : [`${use.file}:${use.line}: ${use.name}: ${rule}`];
    });

    // Assert
    deepStrictEqual(broken, []);
  });
});
