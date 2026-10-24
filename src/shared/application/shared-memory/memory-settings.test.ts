// The shared memory's settings as they apply (M-2). Run:
//   node --test src/shared/application/shared-memory/memory-settings.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { GIT_REMOTE_ORIGIN, readMemorySettings } from "./memory-settings.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const configOf = (values: Record<string, string>) => ({
  readValue: async (key: string) => ({ key, value: values[key], source: values[key] === undefined ? "unset" as const : "file" as const }),
});

describe("readMemorySettings", () => {
  it("defaults to .orkeon/memory, the origin remote's name and no auto-admission", async () => {
    const shell = new FakeShell();
    shell.results[GIT_REMOTE_ORIGIN] = { stdout: "git@github.com:Orkeon/orkeon-code.git\n" };
    const s = await readMemorySettings({ config: configOf({}), shell });
    strictEqual(s.dir, ".orkeon/memory");
    strictEqual(s.layout.root, "/workspace/.orkeon/memory");
    strictEqual(s.project, "orkeon-code");
    strictEqual(s.collection, "memory-orkeon-code");
    strictEqual(s.autoAdmitAudited, false);
    deepStrictEqual(s.warnings, []);
  });

  it("names the project 'local' without an origin remote, or without git", async () => {
    const shell = new FakeShell();
    shell.results[GIT_REMOTE_ORIGIN] = { exitCode: 2 };
    strictEqual((await readMemorySettings({ config: configOf({}), shell })).project, "local");
    const none = new FakeShell();
    none.errors[GIT_REMOTE_ORIGIN] = new Error("git: not allowed");
    strictEqual((await readMemorySettings({ config: configOf({}), shell: none })).project, "local");
  });

  it("applies the three keys, and asks git nothing when memory.project is set", async () => {
    const shell = new FakeShell();
    const s = await readMemorySettings({
      config: configOf({ "memory.dir": "docs/memory/", "memory.project": "billing", "memory.autoAdmitAudited": "true" }), shell,
    });
    strictEqual(s.dir, "docs/memory");
    strictEqual(s.collection, "memory-billing");
    strictEqual(s.autoAdmitAudited, true);
    deepStrictEqual(shell.commands, []);
  });

  it("sets an invalid stored value aside with a warning, never refuses", async () => {
    const shell = new FakeShell();
    shell.results[GIT_REMOTE_ORIGIN] = { stdout: "https://example.org/shop.git" };
    const s = await readMemorySettings({ config: configOf({ "memory.dir": "../x", "memory.project": "Bad Name" }), shell });
    strictEqual(s.dir, ".orkeon/memory");
    strictEqual(s.project, "shop");
    strictEqual(s.warnings.length, 2);
    strictEqual(s.warnings[0].startsWith("memory.dir '../x' set aside"), true, s.warnings[0]);
  });

  it("reads a config store that throws as unset", async () => {
    const shell = new FakeShell();
    const s = await readMemorySettings({ config: { readValue: async () => { throw new Error("no files"); } }, shell });
    strictEqual(s.dir, ".orkeon/memory");
    strictEqual(s.project, "local");
  });
});
