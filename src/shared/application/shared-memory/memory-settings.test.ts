// The shared memory's settings as they apply (M-2). Run:
//   node --test src/shared/application/shared-memory/memory-settings.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { GIT_REMOTE_ORIGIN, readMemorySettings } from "./memory-settings.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { THROWING_CONFIG, configOf, originAnswering } from "./memory-settings.fixtures.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

describe("readMemorySettings", () => {
  it("defaults to .orkeon/memory, the origin remote's name and no auto-admission", async () => {
    // Arrange
    const shell = originAnswering({ stdout: "git@github.com:Orkeon/orkeon-code.git\n" });

    // Act
    const s = await readMemorySettings({ config: configOf({}), shell });

    // Assert
    strictEqual(s.dir, ".orkeon/memory");
    strictEqual(s.layout.root, `${WORKSPACE}/.orkeon/memory`);
    strictEqual(s.project, "orkeon-code");
    strictEqual(s.collection, "memory-orkeon-code");
    strictEqual(s.autoAdmitAudited, false);
    deepStrictEqual(s.warnings, []);
  });

  it("names the project 'local' without an origin remote", async () => {
    // Arrange
    const shell = originAnswering({ exitCode: 2 });

    // Act
    const s = await readMemorySettings({ config: configOf({}), shell });

    // Assert
    strictEqual(s.project, "local");
  });

  it("names the project 'local' without git", async () => {
    // Arrange
    const shell = new FakeShell();
    shell.errors[GIT_REMOTE_ORIGIN] = new Error("git: not allowed");

    // Act
    const s = await readMemorySettings({ config: configOf({}), shell });

    // Assert
    strictEqual(s.project, "local");
  });

  it("applies the three keys, and asks git nothing when memory.project is set", async () => {
    // Arrange
    const shell = new FakeShell();
    const config = configOf({ "memory.dir": "docs/memory/", "memory.project": "billing", "memory.autoAdmitAudited": "true" });

    // Act
    const s = await readMemorySettings({ config, shell });

    // Assert
    strictEqual(s.dir, "docs/memory");
    strictEqual(s.collection, "memory-billing");
    strictEqual(s.autoAdmitAudited, true);
    deepStrictEqual(shell.commands, []);
  });

  it("sets an invalid stored value aside with a warning, never refuses", async () => {
    // Arrange
    const shell = originAnswering({ stdout: "https://example.org/shop.git" });
    const config = configOf({ "memory.dir": "../x", "memory.project": "Bad Name" });

    // Act
    const s = await readMemorySettings({ config, shell });

    // Assert
    strictEqual(s.dir, ".orkeon/memory");
    strictEqual(s.project, "shop");
    strictEqual(s.warnings.length, 2);
    strictEqual(s.warnings[0].startsWith("memory.dir '../x' set aside"), true, s.warnings[0]);
  });

  it("reads a config store that throws as unset", async () => {
    // Arrange
    const shell = new FakeShell();

    // Act
    const s = await readMemorySettings({ config: THROWING_CONFIG, shell });

    // Assert
    strictEqual(s.dir, ".orkeon/memory");
    strictEqual(s.project, "local");
  });
});
