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
import type { ActRequest, ShellJobs, ShellOptions, ShellResult } from "../../../shared/application/ports.ts";
import { GIT_IDENT_COMMAND } from "../../../shared/domain/git/close.ts";
import { STATUS_COMMAND } from "./observe.ts";
import { touchedPath, verdictMarkOf } from "./touched.ts";
import { runDevImplement } from "./run-dev-implement.ts";
import type { ImplementAnswer } from "./run-dev-implement.ts";

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
    if (test) return { ...base, exitCode: this.tree.passing.has(test[1]) ? 0 : 1, stdout: this.tree.passing.has(test[1]) ? "ok" : "not ok 1" };
    return base;
  }
}

type Act = (prompt: string, tree: Tree) => string;

class Role {
  acts: Array<{ prompt: string; request: ActRequest }> = [];
  wrote: (path: string) => void = () => {};
  readonly tree: Tree;
  readonly script: Act[];
  constructor(tree: Tree, script: Act[]) { this.tree = tree; this.script = script; }
  async act(prompt: string, request: ActRequest): Promise<string> {
    this.acts.push({ prompt, request });
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
    roleLlm: (role: "test-author" | "implementer", _layout: unknown, wrote: (path: string) => void) => {
      roles[role].wrote = wrote;
      return roles[role];
    },
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
    deepStrictEqual(a.next, { crew: "dev-verify", input: { batch: "F1", plan: "demo" } });
    strictEqual((t.files.files.get(SHEET_PATH) ?? "").split(TICKED).length - 1, 2);
    deepStrictEqual(t.jobs.started, ["npm run build", "npm test"]);
    strictEqual(t.shell.commands.filter((c) => c === "npm ci").length, 1); // restored once, for both steps
    deepStrictEqual(JSON.parse(t.files.files.get(touchedPath("demo", "F1")) ?? "{}").touched,
      ["src/a.ts", "src/b.ts", "tests/a.test.ts", "tests/b.test.ts"]);
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
    });
  });

  it("blocks a production write at RED and ticks nothing", async () => {
    const t = setup([(_p, tree) => { tree.write("tests/a.test.ts", "t"); tree.write("src/a.ts", "stub"); return "done"; }], []);
    const a = parse(await runDevImplement({ batch: "F1", plan: "demo" }, t.deps));
    strictEqual(blockedLine(a), "BLOCKED — step 1 RED: a production path changed before a red test: src/a.ts" +
      " (log: workbench/demo/logs/run_tests-1.log)");
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
    ok(blockedLine(a)?.startsWith("BLOCKED — test: 'npm test' exited 1 (log: workbench/demo/logs/test-F1.log)"));
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
      SHEET.replace("TDD: RED [ ] GREEN [ ] COST [ ]\n\n### Step 2", "TDD: RED [ ] GREEN [ ] COST [ ]\n\n### Step 2").replace(/### Step 2[\s\S]*?TDD: RED \[ \] GREEN \[ \] COST \[ \]/, (m) => m.replace("TDD: RED [ ] GREEN [ ] COST [ ]", TICKED)));
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
