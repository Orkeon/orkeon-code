// runDevImplement over FakeFiles, a scripted shell (git status from a fake tree, each test file red or
// green), two scripted roles that write into that tree, and fake shell jobs: the steps in order, the
// checks that stop a batch, the resume, the hand-over to /dev-verify, and the close. Run:
//   node --test src/crews/dev-implement/application/run-dev-implement.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { GIT_TOPLEVEL } from "../../../shared/application/dev/resolve-work-folder.ts";
import type { ActRequest, AffectedTests, CostIndex, ShellJobs, ShellOptions, ShellResult } from "../../../shared/application/ports.ts";
import { GIT_IDENT_COMMAND } from "../../../shared/domain/git/close.ts";
import { STATUS_COMMAND } from "./observe.ts";
import { touchedPath, verdictMarkOf } from "./touched.ts";
import { BATCHES_ACTIVE_RECORD } from "../../../shared/domain/dev/batches-state.ts";
import { implementInputs, runDevImplement } from "./run-dev-implement.ts";
import type { ImplementAnswer } from "./run-dev-implement.ts";
import { FakePrecedents } from "../../../../tests/doubles/fake-precedents.ts";
import { AUDIT_UNFINISHED_GAP } from "../../../shared/domain/dev/verdict-format.ts";

const DIR = "/workspace/workbench/demo";
const SHEET_PATH = `${DIR}/DEMO-PLAN-F1.md`;
const PACK = "layout:\n  domain: src\n  tests: tests\ncommands:\n  restore: npm ci\n  build: npm run build\n" +
  "  test_class: node --test <Class>\n  test: npm test\n";
const STEP_TABLE = (name: string, id: string) =>
  ["| # | Test | Level | Project | Ids |", "|---|------|-------|---------|-----|", `| 1 | \`${name}\` | unit | \`tests\` | ${id} |`, ""];
const SHEET = [
  "# DEMO-PLAN-F1 — Demo", "",
  "## Design", "| Point | Decision |", "|-------|----------|", "| Applied rules | DDD-01 |", "| Access cost | 1 read |", "",
  "## TDD sequence",
  "### Step 1 — One", ...STEP_TABLE("does one", "BR-01"), "TDD: RED [ ] GREEN [ ] COST [ ]", "",
  "### Step 2 — Two", ...STEP_TABLE("does two", "BR-02"), "TDD: RED [ ] GREEN [ ] COST [ ]", "",
  "### Step 3 — Build and tests", "No test of its own.", "",
  "## Code elements", "- `one()` — does one", "",
  "## Anchors",
  "| Step | Test class / fixture | Shared doubles and builders | Production filled or created |",
  "|------|----------------------|-----------------------------|------------------------------|",
  "| 1 — One | `tests/a.test.ts` — to create | — | `src/a.ts` — to create |",
  "| 2 — Two | `tests/b.test.ts` — to create | — | `src/b.ts` — to create |",
  "| 3 — Build and tests | — | — | — |", "",
].join("\n");
const TICKED = "TDD: RED [x] GREEN [x] COST [x]";

/** The tree the roles write into: dirty paths and their content, and which test files pass. */
class Tree {
  dirty = new Map<string, string>();
  passing = new Set<string>();
  /** The failure count a failing run of a test file shows (`# fail <n>`); unset, its tail shows none. */
  failures = new Map<string, number>();
  readonly files: FakeFiles;
  constructor(files: FakeFiles) { this.files = files; }
  /** The running role's write tool: hears each path the role writes. Unset, a write is a run's output. */
  onWrite: ((path: string) => void) | null = null;
  write(path: string, content: string): void {
    this.dirty.set(path, content);
    this.files.files.set(`/workspace/${path}`, content);
    this.onWrite?.(path);
  }
  /** What a run of the role's tests leaves in the tree, through no write tool. */
  output(path: string, content: string): void {
    const heard = this.onWrite;
    this.onWrite = null;
    this.write(path, content);
    this.onWrite = heard;
  }
}

class TreeShell extends FakeShell {
  readonly tree: Tree;
  constructor(tree: Tree) { super(); this.tree = tree; }
  override async run(command: string, options?: ShellOptions): Promise<ShellResult> {
    const base = await super.run(command, options);
    if (command === STATUS_COMMAND) return { ...base, stdout: [...this.tree.dirty.keys()].map((p) => `?? ${p}`).join("\n") };
    const test = /^node --test (\S+)$/.exec(command);
    if (test) return { ...base, exitCode: this.tree.passing.has(test[1]) ? 0 : 1, stdout: this.tree.passing.has(test[1]) ? "ok" : this.tree.failures.has(test[1]) ? `not ok 1\n# fail ${this.tree.failures.get(test[1])}` : "not ok 1" };
    return base;
  }
}

type Act = (prompt: string, tree: Tree) => string;

class Role {
  acts: Array<{ prompt: string; request: ActRequest; writable: readonly string[] }> = [];
  wrote: (path: string) => void = () => {};
  writable: readonly string[] = [];
  readonly tree: Tree;
  readonly script: Act[];
  constructor(tree: Tree, script: Act[]) { this.tree = tree; this.script = script; }
  async act(prompt: string, request: ActRequest): Promise<string> {
    this.acts.push({ prompt, request, writable: this.writable });
    const step = this.script[Math.min(this.acts.length - 1, this.script.length - 1)];
    this.tree.onWrite = this.wrote;
    try {
      return step(prompt, this.tree);
    } finally {
      this.tree.onWrite = null;
    }
  }
}

class FakeJobs implements ShellJobs {
  started: string[] = [];
  exit: Record<string, number> = {};
  async start(command: string) { this.started.push(command); return { id: `j${this.started.length}`, log: `/output/jobs/j${this.started.length}.log` }; }
  async status(id: string) { return { running: false, exitCode: this.exit[this.started[Number(id.slice(1)) - 1]] ?? 0 }; }
  async tail() { return "all green"; }
  async wait() { return true; }
}

const writesTest = (file: string): Act => (_p, tree) => { tree.write(file, `test ${file}`); return `wrote ${file}`; };
const writesCode = (file: string, test: string, cost = "Cost: 1 reads, 0 writes; none"): Act => (_p, tree) => {
  tree.write(file, `code ${file}`);
  tree.passing.add(test);
  return `changed ${file}\n${cost}`;
};

function setup(author: Act[], implementer: Act[], sheet = SHEET) {
  const files = new FakeFiles();
  files.files.set("/workspace/.orkeon/repo.yaml", PACK);
  files.files.set(SHEET_PATH, sheet);
  files.listings.set("/workspace", ["workbench", "src", "tests"]);
  files.listings.set("/workspace/workbench", ["demo"]);
  files.listings.set(DIR, ["DEMO-PLAN-F1.md", "DEMO-PLAN.md"]);
  const tree = new Tree(files);
  const shell = new TreeShell(tree);
  shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
  const roles = { "test-author": new Role(tree, author), implementer: new Role(tree, implementer) };
  const jobs = new FakeJobs();
  const deps = {
    files, shell, jobs, log: new FakeLogger(), config: createConfigStore({ files, session: new FakeSessionStore() }),
    roleLlm: (role: "test-author" | "implementer", _layout: unknown, wrote: (path: string) => void, writable: readonly string[]) => {
      roles[role].wrote = wrote;
      roles[role].writable = writable;
      return roles[role];
    },
    today: () => "2026-10-24",
  } as {
    files: FakeFiles; shell: TreeShell; jobs: FakeJobs; log: FakeLogger; config: ReturnType<typeof createConfigStore>;
    roleLlm: (role: "test-author" | "implementer", layout: unknown, wrote: (path: string) => void, writable: readonly string[]) => Role;
    today: () => string; costIndex?: CostIndex; openerFor?: (context: unknown) => undefined;
    precedents?: FakePrecedents["recall"];
  };
  return { files, shell, tree, roles, jobs, deps };
}

const parse = (text: string): ImplementAnswer => JSON.parse(text) as ImplementAnswer;
const blockedLine = (a: ImplementAnswer): string | undefined => a.lines.find((l) => l.startsWith("BLOCKED"));

describe("runDevImplement — the steps", () => {
  it("runs every step RED then GREEN, ticks each box once seen, and hands over to the audit", async () => {
    const t = setup([writesTest("tests/a.test.ts"), writesTest("tests/b.test.ts")],
      [writesCode("src/a.ts", "tests/a.test.ts"), writesCode("src/b.ts", "tests/b.test.ts")]);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(a.next, { crew: "dev-verify", input: { batch: "F1", plan: "demo", mode: "fast" } });
    strictEqual((t.files.files.get(SHEET_PATH) ?? "").split(TICKED).length - 1, 2);
    deepStrictEqual(t.jobs.started, ["npm run build", "npm test"]);
    strictEqual(t.shell.commands.filter((c) => c === "npm ci").length, 1); // restored once, for both steps
    deepStrictEqual(JSON.parse(t.files.files.get(touchedPath("demo", "F1")) ?? "{}").touched,
      ["src/a.ts", "src/b.ts", "tests/a.test.ts", "tests/b.test.ts"]);
  });

  it("puts the whitespace git diff --check refuses right in the files a role changed, and says so", async () => {
    const untidy: Act = (_p, tree) => { tree.write("src/a.ts", "export const a = 1; \n\n\n"); tree.passing.add("tests/a.test.ts"); return "changed src/a.ts\nCost: 1 reads, 0 writes; none"; };
    const t = setup([writesTest("tests/a.test.ts")], [untidy]);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(t.files.files.get("/workspace/src/a.ts"), "export const a = 1;\n");
    strictEqual(t.files.files.get("/workspace/tests/a.test.ts"), "test tests/a.test.ts");
    ok(a.lines.includes("whitespace ✓ — src/a.ts: trailing whitespace on 1 line, 2 blank lines at EOF removed"), a.lines.join("\n"));
    ok(!a.lines.some((l) => l.includes("whitespace ✓ — tests/a.test.ts")), a.lines.join("\n"));
  });

  it("gives each role its own tools in acceptEdits, and its brief", () => {
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")]);
    return runDevImplement({ batch: "F1", plan: "demo" }, t.deps).then(() => {
      const red = t.roles["test-author"].acts[0];
      const green = t.roles.implementer.acts[0];
      strictEqual(red.request.permissionMode, "acceptEdits");
      ok(red.request.tools?.includes("run_tests") && !red.request.tools?.includes("run_build"));
      ok(green.request.tools?.includes("run_build"));
      ok(red.prompt.includes("`does one`") && red.prompt.includes("node --test tests/a.test.ts"));
      ok(green.prompt.includes("not ok 1"));
      // Each brief carries the sheet; the implementer's carries the test file the test author wrote, the test
      // author's none (its file is to create).
      ok(red.prompt.includes("## In this brief (do not open these files again)\n### workbench/demo/DEMO-PLAN-F1.md\n```text\n# DEMO-PLAN-F1"), red.prompt);
      ok(!red.prompt.includes("### tests/a.test.ts"), red.prompt);
      ok(green.prompt.includes("### tests/a.test.ts\n```text\ntest tests/a.test.ts\n```"), green.prompt);
    });
  });

  it("blocks a production write at RED outside the step's stubs, and ticks nothing", async () => {
    const t = setup([(_p, tree) => { tree.write("tests/a.test.ts", "t"); tree.write("src/other.ts", "stub"); return "done"; }], []);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), "BLOCKED — step 1 RED: a production path changed before a red test: src/other.ts" +
      " (log: workbench/demo/logs/F1-run_tests-1.log)");
    strictEqual(t.files.files.get(SHEET_PATH), SHEET);
    strictEqual(a.next, undefined);
  });

  it("blocks a RED whose tests pass at once", async () => {
    const t = setup([(_p, tree) => { tree.write("tests/a.test.ts", "t"); tree.passing.add("tests/a.test.ts"); return "done"; }], []);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    ok(blockedLine(a)?.startsWith("BLOCKED — step 1 RED: the new tests pass at once"));
  });

  it("blocks a test write at GREEN, RED alone ticked", async () => {
    const t = setup([writesTest("tests/a.test.ts")], [(_p, tree) => {
      tree.write("tests/a.test.ts", "weakened"); tree.write("src/a.ts", "c"); tree.passing.add("tests/a.test.ts"); return "Cost: 0 reads, 0 writes; none";
    }]);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    ok(blockedLine(a)?.startsWith("BLOCKED — step 1 GREEN: a test file changed while turning it green: tests/a.test.ts"));
    ok((t.files.files.get(SHEET_PATH) ?? "").includes("TDD: RED [x] GREEN [ ] COST [ ]"));
  });

  it("asks once for a missing Cost line, and stops on a port call in a loop", async () => {
    const t = setup([writesTest("tests/a.test.ts")],
      [writesCode("src/a.ts", "tests/a.test.ts", "no cost here"), () => "Cost: 9 reads, 0 writes; a read in a loop over entries"]);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    ok(blockedLine(a)?.startsWith("BLOCKED — step 1 COST: a port call in a loop"));
    deepStrictEqual(t.roles.implementer.acts[1].request.tools, []);
    ok((t.files.files.get(SHEET_PATH) ?? "").includes("TDD: RED [x] GREEN [x] COST [ ]"));
  });

  it("resumes at the first open step", async () => {
    const sheet = SHEET.replace("TDD: RED [ ] GREEN [ ] COST [ ]", TICKED);
    const t = setup([writesTest("tests/b.test.ts")], [writesCode("src/b.ts", "tests/b.test.ts")], sheet);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    strictEqual(t.roles["test-author"].acts.length, 1);
    ok(t.roles["test-author"].acts[0].prompt.includes("step 2"));
  });

  it("blocks a red suite with its log, and hands over nothing", async () => {
    const t = setup([writesTest("tests/a.test.ts"), writesTest("tests/b.test.ts")],
      [writesCode("src/a.ts", "tests/a.test.ts"), writesCode("src/b.ts", "tests/b.test.ts")]);
    t.jobs.exit["npm test"] = 1;
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    ok(blockedLine(a)?.startsWith("BLOCKED — test: 'npm test' exited 1 (log: workbench/demo/logs/F1-test.txt)"), a.lines.join("\n"));
    ok((t.files.files.get(`${DIR}/logs/F1-test.txt`) ?? "").endsWith("exit=1\n"));
    strictEqual(a.next, undefined);
  });

  it("puts the sheet back and blocks when a role ticks a box itself", async () => {
    const t = setup([(_p, tree) => {
      tree.write("tests/a.test.ts", "t");
      tree.write("workbench/demo/DEMO-PLAN-F1.md", SHEET.replace("TDD: RED [ ]", "TDD: RED [x]"));
      return "done";
    }], []);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    ok(blockedLine(a)?.startsWith("BLOCKED — step 1 RED: test-author changed the plan folder (workbench/demo/DEMO-PLAN-F1.md)"), a.lines.join("\n"));
    strictEqual(t.files.files.get(SHEET_PATH), SHEET);
  });

  it("keeps what a role's own test runs leave in the tree out of its changes", async () => {
    const t = setup([(_p, tree) => { tree.write("tests/a.test.ts", "t"); tree.output("src/obj/cache.bin", "x"); return "done"; }],
      [(_p, tree) => { tree.write("src/a.ts", "c"); tree.output("src/obj/cache2.bin", "y"); tree.passing.add("tests/a.test.ts"); return "Cost: 1 reads, 0 writes; none"; }],
      SHEET.replace(/### Step 2[\s\S]*?TDD: RED \[ \] GREEN \[ \] COST \[ \]/, (m) => m.replace("TDD: RED [ ] GREEN [ ] COST [ ]", TICKED)));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(JSON.parse(t.files.files.get(touchedPath("demo", "F1")) ?? "{}").touched, ["src/a.ts", "tests/a.test.ts"]);
  });

  it("refuses a batch that is not F<n> and a pack without layout.tests", async () => {
    const t = setup([], []);
    ok(blockedLine(parse(await runDevImplement({ batch: "x" }, t.deps)))?.includes("F<n>"));
    t.files.files.set("/workspace/.orkeon/repo.yaml", "commands:\n  test: npm test\n");
    ok(blockedLine(parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps)))?.includes("layout.tests"));
  });
});

describe("runDevImplement — the close", () => {
  const VALID = "# DEMO-VERIFY-F1 — 2026-10-24 10:00 — fast\n\n## Verdict — VALID\n\nNone.\n";

  it("refuses without a VALID verdict", async () => {
    const t = setup([], []);
    t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, VALID.replace("VALID", "GAPS"));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", close: true }, t.deps));
    ok(blockedLine(a)?.includes("not VALID: nothing is committed"));
  });

  it("refuses a read-only session mode before anything is read or run", async () => {
    const t = setup([], []);
    t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, VALID);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", close: true, permissionMode: "plan" }, t.deps));
    ok(blockedLine(a)?.includes("the session mode plan is read-only"), a.lines.join("\n"));
    deepStrictEqual(t.shell.commands, []);
  });

  it("refuses when no file was recorded", async () => {
    const t = setup([], []);
    t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, VALID);
    ok(blockedLine(parse(await runDevImplement({ batch: "F1", plan: "demo", close: true }, t.deps)))?.includes("no file recorded"));
  });

  const DONE_SHEET = SHEET.replaceAll("TDD: RED [ ] GREEN [ ] COST [ ]", TICKED);
  const recorded = (mark = "none") => JSON.stringify({ touched: ["src/a.ts", "tests/a.test.ts"], verdictMark: mark });

  it("refuses a verdict not written since the last run changed the batch", async () => {
    const t = setup([], [], DONE_SHEET);
    t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, VALID);
    t.files.files.set(touchedPath("demo", "F1"), recorded(verdictMarkOf(VALID)));
    ok(blockedLine(parse(await runDevImplement({ batch: "F1", plan: "demo", close: true }, t.deps)))?.includes("audit it again"));
  });

  it("refuses a sheet with a box still open", async () => {
    const t = setup([], []);
    t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, VALID);
    t.files.files.set(touchedPath("demo", "F1"), recorded());
    ok(blockedLine(parse(await runDevImplement({ batch: "F1", plan: "demo", close: true }, t.deps)))?.includes("step 1, 2 of DEMO-PLAN-F1.md still has a TDD box open"));
  });

  it("commits exactly the recorded files, nothing else of the tree", async () => {
    const t = setup([], [], DONE_SHEET);
    t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, VALID);
    t.files.files.set(touchedPath("demo", "F1"), recorded());
    t.shell.results["git -c core.quotePath=false status --short --untracked-files=all"] = { stdout: " M src/a.ts\n?? tests/a.test.ts\n M other.ts\n" };
    t.shell.results["git branch --show-current"] = { stdout: "feat/demo\n" };
    t.shell.results[GIT_IDENT_COMMAND] = { stdout: "Ada <ada@example.com> 1 +0000" };
    t.shell.results["git var GIT_COMMITTER_IDENT"] = { stdout: "Ada <ada@example.com> 1 +0000" };
    t.shell.results["git rev-parse --short HEAD"] = { stdout: "abc1234\n" };
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", close: true }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(t.shell.commands.filter((c) => c.includes(" add -- ") || c.includes(" commit ")), [
      "git --literal-pathspecs add -- 'src/a.ts' 'tests/a.test.ts'",
      "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'src/a.ts' 'tests/a.test.ts'",
    ]);
  });

  it("stops at git's missing identity, before any commit", async () => {
    const t = setup([], [], DONE_SHEET);
    t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, VALID);
    t.files.files.set(touchedPath("demo", "F1"), recorded());
    t.shell.results["git branch --show-current"] = { stdout: "feat/demo\n" };
    t.shell.results[GIT_IDENT_COMMAND] = { exitCode: 128, stderr: "fatal: unable to auto-detect email address" };
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", close: true }, t.deps));
    ok(a.lines.some((l) => /identity|git config/i.test(l)), a.lines.join("\n"));
    strictEqual(t.shell.commands.some((c) => c.startsWith("git commit")), false);
  });
});

describe("runDevImplement — wave 4", () => {
  const CYCLE_SHEET = SHEET.replace("| 2 — Two | `tests/b.test.ts` — to create | — | `src/b.ts` — to create |",
    "| 2 — Two | `tests/a.test.ts` — existing | — | `src/a.ts` — existing |");
  const ONE_STEP = SHEET.replace(/### Step 2[\s\S]*?TDD: RED \[ \] GREEN \[ \] COST \[ \]/, (m) => m.replace("TDD: RED [ ] GREEN [ ] COST [ ]", TICKED));

  it("runs two steps on one test file as one cycle: both REDs, one GREEN, one Cost", async () => {
    const t = setup([writesTest("tests/a.test.ts"), (_p, tree) => { tree.write("tests/a.test.ts", "test a, two"); return "more"; }],
      [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    ok(a.lines.includes("cycle 1/1 — steps 1-2 (tests/a.test.ts)"), a.lines.join("\n"));
    strictEqual(t.roles["test-author"].acts.length, 2);
    strictEqual(t.roles.implementer.acts.length, 1);
    ok(t.roles.implementer.acts[0].prompt.includes("does two"));
    ok(a.lines.some((l) => l.startsWith("steps 1-2 GREEN ✓")) && a.lines.some((l) => l.startsWith("steps 1-2 COST ✓")));
    strictEqual((t.files.files.get(SHEET_PATH) ?? "").split(TICKED).length - 1, 2);
  });

  it("refuses a later RED of a cycle whose tests add no failure to the file's", async () => {
    const t = setup([
      (_p, tree) => { tree.write("tests/a.test.ts", "test a"); tree.failures.set("tests/a.test.ts", 1); return "red"; },
      (_p, tree) => { tree.write("tests/a.test.ts", "test a, two passing at once"); return "more"; },
    ], [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    ok(blockedLine(a)?.includes("step 2 RED: the new tests add no failure (failures 1 → 1)"), a.lines.join("\n"));
    strictEqual(t.roles.implementer.acts.length, 0);
  });

  it("on a rerun after BLOCKED, refuses a RED that adds no failure to the one an earlier step ticked", async () => {
    const rerun = CYCLE_SHEET.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [x] GREEN [ ] COST [ ]");
    const t = setup([(_p, tree) => { tree.write("tests/a.test.ts", "test a, two passing at once"); return "more"; }],
      [writesCode("src/a.ts", "tests/a.test.ts")], rerun);
    t.tree.write("tests/a.test.ts", "test a");
    t.tree.failures.set("tests/a.test.ts", 1);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    ok(blockedLine(a)?.includes("step 2 RED: the new tests add no failure (failures 1 → 1)"), a.lines.join("\n"));
    strictEqual(t.roles.implementer.acts.length, 0);
  });

  it("on a rerun after BLOCKED, takes the failures the ticked step left as the baseline, never the BLOCKED step's own", async () => {
    const rerun = CYCLE_SHEET.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [x] GREEN [ ] COST [ ]");
    // Step 2's tests, written before the run stopped, still fail: the suite counts 2, step 1's tick left 1.
    const t = setup([(_p, tree) => { tree.write("tests/a.test.ts", "test a, two again"); return "more"; }],
      [writesCode("src/a.ts", "tests/a.test.ts")], rerun);
    t.tree.write("tests/a.test.ts", "test a, two");
    t.tree.failures.set("tests/a.test.ts", 2);
    t.files.files.set(`${DIR}/logs/F1-red-failures.json`, JSON.stringify({ 1: 1 }));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    ok(a.lines.includes("step 2 RED ✓ — tests/a.test.ts"), a.lines.join("\n"));
  });

  it("records the failures each ticked RED leaves, for a rerun's baseline", async () => {
    const t = setup([
      (_p, tree) => { tree.write("tests/a.test.ts", "test a"); tree.failures.set("tests/a.test.ts", 1); return "red"; },
      (_p, tree) => { tree.write("tests/a.test.ts", "test a, two"); tree.failures.set("tests/a.test.ts", 2); return "more"; },
    ], [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);
    parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    deepStrictEqual(JSON.parse(t.files.files.get(`${DIR}/logs/F1-red-failures.json`) ?? "{}"), { 1: 1, 2: 2 });
  });

  it("accepts a later RED of a cycle that adds a failure", async () => {
    const t = setup([
      (_p, tree) => { tree.write("tests/a.test.ts", "test a"); tree.failures.set("tests/a.test.ts", 1); return "red"; },
      (_p, tree) => { tree.write("tests/a.test.ts", "test a, two"); tree.failures.set("tests/a.test.ts", 2); return "more"; },
    ], [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    ok(a.lines.includes("step 2 RED ✓ — tests/a.test.ts"), a.lines.join("\n"));
  });

  it("keeps a stub an earlier RED of the cycle wrote open to a later RED: its GREEN has not run", async () => {
    const t = setup([
      (_p, tree) => { tree.write("tests/a.test.ts", "test a"); tree.write("src/a.ts", "throw one"); tree.failures.set("tests/a.test.ts", 1); return "red"; },
      (_p, tree) => { tree.write("tests/a.test.ts", "test a, two"); tree.write("src/a.ts", "throw one, two"); tree.failures.set("tests/a.test.ts", 2); return "more"; },
    ], [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(t.roles["test-author"].acts.map((x) => x.writable), [["src/a.ts"], ["src/a.ts"]]);
    ok(t.roles["test-author"].acts[1].prompt.includes("hold no logic, in `src/a.ts`"), t.roles["test-author"].acts[1].prompt);
    ok(a.lines.includes("step 2 RED ✓ — tests/a.test.ts (stubs: src/a.ts)"), a.lines.join("\n"));
  });

  it("on a rerun, keeps open the stub a RED-ticked step of the cycle wrote", async () => {
    const rerun = CYCLE_SHEET.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [x] GREEN [ ] COST [ ]");
    const t = setup([(_p, tree) => { tree.write("tests/a.test.ts", "test a, two"); tree.write("src/a.ts", "throw one, two"); tree.failures.set("tests/a.test.ts", 2); return "more"; }],
      [writesCode("src/a.ts", "tests/a.test.ts")], rerun);
    t.tree.write("tests/a.test.ts", "test a");
    t.tree.write("src/a.ts", "throw one");
    t.tree.failures.set("tests/a.test.ts", 1);
    t.files.files.set(touchedPath("demo", "F1"), JSON.stringify({ touched: ["src/a.ts", "tests/a.test.ts"], verdictMark: "none" }));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(t.roles["test-author"].acts[0].writable, ["src/a.ts"]);
  });

  it("never leaves a `to create` file that exists already writable as a stub", async () => {
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    t.files.files.set("/workspace/src/a.ts", "export const one = () => 1;");
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(t.roles["test-author"].acts[0].writable, []);
  });

  it("lets the test author write the step's `to create` production files as stubs, and no other", async () => {
    const t = setup([(_p, tree) => { tree.write("tests/a.test.ts", "t"); tree.write("src/a.ts", "throw"); return "done"; }],
      [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(t.roles["test-author"].acts[0].writable, ["src/a.ts"]);
    deepStrictEqual(t.roles.implementer.acts[0].writable, []);
    ok(a.lines.includes("step 1 RED ✓ — tests/a.test.ts (stubs: src/a.ts)"), a.lines.join("\n"));
  });

  it("tells a co-located test file by the pack's layout.test_files", async () => {
    const sheet = ONE_STEP.replaceAll("tests/a.test.ts", "src/a.test.ts");
    const t = setup([writesTest("src/a.test.ts")], [writesCode("src/a.ts", "src/a.test.ts")], sheet);
    t.files.files.set("/workspace/.orkeon/repo.yaml", PACK.replace("  tests: tests\n", "  test_files: [\"src/*.test.ts\"]\n"));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    ok(a.lines.includes("step 1 RED ✓ — src/a.test.ts"), a.lines.join("\n"));
  });

  it("refuses GREEN when no file changed yet the tests turned green (m3)", async () => {
    const t = setup([writesTest("tests/a.test.ts")], [(_p, tree) => { tree.passing.add("tests/a.test.ts"); return "Cost: 0 reads, 0 writes; none"; }], ONE_STEP);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    ok(blockedLine(a)?.includes("a test that turns green by itself is flaky"), a.lines.join("\n"));
  });

  it("writes a role's assumptions under ## Assumptions, to be validated by the user", async () => {
    const t = setup([writesTest("tests/a.test.ts")],
      [(p, tree) => `${writesCode("src/a.ts", "tests/a.test.ts")(p, tree)}\nAssumption: the ids are unique`], ONE_STEP);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    ok((t.files.files.get(SHEET_PATH) ?? "").includes("| H1 | the ids are unique | the user |"));
  });

  it("appends a correction as a new step and runs it; the audit then resumes", async () => {
    const done = SHEET.replaceAll("TDD: RED [ ] GREEN [ ] COST [ ]", TICKED);
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], done);
    t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, "# DEMO-VERIFY-F1 — 2026-10-24 10:00 — fast\n\n## Verdict — GAPS\n\n" +
      "| Severity | Axis | Gap | Evidence | Expected fix |\n|---|---|---|---|---|\n| Major | Test | step 1 misses the empty case | a | b |\n");
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", correction: "Major Test: step 1 misses the empty case" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    ok(a.lines.some((l) => l.startsWith("correction appended to DEMO-PLAN-F1.md as step 4")), a.lines.join("\n"));
    const sheet = t.files.files.get(SHEET_PATH) ?? "";
    ok(sheet.includes("### Step 4 — Correction C1 — Major Test: step 1 misses the empty case"), sheet);
    strictEqual(sheet.split(TICKED).length - 1, 3);
    strictEqual(a.next?.input.mode, "resume");
    ok(t.roles["test-author"].acts[0].prompt.includes("step 1 misses the empty case"));
  });

  it("counts no round of GAPS for an audit the budget stopped", async () => {
    const done = SHEET.replaceAll("TDD: RED [ ] GREEN [ ] COST [ ]", TICKED);
    const gaps = (when: string): string => `# DEMO-VERIFY-F1 — ${when} — fast\n\n## Verdict — GAPS\n\n` +
      "| Severity | Axis | Gap | Evidence | Expected fix |\n|---|---|---|---|---|\n| Major | Test | step 1 misses the empty case | a | b |\n\n";
    const unfinished = "# DEMO-VERIFY-F1 — 2026-10-24 11:00 — resume\n\n## Verdict — GAPS\n\n" +
      "| Severity | Axis | Gap | Evidence | Expected fix |\n|---|---|---|---|---|\n" +
      `| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | tokens: spent | audit again |\n`;
    const warned = async (verdicts: string): Promise<boolean> => {
      const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], done);
      t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, verdicts);
      const a = parse(await runDevImplement({ batch: "F1", plan: "demo", correction: "Major Test: step 1 misses the empty case" }, t.deps));
      strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
      return a.lines.some((l) => l.includes("audit rounds in GAPS"));
    };
    strictEqual(await warned(gaps("2026-10-24 10:00") + unfinished), false);
    strictEqual(await warned(gaps("2026-10-24 10:00") + unfinished + gaps("2026-10-24 12:00")), true);
  });

  it("T3: recalls before each red act, the block after the test author's contract, none in the implementer's; named at the end", async () => {
    const t = setup([writesTest("tests/a.test.ts"), writesTest("tests/b.test.ts")],
      [writesCode("src/a.ts", "tests/a.test.ts"), writesCode("src/b.ts", "tests/b.test.ts")]);
    const precedents = new FakePrecedents();
    precedents.blocks.set("T3", { block: "## Precedents\nT3 block", ids: ["shop-mistake-20261022-x"] });
    t.deps.precedents = precedents.recall;
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(precedents.calls.map((c) => c.trigger), ["T3", "T3"]);
    ok(precedents.calls[0].query.startsWith("DEMO-PLAN-F1"), precedents.calls[0].query);
    for (const act of t.roles["test-author"].acts) ok(act.prompt.trimEnd().endsWith("## Precedents\nT3 block"), act.prompt.slice(-200));
    for (const act of t.roles.implementer.acts) ok(!act.prompt.includes("## Precedents"));
    ok(a.lines.includes("precedents recalled: shop-mistake-20261022-x"), a.lines.join("\n"));
  });

  it("T3: no block and no line when nothing is recalled", async () => {
    const t = setup([writesTest("tests/a.test.ts"), writesTest("tests/b.test.ts")],
      [writesCode("src/a.ts", "tests/a.test.ts"), writesCode("src/b.ts", "tests/b.test.ts")]);
    t.deps.precedents = new FakePrecedents().recall;
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    for (const role of ["test-author", "implementer"] as const) for (const act of t.roles[role].acts) ok(!act.prompt.includes("## Precedents"));
    ok(!a.lines.some((l) => l.startsWith("precedents recalled")), a.lines.join("\n"));
  });

  it("T5: a correction recalls mistakes from its finding, the block in both roles' prompts", async () => {
    const done = SHEET.replaceAll("TDD: RED [ ] GREEN [ ] COST [ ]", TICKED);
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], done);
    const precedents = new FakePrecedents();
    precedents.blocks.set("T5", { block: "## Precedents\nT5 block", ids: ["shop-mistake-20261022-empty"] });
    t.deps.precedents = precedents.recall;
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", correction: "Major Test: step 1 misses the empty case" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(precedents.calls[0], { trigger: "T5", query: "Major Test: step 1 misses the empty case" });
    ok(t.roles["test-author"].acts[0].prompt.includes("## Precedents\nT5 block"));
    ok(t.roles.implementer.acts[0].prompt.includes("## Precedents\nT5 block"));
    ok(a.lines.includes("precedents recalled: shop-mistake-20261022-empty"), a.lines.join("\n"));
  });

  it("refuses a correction naming an id the sheet does not carry", async () => {
    const t = setup([], []);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", correction: "Major Scope: BR-99 is missing" }, t.deps));
    ok(blockedLine(a)?.startsWith("BLOCKED — correction:") && blockedLine(a)?.includes("/dev-change"), a.lines.join("\n"));
    strictEqual(t.files.files.get(SHEET_PATH), SHEET);
  });

  it("runs the affected projects once the whole suite went green for the batch", async () => {
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    t.files.files.set("/workspace/.orkeon/repo.yaml", `${PACK}  test_project: node --test <Project>\n`);
    t.files.files.set(touchedPath("demo", "F1"), JSON.stringify({ touched: [], verdictMark: "none", suiteGreen: true }));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(t.jobs.started, ["npm run build", "node --test tests"]);
    ok((t.files.files.get(`${DIR}/logs/F1-test-affected.txt`) ?? "").endsWith("exit=0\n"));
    strictEqual(JSON.parse(t.files.files.get(touchedPath("demo", "F1")) ?? "{}").suiteGreen, true);
  });

  it("records the whole suite green, and empties the affected log", async () => {
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", githubTool: true, permissionMode: "default", permissionRules: ["deny git_push"] }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    strictEqual(t.files.files.get(`${DIR}/logs/F1-test-affected.txt`), "");
    ok((t.files.files.get(`${DIR}/logs/F1-build.txt`) ?? "").endsWith("exit=0\n"));
    const record = JSON.parse(t.files.files.get(touchedPath("demo", "F1")) ?? "{}");
    strictEqual(record.suiteGreen, true);
    deepStrictEqual(record.pr, { githubTool: true, permissionMode: "default", permissionRules: ["deny git_push"] });
  });

  const costIndex = (inLoop: boolean): CostIndex => ({
    roots: async () => ["/workspace"],
    refresh: async () => [],
    accessCost: async () => ({
      report: {
        members: [{
          member: "/workspace/src/a.ts::A::run", memoryFilters: [],
          cost: { reads: 1, writes: 0, loops: inLoop ? 1 : 0, lambdas: 0, memoryFilters: 0 },
          portCalls: [{ receiver: "repo", method: "get", line: 1, inLoop, inLambda: false }],
        }],
        cost: { reads: 1, writes: 0, loops: inLoop ? 1 : 0, lambdas: 0, memoryFilters: 0 },
      },
      errors: [],
    }),
  });

  it("measures the cycle's cost: flagged sends it back to /dev-plan, clean is said beside the stated line", async () => {
    const flagged = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    flagged.deps.costIndex = costIndex(true);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, flagged.deps));
    ok(blockedLine(a)?.includes("COST: measured Cost: 1 read") && blockedLine(a)?.includes("back to /dev-plan"), a.lines.join("\n"));
    ok(flagged.shell.commands.includes("git diff -U0 HEAD -- 'src/a.ts'"));
    ok((flagged.files.files.get(SHEET_PATH) ?? "").includes("TDD: RED [x] GREEN [x] COST [ ]"));

    const clean = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    clean.deps.costIndex = costIndex(false);
    const b = parse(await runDevImplement({ batch: "F1", plan: "demo" }, clean.deps));
    strictEqual(blockedLine(b), undefined, b.lines.join("\n"));
    ok(b.lines.some((l) => l.startsWith("step 1 COST ✓ — Cost: 1 reads, 0 writes; none; measured: Cost: 1 read")), b.lines.join("\n"));

    const none = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    const c = parse(await runDevImplement({ batch: "F1", plan: "demo" }, none.deps));
    ok(c.lines.some((l) => l.includes("; measured: not computed — ")), c.lines.join("\n"));
  });

  const graphIndex = (
    roots: string[], affected: Partial<AffectedTests> | Error, refreshed: string[][] = [], asked: string[][] = [],
  ): CostIndex => ({
    ...costIndex(false),
    roots: async () => roots,
    refresh: async (_root, files) => { refreshed.push([...files]); return []; },
    affected: async (files) => {
      asked.push([...files]);
      if (affected instanceof Error) throw affected;
      return { all: false, projects: [], classes: [], unresolved: [], ...affected };
    },
  });
  const later = (index: CostIndex) => {
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    t.files.files.set("/workspace/.orkeon/repo.yaml", `${PACK}  test_project: node --test <Project>\n`);
    t.files.files.set(touchedPath("demo", "F1"), JSON.stringify({ touched: [], verdictMark: "none", suiteGreen: true }));
    t.deps.costIndex = index;
    return t;
  };

  it("refreshes the batch's files in the index, then adds the graph's test projects to the sheet's", async () => {
    const refreshed: string[][] = [];
    const asked: string[][] = [];
    const t = later(graphIndex(["/workspace/"], { projects: ["tests/integration", "tests", "a;b"], classes: ["A"] }, refreshed, asked));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    deepStrictEqual(refreshed.at(-1), ["/workspace/src/a.ts", "/workspace/tests/a.test.ts"]);
    // affected_tests looks each file up under the indexed root: relative paths, never absolute ones.
    deepStrictEqual(asked, [["src/a.ts", "tests/a.test.ts"]]);
    ok(a.lines.includes("affected tests: the graph's projects left out, no command can be named for them — " +
      "a;b (<Project>: the value 'a;b' is not one plain relative name)"), a.lines.join("\n"));
    ok(a.lines.includes("index: 2 files of F1 refreshed"), a.lines.join("\n"));
    deepStrictEqual(t.jobs.started, ["npm run build", "node --test tests", "node --test tests/integration"]);
    ok(a.lines.some((l) => l.startsWith("affected tests ✓ — node --test tests; node --test tests/integration (the whole suite went green once for F1; the graph added tests/integration (1 test class reached))")), a.lines.join("\n"));
  });

  it("runs the whole suite again when the graph reaches every test", async () => {
    const t = later(graphIndex(["/workspace"], { all: true }));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    deepStrictEqual(t.jobs.started, ["npm run build", "npm test"]);
    ok(a.lines.some((l) => l.startsWith("test ✓ — npm test (the whole suite again: the graph reaches every test from these changes)")), a.lines.join("\n"));
  });

  it("refreshes the index before the build, so a red build leaves no stale graph", async () => {
    const refreshed: string[][] = [];
    const t = later(graphIndex(["/workspace"], {}, refreshed));
    t.jobs.exit["npm run build"] = 1;
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    ok(blockedLine(a) !== undefined, a.lines.join("\n"));
    deepStrictEqual(refreshed.at(-1), ["/workspace/src/a.ts", "/workspace/tests/a.test.ts"]);
    ok(a.lines.includes("index: 2 files of F1 refreshed"), a.lines.join("\n"));
  });

  it("names the files the graph could not place when it falls back to the whole suite", async () => {
    const t = later(graphIndex(["/workspace"], { all: true, unresolved: ["src/a.ts"] }));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    deepStrictEqual(t.jobs.started, ["npm run build", "npm test"]);
    ok(a.lines.some((l) => l.startsWith("test ✓ — npm test (the whole suite again: the graph could not place src/a.ts)")), a.lines.join("\n"));
  });

  it("keeps the sheet's projects alone when the index is absent or the graph fails, and says so", async () => {
    const absent = later(graphIndex([], { projects: ["tests/integration"] }));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, absent.deps));
    ok(a.lines.includes("index: not refreshed — /workspace is not indexed"), a.lines.join("\n"));
    deepStrictEqual(absent.jobs.started, ["npm run build", "node --test tests"]);
    const failing = later(graphIndex(["/workspace"], new Error("graph down\nmore")));
    const b = parse(await runDevImplement({ batch: "F1", plan: "demo" }, failing.deps));
    ok(b.lines.includes("affected tests: the graph was not read — graph down; the sheet's projects alone"), b.lines.join("\n"));
    deepStrictEqual(failing.jobs.started, ["npm run build", "node --test tests"]);
  });

  it("restores once, before any act, and logs it (run_build's `restored` is wrapped-tools.test.ts's)", async () => {
    const t = setup([(_p, tree) => { tree.write("tests/a.test.ts", "t"); return "done"; }], [], ONE_STEP);
    await runDevImplement({ batch: "F1", plan: "demo" }, t.deps);
    ok((t.files.files.get(`${DIR}/logs/F1-restore.txt`) ?? "").startsWith("# $ npm ci\n"));
    strictEqual(t.shell.commands.filter((c) => c === "npm ci").length, 1);
  });
});

describe("runDevImplement — the close marks and the branch", () => {
  const VALID = "# DEMO-VERIFY-F1 — 2026-10-24 10:00 — fast\n\n## Verdict — VALID\n\nNone.\n";
  const DONE_SHEET = SHEET.replaceAll("TDD: RED [ ] GREEN [ ] COST [ ]", TICKED);
  const GLOBAL = "# DEMO-PLAN — Demo\n\n### Batch F1 — Demo — open\n- [ ] 1. One\n- [ ] 2. Two\n\n### Batch F2 — Next — open\n- [ ] 1. Later\n";

  function closing(branch: string, pack = PACK) {
    const t = setup([], [], DONE_SHEET);
    t.files.files.set("/workspace/.orkeon/repo.yaml", pack);
    t.files.files.set(`${DIR}/DEMO-VERIFY-F1.md`, VALID);
    t.files.files.set(`${DIR}/DEMO-PLAN.md`, GLOBAL);
    t.files.files.set(touchedPath("demo", "F1"), JSON.stringify({
      touched: ["src/a.ts"], verdictMark: "none", pr: { githubTool: true, permissionMode: "default", permissionRules: [] },
    }));
    t.shell.results["git -c core.quotePath=false status --short --untracked-files=all"] = { stdout: " M src/a.ts\n" };
    t.shell.results["git branch --show-current"] = { stdout: `${branch}\n` };
    t.shell.results["git symbolic-ref --short refs/remotes/origin/HEAD"] = { stdout: "origin/main\n" };
    t.shell.results["git rev-parse --verify --quiet 'refs/heads/feature/demo-f1'"] = { exitCode: 1 };
    t.shell.results[GIT_IDENT_COMMAND] = { stdout: "Ada <ada@example.com> 1 +0000" };
    t.shell.results["git var GIT_COMMITTER_IDENT"] = { stdout: "Ada <ada@example.com> 1 +0000" };
    t.shell.results["git rev-parse --short HEAD"] = { stdout: "abc1234\n" };
    const contexts: unknown[] = [];
    t.deps.openerFor = (context) => { contexts.push(context); return undefined; };
    return { ...t, contexts };
  }

  it("marks the sheet and the plan's batch done once committed, the context read back from the record", async () => {
    const t = closing("feat/demo");
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", close: true, push: false }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    ok((t.files.files.get(SHEET_PATH) ?? "").startsWith("# DEMO-PLAN-F1 — Demo — done (2026-10-24)\n"));
    const plan = t.files.files.get(`${DIR}/DEMO-PLAN.md`) ?? "";
    ok(plan.includes("### Batch F1 — Demo — done (2026-10-24)\n- [x] 1. One\n- [x] 2. Two"), plan);
    ok(plan.includes("### Batch F2 — Next — open\n- [ ] 1. Later"));
    deepStrictEqual(t.contexts, [{ githubTool: true, permissionMode: "default", permissionRules: [] }]);
  });

  it("commits a batch /dev-batches closes without pushing it, the crew's inputs keeping its push: false (L-7)", async () => {
    // The input /dev-batches launches for a VALID batch (commands-dev-batches.test.ts, "closes a VALID batch
    // without pushing it"), read as the crew reads its inputs.
    const launched = { batch: "F1", plan: "demo", close: true, push: false };
    const pushes = (t: ReturnType<typeof closing>) => t.shell.commands.filter((c) => c.startsWith("git push"));
    const batches = closing("feat/demo");
    const a = parse(await runDevImplement(implementInputs(launched), batches.deps));
    ok(a.lines.some((l) => l.startsWith("✓ committed ")), a.lines.join("\n"));
    deepStrictEqual(pushes(batches), []);
    ok(!a.lines.some((l) => l.includes("pushed") || l.includes("gh pr create")), a.lines.join("\n"));
    const typed = closing("feat/demo");
    typed.files.files.set(SHEET_PATH, `${typed.files.files.get(SHEET_PATH)!}\n## Assumptions\n| H1 | ids are stable | the user |\n`);
    await runDevImplement(implementInputs({ batch: "F1", plan: "demo", close: true }), typed.deps);
    deepStrictEqual(pushes(typed), ["git push -u origin 'feat/demo'"], "a typed --close still pushes");
    const body = typed.files.writes.find((w) => w.path.endsWith("/PR.md"))?.content ?? "";
    ok(body.includes("| H1 | ids are stable | the user |"), "the sheet's assumptions reach the pull request's body");
    strictEqual(implementInputs({ push: "false" }).push, false);
  });

  it("commits a typed close without pushing while a /dev-batches run of its plan is in progress", async () => {
    const pushes = (t: ReturnType<typeof closing>) => t.shell.commands.filter((c) => c.startsWith("git push"));
    const inRun = closing("feat/demo");
    inRun.files.files.set(BATCHES_ACTIVE_RECORD, JSON.stringify({ code: "demo", pr: false, context: {} }));
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", close: true }, inRun.deps));
    ok(a.lines.includes("not pushed: /dev-batches demo is in progress, its close pushes the plan's branch once"), a.lines.join("\n"));
    ok(a.lines.some((l) => l.startsWith("✓ committed ")), a.lines.join("\n"));
    deepStrictEqual(pushes(inRun), []);
    const other = closing("feat/demo");
    other.files.files.set(BATCHES_ACTIVE_RECORD, JSON.stringify({ code: "another", pr: false, context: {} }));
    await runDevImplement({ batch: "F1", plan: "demo", close: true }, other.deps);
    deepStrictEqual(pushes(other), ["git push -u origin 'feat/demo'"], "another plan's run changes nothing");
  });

  it("creates the work branch on the default branch when the pack asks for one", async () => {
    const t = closing("main", `${PACK}contrib:\n  branch: feature|fix/<slug>\n`);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", close: true, push: false }, t.deps));
    strictEqual(blockedLine(a), undefined, a.lines.join("\n"));
    ok(t.shell.commands.includes("git switch -c 'feature/demo-f1'"), t.shell.commands.join("\n"));
    ok(a.lines.some((l) => l.startsWith("✓ branch feature/demo-f1 created from main")));
  });

  it("stops when that branch exists already", async () => {
    const t = closing("main", `${PACK}contrib:\n  branch: feature|fix/<slug>\n`);
    t.shell.results["git rev-parse --verify --quiet 'refs/heads/feature/demo-f1'"] = { exitCode: 0, stdout: "abc\n" };
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo", close: true, push: false }, t.deps));
    ok(blockedLine(a)?.includes("the branch feature/demo-f1 exists already"), a.lines.join("\n"));
    strictEqual(t.shell.commands.some((c) => c.includes(" commit ")), false);
  });
});

describe("runDevImplement — the files a role gets", () => {
  const EXISTING_SHEET = SHEET.replace("| 1 — One | `tests/a.test.ts` — to create | — | `src/a.ts` — to create |",
    "| 1 — One | `tests/a.test.ts` — to create | — | `src/a.ts` — existing |");
  const stubsTheModule: Act = (_p, tree) => {
    tree.write("tests/a.test.ts", "test a");
    tree.write("src/a.ts", "throw one");
    return "red";
  };

  it("opens an existing production file of the step to the test author, for a missing declaration's stub", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts"), writesTest("tests/b.test.ts")],
      [writesCode("src/a.ts", "tests/a.test.ts"), writesCode("src/b.ts", "tests/b.test.ts")], EXISTING_SHEET);

    // Act
    await runDevImplement({ batch: "F1", plan: "demo" }, t.deps);

    // Assert
    deepStrictEqual(t.roles["test-author"].acts[0].writable, ["src/a.ts"]);
  });

  it("carries to the implementer the stub RED wrote, shown as existing", async () => {
    // Arrange
    const t = setup([stubsTheModule, writesTest("tests/b.test.ts")],
      [writesCode("src/a.ts", "tests/a.test.ts"), writesCode("src/b.ts", "tests/b.test.ts")]);

    // Act
    await runDevImplement({ batch: "F1", plan: "demo" }, t.deps);

    // Assert
    const green = t.roles.implementer.acts[0].prompt;
    ok(green.includes("### src/a.ts\n```text\nthrow one\n```"), green);
    ok(green.includes("- `src/a.ts` — existing (stubbed at RED), in this brief"), green);
  });
});

