// The build run_build runs, the restore it never runs, and the cold tree it restores once. Run:
//   node --test tests/shared/domain/dev/build-commands.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { buildCommandFor, coldTree, isRestore } from "../../../../src/shared/domain/dev/build-commands.ts";
import { COLD_TREE_CASES, MISSING_COMMANDS, PACK, REFUSED_PROJECTS, RESTORE_CASES } from "./build-commands.fixtures.ts";

describe("buildCommandFor", () => {
  it("runs the pack's build as written", () => {
    // Arrange
    const commands = PACK;

    // Act
    const result = buildCommandFor(commands);

    // Assert
    deepStrictEqual(result, { ok: true, command: PACK.build, key: "commands.build" });
  });

  it("runs the pack's build_test with the project filled in", () => {
    // Arrange
    const project = "tests/Core/Orkeon.Core.Tests";

    // Act
    const result = buildCommandFor(PACK, project);

    // Assert
    deepStrictEqual(result, {
      ok: true, command: "dotnet build tests/Core/Orkeon.Core.Tests -c Release --no-restore", key: "commands.build_test",
    });
  });

  for (const c of REFUSED_PROJECTS) {
    it(`refuses a project that is not one plain relative value: ${c.name}`, () => {
      // Arrange
      const { commands, project } = c;

      // Act
      const result = buildCommandFor(commands, project);

      // Assert
      strictEqual(result.ok, false);
    });
  }

  for (const c of MISSING_COMMANDS) {
    it(`refuses a pack without the command: ${c.name}`, () => {
      // Arrange
      const { commands, project } = c;

      // Act
      const result = buildCommandFor(commands, project);

      // Assert
      deepStrictEqual(result, { ok: false, reason: c.reason });
    });
  }
});

describe("isRestore", () => {
  for (const c of RESTORE_CASES) {
    it(`knows the pack's restore and the restore verbs: ${c.name}`, () => {
      // Arrange
      const { command, commands } = c;

      // Act
      const result = isRestore(command, commands);

      // Assert
      strictEqual(result, c.expected);
    });
  }
});

describe("coldTree", () => {
  for (const c of COLD_TREE_CASES) {
    it(`reads NETSDK1004 and the missing assets file, nothing else: ${c.name}`, () => {
      // Arrange
      const { output } = c;

      // Act
      const result = coldTree(output);

      // Assert
      strictEqual(result, c.expected);
    });
  }
});
