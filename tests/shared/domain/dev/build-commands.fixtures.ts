// The pack commands and outputs the build helpers are tested on.
import type { RepoPackCommands } from "../../../../src/shared/domain/dev/repo-pack.ts";

export const PACK: RepoPackCommands = {
  restore: "dotnet restore Orkeon.sln -p:NuGetAudit=false",
  build: "dotnet build Orkeon.sln -c Release --no-restore -warnaserror",
  buildTest: "dotnet build <test project> -c Release --no-restore",
};

export interface BuildCase {
  name: string;
  commands: RepoPackCommands;
  project?: string;
}

/** A project that is no plain relative value, or a build_test with two placeholders: refused. */
export const REFUSED_PROJECTS: readonly BuildCase[] = [
  { name: "a project out of the checkout", commands: PACK, project: "../other" },
  { name: "a project carrying a second command", commands: PACK, project: "a;rm -rf x" },
  { name: "a project read as an option", commands: PACK, project: "-p:X=1" },
  { name: "a build_test with two placeholders", commands: { buildTest: "dotnet build <a> <b>" }, project: "a" },
];

export interface MissingCase extends BuildCase {
  reason: string;
}

/** A pack without the command asked for: refused with the key it lacks. */
export const MISSING_COMMANDS: readonly MissingCase[] = [
  { name: "no commands.build", commands: {}, reason: "the pack has no commands.build" },
  {
    name: "no commands.build_test for one project",
    commands: { build: "x" },
    project: "a",
    reason: "the pack has no commands.build_test to build one project",
  },
];

export interface RestoreCase {
  name: string;
  command: string;
  commands: RepoPackCommands;
  expected: boolean;
}

export const RESTORE_CASES: readonly RestoreCase[] = [
  { name: "the pack's restore", command: PACK.restore as string, commands: PACK, expected: true },
  { name: "dotnet restore", command: "dotnet restore", commands: PACK, expected: true },
  { name: "npm ci without a pack restore", command: "npm ci", commands: {}, expected: true },
  { name: "the pack's build", command: PACK.build as string, commands: PACK, expected: false },
  { name: "a test run with --no-restore", command: "dotnet test --no-restore", commands: PACK, expected: false },
];

export interface ColdCase {
  name: string;
  output: string;
  expected: boolean;
}

export const COLD_TREE_CASES: readonly ColdCase[] = [
  {
    name: "NETSDK1004 and the missing assets file",
    output: "error NETSDK1004: Assets file '/w/obj/project.assets.json' not found. Run a NuGet package restore",
    expected: true,
  },
  { name: "a compile error", output: "error CS1002: ; expected", expected: false },
];
