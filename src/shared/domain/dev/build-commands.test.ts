// The build run_build runs, the restore it never runs, and the cold tree it restores once. Run:
//   node --test src/shared/domain/dev/build-commands.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { buildCommandFor, coldTree, isRestore } from "./build-commands.ts";
import type { RepoPackCommands } from "./repo-pack.ts";

const PACK: RepoPackCommands = {
  restore: "dotnet restore Orkeon.sln -p:NuGetAudit=false",
  build: "dotnet build Orkeon.sln -c Release --no-restore -warnaserror",
  buildTest: "dotnet build <test project> -c Release --no-restore",
};

describe("buildCommandFor", () => {
  it("runs the pack's build as written, or its build_test with the project filled in", () => {
    deepStrictEqual(buildCommandFor(PACK), { ok: true, command: PACK.build, key: "commands.build" });
    deepStrictEqual(buildCommandFor(PACK, "tests/Core/Orkeon.Core.Tests"), {
      ok: true, command: "dotnet build tests/Core/Orkeon.Core.Tests -c Release --no-restore", key: "commands.build_test",
    });
  });

  it("refuses a project that is not one plain relative value, and a pack without the command", () => {
    strictEqual(buildCommandFor(PACK, "../other").ok, false);
    strictEqual(buildCommandFor(PACK, "a;rm -rf x").ok, false);
    strictEqual(buildCommandFor(PACK, "-p:X=1").ok, false);
    deepStrictEqual(buildCommandFor({}), { ok: false, reason: "the pack has no commands.build" });
    deepStrictEqual(buildCommandFor({ build: "x" }, "a"),
      { ok: false, reason: "the pack has no commands.build_test to build one project" });
    strictEqual(buildCommandFor({ buildTest: "dotnet build <a> <b>" }, "a").ok, false);
  });
});

describe("isRestore", () => {
  it("knows the pack's restore and the restore verbs", () => {
    strictEqual(isRestore(PACK.restore as string, PACK), true);
    strictEqual(isRestore("dotnet restore", PACK), true);
    strictEqual(isRestore("npm ci", {}), true);
    strictEqual(isRestore(PACK.build as string, PACK), false);
    strictEqual(isRestore("dotnet test --no-restore", PACK), false);
  });
});

describe("coldTree", () => {
  it("reads NETSDK1004 and the missing assets file, nothing else", () => {
    strictEqual(coldTree("error NETSDK1004: Assets file '/w/obj/project.assets.json' not found. Run a NuGet package restore"), true);
    strictEqual(coldTree("error CS1002: ; expected"), false);
  });
});
