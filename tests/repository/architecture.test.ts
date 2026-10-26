// Dependency rule, checked statically over every import of every .ts file under
// src/ (static `import … from`, `export … from`, dynamic `import("…")` and type
// `import("…")`):
//   - a file under domain/ imports domain files only;
//   - a file under application/ imports domain and application files only (its
//     tests may import tests/ besides): an allow-list, so a file in no layer is
//     refused as infrastructure is;
//   - a file under domain/ or application/ never imports commands/ nor an entry
//     point (*.cmd.ts, crew.ork.ts, probe.ork.ts);
//   - only shared/infrastructure/ and the crew entry points (crew.ork.ts,
//     probe.ork.ts, which need the builders and inputs()) import
//     shared/infrastructure/globals.ts: a command reaches the runtime through the
//     adapters of orkeon/wiring.ts;
//   - commands/_lib/ never imports shared/infrastructure/: its use cases take
//     their ports as parameters, the entry points wire the adapters, so a test
//     imports them;
//   - a *.cmd.ts never imports crews/*/domain nor crews/*/application: what it
//     runs of a crew goes through a use case of commands/_lib/;
//   - a file of commands/_lib/<group>/ imports its own group, the root of
//     commands/_lib/ and what lies outside commands/_lib/, never another group;
//     a commands/<group>/*.cmd.ts likewise calls the use cases of its own group;
//   - a relative import names its .ts file (the runtime bundler resolves
//     specifiers as written), and runtime code imports nothing but relative
//     files (tests may import node: built-ins);
//   - runtime code never imports tests/: the doubles of tests/support/doubles/ are
//     never bundled (tests next to the code may import them);
//   - a shared check of tests/support/assertions/ imports node: built-ins only,
//     so a test of any layer, a domain test included, may import it;
//   - runtime code never imports test code: a *.test.ts, or the *.fixtures.ts
//     and *.assertions.ts files the tests next to it keep their data and checks in;
//   - no import cycle between files;
//   - a <module>[.<facet>].fixtures.ts or .assertions.ts is imported by the files
//     of its module only (same folder, the name up to the first dot): what several
//     modules share goes under tests/support/ (read over src/ and tests/).
// Every runtime file of src/ sits in a layer folder, or is an entry point, a
// command use case of commands/_lib/ or a declaration (.d.ts). Every read of the
// clock (`new Date()` with no argument, `Date()`, `Date.now()`) sits in
// shared/infrastructure/: the rest of src/ takes the Clock port. The ports barrel
// (shared/application/ports.ts) re-exports every file of application/ports/.
// The runtime globals are checked the same way, over every identifier that
// nothing in its file declares, imports or binds (TypeScript's own scoping), every
// `globalThis.<name>` and every ambient re-declaration (`declare const tools`):
//   - no require(): the sources are ES modules bundled by esbuild;
//   - only shared/infrastructure/ and the crew entry points read `tools`, `rag`,
//     `agentBuilder`, `crewBuilder`, `toolBuilder` and `inputs` (src/crews/.orkeon/orkeon.d.ts
//     declares them for every file, so the type check lets any file call
//     `tools.shellCommand(...)`);
//   - only a *.cmd.ts calls defineCommand or defineAsyncCommand.
// There is no exception list: the last entries went with the compaction's move
// onto the ports, so an import or a global that breaks a rule fails the test.
// The rules, the layer tables and the parsers live in architecture.fixtures.ts, with the cases they are tested on.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import {
  ADAPTER_IMPORT_CASES, APPLICATION_IMPORT_CASES, BOUND_NAMES_SOURCE, CLOCK_CASES, COMMAND_GROUP_IMPORT_CASES,
  COMMAND_IMPORT_CASES, FIXTURES_IMPORT_CASES, LIB_GROUP_IMPORT_CASES, PORTS_BARREL, PORTS_FOLDER, barrelGaps, GLOBAL_NAMES, GLOBAL_RULE_CASES, GLOBALS_IMPORT_CASES, IMPORT_FORMS_SOURCE, LAYER_CASES,
  LAYER_IMPORT_CASES, PLACEMENT_CASES, TESTS_IMPORT_CASES, UNBOUND_GLOBALS_SOURCE, UNBOUND_GLOBALS_USES,
  COMMANDS_LIB, COMMAND_GROUP_RULE, LIB_GROUP_RULE, brokenFixturesRule, brokenGlobalRule, brokenPlacementRule, brokenRules, clockRuleBreaks, collectImports, cyclesOf,
  edge, graphOf, isTest, layerOf, readAllSources, readSources, runtimeGlobalUses, specifiersOf, usesIn,
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

  for (const c of [
    ...GLOBALS_IMPORT_CASES, ...ADAPTER_IMPORT_CASES, ...LAYER_IMPORT_CASES, ...APPLICATION_IMPORT_CASES,
    ...COMMAND_IMPORT_CASES, ...LIB_GROUP_IMPORT_CASES, ...COMMAND_GROUP_IMPORT_CASES, ...TESTS_IMPORT_CASES,
  ]) {
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

describe("architecture: fixtures, placement and clock", () => {
  for (const c of FIXTURES_IMPORT_CASES) {
    it(c.name, () => {
      // Arrange
      const { imp } = c;

      // Act
      const rule = brokenFixturesRule(imp);

      // Assert
      strictEqual(rule, c.rule);
    });
  }

  for (const c of PLACEMENT_CASES) {
    it(`places a runtime file in a layer, an entry point, commands/_lib/ or a declaration: ${c.file} ${c.rule === null ? "is placed" : "is not"}`, () => {
      // Arrange
      const { file } = c;

      // Act
      const rule = brokenPlacementRule(file);

      // Assert
      strictEqual(rule, c.rule);
    });
  }

  for (const c of CLOCK_CASES) {
    it(c.name, () => {
      // Arrange
      const { file, text } = c;

      // Act
      const breaks = clockRuleBreaks(file, text);

      // Assert
      deepStrictEqual(breaks, c.breaks);
    });
  }
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

  it("a commands/_lib/ group imports its own group or the root of commands/_lib/ only", () => {
    // Arrange
    const imports = collectImports(readSources()).filter((imp) => imp.from.startsWith(COMMANDS_LIB));

    // Act
    const broken = imports.filter((imp) => brokenRules(imp).includes(LIB_GROUP_RULE)).map((imp) => edge(imp.from, imp.to ?? imp.specifier));

    // Assert
    deepStrictEqual(broken, []);
  });

  it("a *.cmd.ts calls the use cases of its own group", () => {
    // Arrange
    const imports = collectImports(readSources()).filter((imp) => imp.from.endsWith(".cmd.ts"));

    // Act
    const broken = imports.filter((imp) => brokenRules(imp).includes(COMMAND_GROUP_RULE)).map((imp) => edge(imp.from, imp.to ?? imp.specifier));

    // Assert
    deepStrictEqual(broken, []);
  });

  it("the ports barrel re-exports every file of application/ports/", () => {
    // Arrange
    const sources = readSources();
    const files = [...sources.keys()].filter((file) => file.startsWith(PORTS_FOLDER));

    // Act
    const gaps = barrelGaps(sources.get(PORTS_BARREL) ?? "", files);

    // Assert
    deepStrictEqual(gaps, []);
  });

  it("no import cycle between files", () => {
    // Arrange
    const imports = collectImports(readSources());

    // Act
    const cycles = cyclesOf(graphOf(imports));

    // Assert
    deepStrictEqual(cycles, []);
  });

  it("every fixtures and assertions file is imported by its own module only", () => {
    // Arrange
    const imports = collectImports(readAllSources());

    // Act
    const broken = imports.flatMap((imp) => {
      const rule = brokenFixturesRule(imp);
      return rule === null ? [] : [`${edge(imp.from, imp.to ?? imp.specifier)}: ${rule}`];
    });

    // Assert
    deepStrictEqual(broken, []);
  });

  it("every runtime file of src/ sits in a layer, or is an entry point, a command use case or a declaration", () => {
    // Arrange
    const files = [...readSources().keys()].filter((file) => file.startsWith("src/") && !isTest(file));

    // Act
    const broken = files.flatMap((file) => {
      const rule = brokenPlacementRule(file);
      return rule === null ? [] : [`${file}: ${rule}`];
    });

    // Assert
    deepStrictEqual(broken, []);
  });

  it("every clock read sits in shared/infrastructure/", () => {
    // Arrange
    const sources = [...readSources()].filter(([file]) => file.startsWith("src/") && !isTest(file));

    // Act
    const broken = sources.flatMap(([file, text]) => clockRuleBreaks(file, text));

    // Assert
    deepStrictEqual(broken, []);
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
