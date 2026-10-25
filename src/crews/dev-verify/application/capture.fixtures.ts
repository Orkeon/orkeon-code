// The pack, sheet, gate run, fakes and cost index writeCapture is tested on.
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import { traitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import { sheetFacts } from "../domain/sheet-facts.ts";
import { gitDiffTracked, gitMethodGrep } from "../domain/commands.ts";
import type { DevVerifyTarget, GateRun } from "./run-gate.ts";
import type { CostIndex } from "../../../shared/application/ports.ts";
import { WORKSPACE } from "../../../shared/domain/dev/path-rebase.ts";

export const DIR = `${WORKSPACE}/workbench/demo/capture-F2`;
export const BUILD = "dotnet build Demo.sln -c Release";
export const BUILD_LOG = `${WORKSPACE}/workbench/demo/logs/F2-build.txt`;

function pack(yaml: string): RepoPack {
  const r = parseRepoPack(yaml);
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

export const PACK = pack(`layout:\n  domain: src\n  tests: tests\ncommands:\n  build: ${BUILD}\ntests:\n  rule_trait: BR\n`);
export const SHEET = "# DEMO-PLAN-F2 — Lines\n| Applied rules | DDD-01 |\n## TDD sequence\n| # | Test |\n|---|---|\n" +
  "| 1 | `Adds_a_line` BR-01 |\nTDD: RED [x] GREEN [x] COST [x]\n";

/** Batch F2 of the plan folder workbench/demo, `over` replacing its fields. */
export function target(over: Partial<DevVerifyTarget> = {}): DevVerifyTarget {
  return {
    batch: "F2", code: "demo", prefix: "DEMO", workShown: "workbench", planDirShown: "workbench/demo",
    sheetShown: "workbench/demo/DEMO-PLAN-F2.md", pack: PACK, packShown: ".orkeon/repo.yaml", ...over,
  };
}

/** A green gate run over SHEET that found `changedFiles`, `untrackedFiles` among them. */
export function gate(changedFiles: string[], untrackedFiles: string[] = []): GateRun {
  return {
    report: { green: true, lines: [], checks: [], missingDesignIds: [], outside: [], untested: [], stray: [] },
    sheet: SHEET, facts: sheetFacts(SHEET),
    roots: ["src", "tests"], excludes: [],
    changedFiles, untrackedFiles,
    trait: traitMarker("BR", undefined), traitHits: ['tests/LineTests.cs:7:[Trait("BR", "BR-01")]'],
  };
}

export const CHANGED = ["src/Order.cs", "tests/LineTests.cs", "workbench/demo/DEMO-PLAN-F2.md"];

/** The changed sources and a green build log on disk, the diff of Order.cs and the hit of the sheet's method. */
export function fakes(): { files: FakeFiles; shell: FakeShell } {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/src/Order.cs`, "public class Order {}\n");
  files.files.set(`${WORKSPACE}/tests/LineTests.cs`, "public class LineTests { void Adds_a_line() {} }\n");
  files.files.set(BUILD_LOG, "Build succeeded.\nexit=0\n");
  const shell = new FakeShell();
  shell.results[gitDiffTracked("src/Order.cs") as string] = { stdout: "+public class Order {}\n" };
  shell.results[gitMethodGrep(["Adds_a_line"], ["tests"], []) as string] = { stdout: "tests/LineTests.cs:1:Adds_a_line\n" };
  return { files, shell };
}

/** The text writeCapture wrote to `name` in the capture folder, "(absent)" when it wrote none. */
export function written(files: FakeFiles, name: string): string {
  return files.files.get(`${DIR}/${name}`) ?? "(absent)";
}

/** The section files of a full capture, the index first and table.md last. */
export const SECTION_FILES: readonly string[] = [
  "index.txt", "manifest.txt", "status.txt", "changed-files.txt", "diff-001.txt", "diff-002.txt", "build.txt",
  "cost.txt", "traits.txt", "test-tail.txt", "test-classes.txt", "table.md",
];

/** The first lines of the capture's index. */
export const INDEX_HEAD: readonly string[] = [
  "# Audit capture — batch F2", "sheet: workbench/demo/DEMO-PLAN-F2.md", "generated: 2026-10-22 14:05", "gate: green", "files:",
];

/** A diff of 40 000 characters: 2 000 lines of 18 characters, then 20 000 characters on one line. */
export const DIFF_OF_40_000 = `${"+x".repeat(9)}\n`.repeat(2_000) + "y".repeat(20_000);

/** The notice the runtime appends to an output it cut. */
export const CUT_NOTICE = "\n\n[... truncated, 1234 chars omitted. Use more specific parameters to narrow results.]";

/** Forty-one changed files: one more than the capture diffs. */
export const FORTY_ONE_FILES: string[] = Array.from({ length: 41 }, (_, i) => `src/F${String(i).padStart(2, "0")}.cs`);

/** Changed files under the plan folder, after one source file. */
export const PLAN_FOLDER_CHANGES: string[] = [
  "src/Order.cs", "workbench/demo/capture-F2/diff-001.txt", "workbench/demo/DEMO-VERDICT-F2.md", "workbench/demo/logs/F2-build.txt",
];

type Member = NonNullable<Awaited<ReturnType<CostIndex["accessCost"]>>["report"]>["members"][number];

/** A member that calls _repository.Save in a loop at `line`. */
export function saveInALoop(member: string, line: number): Member {
  return {
    member, memoryFilters: [], cost: { reads: 0, writes: 0, loops: 1, lambdas: 0, memoryFilters: 0 },
    portCalls: [{ receiver: "_repository", method: "Save", line, inLoop: true, inLambda: false }],
  };
}

/** A cost index whose report holds `members`, `loops` loops in all. */
export function costIndexOf(members: Member[], loops: number): CostIndex {
  return {
    roots: async () => [WORKSPACE],
    refresh: async () => [],
    accessCost: async () => ({
      report: { members, cost: { reads: 0, writes: 0, loops, lambdas: 0, memoryFilters: 0 } },
      errors: [],
    }),
  };
}

/** A diff of Order.cs that adds one line, line 4. */
export const DIFF_ADDING_LINE_4 = "--- a/src/Order.cs\n+++ b/src/Order.cs\n@@ -3,0 +4,1 @@\n+  await _repository.Save(o);\n";
