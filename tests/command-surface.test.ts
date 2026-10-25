// Command-surface regression (E-1 acceptance): every commands/*.cmd.ts
// declares exactly one primary name, names are unique (the loader's
// ValidateGlobalUniqueness would otherwise skip them as conflicts), match the
// loader's kebab-case rule, and the surface holds the post-E-1 count.
// Run: node --test tests/command-surface.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import {
  B12_COMMANDS, COMMAND_GROUPS, COMMANDS_DIR, collect, E1_COMMANDS, EXPECTED_COMMAND_COUNT, FOLDED_ALIASES, LOADER_DEFAULT_CAP,
  topLevelExports,
} from "./command-surface.fixtures.ts";
import {
  assertAliasesOf, assertCommandsPresent, assertInAGroup, assertKebabNames, assertNoNameConflict, assertNoTopLevelExport,
  assertOneNameEach, assertSlugsMatchNames,
} from "./command-surface.assertions.ts";

describe("command surface", () => {
  it("declares exactly one name literal in every command file", () => {
    // Arrange
    const dir = COMMANDS_DIR;

    // Act
    const cmds = collect(dir);

    // Assert
    assertOneNameEach(cmds);
  });

  it(`holds ${EXPECTED_COMMAND_COUNT} *.cmd.ts commands (post-E-1)`, () => {
    // Arrange
    const dir = COMMANDS_DIR;

    // Act
    const cmds = collect(dir);

    // Assert
    strictEqual(cmds.length, EXPECTED_COMMAND_COUNT);
  });

  it("has zero name conflicts, aliases included (loader ValidateGlobalUniqueness)", () => {
    // Arrange
    const dir = COMMANDS_DIR;

    // Act
    const cmds = collect(dir);

    // Assert
    assertNoNameConflict(cmds);
  });

  it("keeps the folded commands' names as aliases of the commands that absorbed them", () => {
    // Arrange
    const cmds = collect();

    // Act
    const owner = new Map(cmds.flatMap((c) => c.aliases.map((a) => [a, c.name] as const)));

    // Assert
    assertAliasesOf(owner, FOLDED_ALIASES);
  });

  it("every name matches the loader's kebab-case rule", () => {
    // Arrange
    const dir = COMMANDS_DIR;

    // Act
    const cmds = collect(dir);

    // Assert
    assertKebabNames(cmds);
  });

  it("file slug matches the declared name (gap-round diff counts slugs)", () => {
    // Arrange
    const dir = COMMANDS_DIR;

    // Act
    const cmds = collect(dir);

    // Assert
    assertSlugsMatchNames(cmds);
  });

  it("every command file sits in one functional folder of src/commands/", () => {
    // Arrange
    const dir = COMMANDS_DIR;

    // Act
    const cmds = collect(dir);

    // Assert
    assertInAGroup(cmds, COMMAND_GROUPS);
  });

  it("E-1 wave commands are all present", () => {
    // Arrange
    const cmds = collect();

    // Act
    const names = new Set(cmds.map((c) => c.name));

    // Assert
    assertCommandsPresent(names, E1_COMMANDS, "E-1");
  });

  it("B-12 commands are all present", () => {
    // Arrange
    const cmds = collect();

    // Act
    const names = new Set(cmds.map((c) => c.name));

    // Assert
    assertCommandsPresent(names, B12_COMMANDS, "B-12");
  });

  it("help is deliberately NOT scripted (built-in lists both registries)", () => {
    // Arrange
    const dir = COMMANDS_DIR;

    // Act
    const cmds = collect(dir);

    // Assert
    ok(!cmds.some((c) => c.name === "help"));
  });
});

describe("the loader cap covers the whole surface (B-8 probe finding)", () => {
  // The loader keeps the FIRST Orkeon:Cli:ScriptCommands:MaxScripts command files
  // in discovery order and drops the rest with one `warn` line: at 51 commands,
  // under the old default of 50, the REPL quietly booted without /version. The
  // default is 200 since Orkeon rc.6, so the launchers no longer raise it; this
  // keeps the surface under it, so the command that crosses it fails here.
  it("the command files stay under Orkeon's default cap of 200", () => {
    // Arrange
    const dir = COMMANDS_DIR;

    // Act
    const cmds = collect(dir);

    // Assert
    ok(cmds.length < LOADER_DEFAULT_CAP, `${cmds.length} command files reach the loader's default cap`);
  });
});

describe("no top-level export in a *.cmd.ts (B-7 regression)", () => {
  // `/output-style` shipped with `export const OUTPUT_STYLE_STATE_KEY` and simply
  // WAS NOT THERE at runtime: the loader bundles each file and Jint evaluates it in
  // SCRIPT mode, where a top-level `export` is a syntax error —
  //   Failed to load scripted command file /cli-commands/output-style.cmd.ts
  //   Jint.Runtime.JavaScriptException: Unexpected token 'export'
  // The unit tests were green and the esbuild bundle was clean; only a live REPL
  // load surfaced it. The failure mode is the worst kind: a command that reports
  // nothing and is absent from /help, while every offline check passes.
  it("declares no top-level export, in any command file", () => {
    // Arrange
    const cmds = collect();

    // Act
    const found = cmds.map(({ file }) => ({ file, offenders: topLevelExports(file) }));

    // Assert
    assertNoTopLevelExport(found);
  });

  it("covers every command file, so the rule cannot be dodged by adding one", () => {
    // Arrange
    const dir = COMMANDS_DIR;

    // Act
    const cmds = collect(dir);

    // Assert
    ok(cmds.length >= EXPECTED_COMMAND_COUNT);
  });
});
