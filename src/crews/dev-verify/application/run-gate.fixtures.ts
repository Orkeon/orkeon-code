// The pack, sheet, plan and fakes runGate is tested on, and the git lines it issues.
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { DevVerifyTarget } from "./run-gate.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** The pack a YAML text describes; a text that is no pack throws. */
export function pack(yaml: string): RepoPack {
  const r = parseRepoPack(yaml);
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

export const PACK = pack("layout:\n  domain: src\n  tests: tests\n  build_outputs: [bin, obj]\ntests:\n  rule_trait: BR\n");
export const EX = "':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'";
export const UNTRACKED = `git ls-files --others --exclude-standard -- . ${EX}`;
export const TRAIT_GREP = `git grep --untracked -I -noE -e '\\[Trait\\("BR", *"[BCU][CHR]-[0-9]+"\\)\\]' -- src tests ${EX}`;

export const SHEET = "# DEMO-PLAN-F2 — Command\n| Applied rules | DDD-01 |\n## TDD sequence\n| # | Test |\n|---|---|\n" +
  "| 1 | `ShowsTheState` BR-01 |\nTDD: RED [x] GREEN [x] COST [x]\n";
export const PLAN = "# DEMO-PLAN\nNon-applicable rules: DDD-02 DDD-03 DDD-04 DDD-05 DDD-06 DDD-07 DDD-08 DDD-09 DDD-10 DDD-11 " +
  "APP-01 APP-02 APP-03 APP-04 APP-05 PERF-01\n";

/** The notice the runtime appends to an output it cut. */
export const CUT_NOTICE = "\n\n[... truncated, 1234 chars omitted. Use more specific parameters to narrow results.]";

/** The gate's line on a git output the runtime cut. */
export const CUT_LINE = "  FAIL the output of 'git diff --name-only HEAD' was cut by the runtime (1234 characters omitted): " +
  "the list is incomplete, run the gate again on a smaller change";

/** Batch F2 of the plan folder workbench/demo, `over` replacing its fields. */
export function target(over: Partial<DevVerifyTarget> = {}): DevVerifyTarget {
  return {
    batch: "F2", code: "demo", prefix: "DEMO", workShown: "workbench", planDirShown: "workbench/demo",
    sheetShown: "workbench/demo/DEMO-PLAN-F2.md", pack: PACK, packShown: ".orkeon/repo.yaml", ...over,
  };
}

/** The sheet and plan on disk, and the git outputs of a green batch. */
export function fakes(): { files: FakeFiles; shell: FakeShell } {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/workbench/demo/DEMO-PLAN-F2.md`, SHEET);
  files.files.set(`${WORKSPACE}/workbench/demo/DEMO-PLAN.md`, PLAN);
  files.listings.set(`${WORKSPACE}/workbench/demo`, ["DEMO-PLAN-F2.md", "DEMO-PLAN.md", "logs", "notes.txt"]);
  const shell = new FakeShell();
  shell.results["git diff --name-only HEAD"] = { stdout: "src/b.ts\nsrc/a.ts\n" };
  shell.results[UNTRACKED] = { stdout: "tests/a.test.ts\nsrc/a.ts\n" };
  shell.results[TRAIT_GREP] = { stdout: 'tests/a.test.ts:3:[Trait("BR", "BR-01")]\n' };
  return { files, shell };
}

/** The fakes of a plan folder that holds 59 notes listed before the sheet and the plan. */
export function fakesWithNotes(): { files: FakeFiles; shell: FakeShell } {
  const { files, shell } = fakes();
  const notes = Array.from({ length: 59 }, (_, i) => `A-note-${String(i).padStart(2, "0")}.md`);
  for (const n of notes) files.files.set(`${WORKSPACE}/workbench/demo/${n}`, "# note\n");
  files.listings.set(`${WORKSPACE}/workbench/demo`, [...notes, "DEMO-PLAN-F2.md", "DEMO-PLAN.md"]);
  return { files, shell };
}
