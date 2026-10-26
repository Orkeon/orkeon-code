// The world runDevImplement is tested in: FakeFiles, a scripted shell (git status from a fake tree, each test file red
// or green), two scripted roles that write into that tree, fake shell jobs, and the sheets, verdicts and records a
// batch goes through.
import { FakeClock } from "../../../support/doubles/fake-clock.ts";
import { FakeCostIndex, FakeGraphIndex } from "../../../support/doubles/fake-cost-index.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { FakeShellJobs } from "../../../support/doubles/fake-shell-jobs.ts";
import type { FakePrecedents } from "../../../support/doubles/fake-precedents.ts";
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { GIT_TOPLEVEL } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import type { ActRequest, AffectedTests, Clock, CostIndex, ShellResult } from "../../../../src/shared/application/ports.ts";
import type { AccessCostReport } from "../../../../src/shared/domain/dev/access-cost.ts";
import { GIT_IDENT_COMMAND } from "../../../../src/shared/domain/git/close.ts";
import { AUDIT_UNFINISHED_GAP } from "../../../../src/shared/domain/dev/verdict-format.ts";
import { STATUS_COMMAND } from "../../../../src/crews/dev-implement/application/observe.ts";
import { touchedPath } from "../../../../src/crews/dev-implement/application/touched.ts";
import type { ImplementAnswer } from "../../../../src/crews/dev-implement/application/run-dev-implement.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const DIR = `${WORKSPACE}/workbench/demo`;
export const SHEET_PATH = `${DIR}/DEMO-PLAN-F1.md`;
export const VERDICT_PATH = `${DIR}/DEMO-VERIFY-F1.md`;
export const PACK = "layout:\n  domain: src\n  tests: tests\ncommands:\n  restore: npm ci\n  build: npm run build\n" +
  "  test_class: node --test <Class>\n  test: npm test\n";
/** The pack, with a test_project command. */
export const PACK_WITH_PROJECT = `${PACK}  test_project: node --test <Project>\n`;
/** The pack, asking for a work branch on the default branch. */
export const PACK_WITH_BRANCH = `${PACK}contrib:\n  branch: feature|fix/<slug>\n`;
/** The pack, its test files beside the code. */
export const PACK_CO_LOCATED = PACK.replace("  tests: tests\n", "  test_files: [\"src/*.test.ts\"]\n");
/** A pack without layout.tests. */
export const PACK_WITHOUT_TESTS = "commands:\n  test: npm test\n";

/** The input of a run of the batch F1 of the plan demo. */
export const F1 = { batch: "F1", plan: "demo" };

const STEP_TABLE = (name: string, id: string) =>
  ["| # | Test | Level | Project | Ids |", "|---|------|-------|---------|-----|", `| 1 | \`${name}\` | unit | \`tests\` | ${id} |`, ""];
const OPEN = "TDD: RED [ ] GREEN [ ] COST [ ]";
export const TICKED = "TDD: RED [x] GREEN [x] COST [x]";

/** Step 1 (`tests/a.test.ts`, `src/a.ts`) and step 2 (`tests/b.test.ts`, `src/b.ts`) open, then the build step. */
export const SHEET = [
  "# DEMO-PLAN-F1 — Demo", "",
  "## Design", "| Point | Decision |", "|-------|----------|", "| Applied rules | DDD-01 |", "| Access cost | 1 read |", "",
  "## TDD sequence",
  "### Step 1 — One", ...STEP_TABLE("does one", "BR-01"), OPEN, "",
  "### Step 2 — Two", ...STEP_TABLE("does two", "BR-02"), OPEN, "",
  "### Step 3 — Build and tests", "No test of its own.", "",
  "## Code elements", "- `one()` — does one", "",
  "## Anchors",
  "| Step | Test class / fixture | Shared doubles and builders | Production filled or created |",
  "|------|----------------------|-----------------------------|------------------------------|",
  "| 1 — One | `tests/a.test.ts` — to create | — | `src/a.ts` — to create |",
  "| 2 — Two | `tests/b.test.ts` — to create | — | `src/b.ts` — to create |",
  "| 3 — Build and tests | — | — | — |", "",
].join("\n");

/** The sheet, step 1 done. */
export const STEP_1_DONE = SHEET.replace(OPEN, TICKED);
/** The sheet, every step done. */
export const DONE_SHEET = SHEET.replaceAll(OPEN, TICKED);
/** The sheet whose step 2 works on step 1's files: one cycle of two steps. */
export const CYCLE_SHEET = SHEET.replace("| 2 — Two | `tests/b.test.ts` — to create | — | `src/b.ts` — to create |",
  "| 2 — Two | `tests/a.test.ts` — existing | — | `src/a.ts` — existing |");
/** The cycle sheet on a rerun after BLOCKED: step 1's RED ticked. */
export const CYCLE_RERUN = CYCLE_SHEET.replace(OPEN, "TDD: RED [x] GREEN [ ] COST [ ]");
/** The sheet with step 2 done: step 1 alone left. */
export const ONE_STEP = SHEET.replace(/### Step 2[\s\S]*?TDD: RED \[ \] GREEN \[ \] COST \[ \]/, (m) => m.replace(OPEN, TICKED));
/** The one-step sheet, its files beside the code. */
export const ONE_STEP_CO_LOCATED = ONE_STEP.replaceAll("tests/a.test.ts", "src/a.test.ts");
/** The sheet whose step 1 fills the existing `src/a.ts`. */
export const EXISTING_SHEET = SHEET.replace("| 1 — One | `tests/a.test.ts` — to create | — | `src/a.ts` — to create |",
  "| 1 — One | `tests/a.test.ts` — to create | — | `src/a.ts` — existing |");

/** The tree the roles write into: dirty paths and their content, and which test files pass. */
export class Tree {
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
    this.files.files.set(`${WORKSPACE}/${path}`, content);
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

/** What the tree answers: git status lists its dirty paths, a test run passes or fails as the tree says. */
export function treeAnswers(tree: Tree): (command: string) => Partial<ShellResult> | undefined {
  return (command) => {
    if (command === STATUS_COMMAND) return { stdout: [...tree.dirty.keys()].map((p) => `?? ${p}`).join("\n") };
    const test = /^node --test (\S+)$/.exec(command);
    if (test) return { exitCode: tree.passing.has(test[1]) ? 0 : 1, stdout: tree.passing.has(test[1]) ? "ok" : tree.failures.has(test[1]) ? `not ok 1\n# fail ${tree.failures.get(test[1])}` : "not ok 1" };
    return undefined;
  };
}

export type Act = (prompt: string, tree: Tree) => string;

/** A role scripted act by act (its last act repeated), each act recorded with what it could write. */
export class Role {
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

/** A test author's act that writes the test file `file`. */
export const writesTest = (file: string): Act => (_p, tree) => { tree.write(file, `test ${file}`); return `wrote ${file}`; };
/** An implementer's act that writes `file`, turns `test` green and answers `cost`. */
export const writesCode = (file: string, test: string, cost = "Cost: 1 reads, 0 writes; none"): Act => (_p, tree) => {
  tree.write(file, `code ${file}`);
  tree.passing.add(test);
  return `changed ${file}\n${cost}`;
};
/** A test author's act that writes `tests/a.test.ts` as `content`, whose run then fails `failures` tests. */
export const writesFailingA = (content: string, failures: number, answer: string): Act => (_p, tree) => {
  tree.write("tests/a.test.ts", content); tree.failures.set("tests/a.test.ts", failures); return answer;
};
/** A test author's act that writes `tests/a.test.ts` and the stub `src/a.ts`, whose run then fails `failures` tests. */
export const writesFailingAWithStub = (test: string, stub: string, failures: number, answer: string): Act => (_p, tree) => {
  tree.write("tests/a.test.ts", test); tree.write("src/a.ts", stub); tree.failures.set("tests/a.test.ts", failures); return answer;
};
/** A test author's act that rewrites `tests/a.test.ts` as `content`, its failures left as they were. */
export const rewritesA = (content: string): Act => (_p, tree) => { tree.write("tests/a.test.ts", content); return "more"; };

/** Both steps written by the book: a test file each, then its code. */
export const AUTHOR_BOTH: Act[] = [writesTest("tests/a.test.ts"), writesTest("tests/b.test.ts")];
export const IMPLEMENTER_BOTH: Act[] = [writesCode("src/a.ts", "tests/a.test.ts"), writesCode("src/b.ts", "tests/b.test.ts")];

/** An implementer's act that leaves trailing whitespace and blank lines at the end of `src/a.ts`. */
export const untidy: Act = (_p, tree) => {
  tree.write("src/a.ts", "export const a = 1; \n\n\n"); tree.passing.add("tests/a.test.ts"); return "changed src/a.ts\nCost: 1 reads, 0 writes; none";
};
/** A test author's act that writes a production file outside the step's stubs. */
export const writesOtherProduction: Act = (_p, tree) => { tree.write("tests/a.test.ts", "t"); tree.write("src/other.ts", "stub"); return "done"; };
/** A test author's act whose tests pass at once. */
export const writesPassingTest: Act = (_p, tree) => { tree.write("tests/a.test.ts", "t"); tree.passing.add("tests/a.test.ts"); return "done"; };
/** An implementer's act that weakens the test file. */
export const weakensTest: Act = (_p, tree) => {
  tree.write("tests/a.test.ts", "weakened"); tree.write("src/a.ts", "c"); tree.passing.add("tests/a.test.ts"); return "Cost: 0 reads, 0 writes; none";
};
/** A test author's act that ticks step 1's RED box itself. */
export const ticksItsBox: Act = (_p, tree) => {
  tree.write("tests/a.test.ts", "t");
  tree.write("workbench/demo/DEMO-PLAN-F1.md", SHEET.replace("TDD: RED [ ]", "TDD: RED [x]"));
  return "done";
};
/** A test author's act whose test run leaves a build output behind. */
export const authorLeavesOutput: Act = (_p, tree) => { tree.write("tests/a.test.ts", "t"); tree.output("src/obj/cache.bin", "x"); return "done"; };
/** An implementer's act whose test run leaves a build output behind. */
export const implementerLeavesOutput: Act = (_p, tree) => {
  tree.write("src/a.ts", "c"); tree.output("src/obj/cache2.bin", "y"); tree.passing.add("tests/a.test.ts"); return "Cost: 1 reads, 0 writes; none";
};
/** An implementer's act that changes nothing, yet the tests turn green. */
export const greenByItself: Act = (_p, tree) => { tree.passing.add("tests/a.test.ts"); return "Cost: 0 reads, 0 writes; none"; };
/** An implementer's act that answers an assumption besides its code. */
export const assumesUniqueIds: Act = (p, tree) => `${writesCode("src/a.ts", "tests/a.test.ts")(p, tree)}\nAssumption: the ids are unique`;
/** A test author's act that writes the test file and stubs `src/a.ts`. */
export const stubsA: Act = (_p, tree) => { tree.write("tests/a.test.ts", "t"); tree.write("src/a.ts", "throw"); return "done"; };
/** A test author's act that writes the test file and stubs the module it tests. */
export const stubsTheModule: Act = (_p, tree) => {
  tree.write("tests/a.test.ts", "test a");
  tree.write("src/a.ts", "throw one");
  return "red";
};
/** A test author's act that writes the test file alone. */
export const writesTestOnly: Act = (_p, tree) => { tree.write("tests/a.test.ts", "t"); return "done"; };

export type Deps = {
  files: FakeFiles; shell: FakeShell; jobs: FakeShellJobs; log: FakeLogger; config: ReturnType<typeof createConfigStore>;
  roleLlm: (role: "test-author" | "implementer", layout: unknown, wrote: (path: string) => void, writable: readonly string[]) => Role;
  clock: Clock; costIndex?: CostIndex; openerFor?: (context: unknown) => undefined;
  precedents?: FakePrecedents["recall"];
};

/** The world of a run: the pack and `sheet` on disk, the two roles scripted with `author` and `implementer`. */
export function setup(author: Act[], implementer: Act[], sheet = SHEET) {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, PACK);
  files.files.set(SHEET_PATH, sheet);
  files.listings.set(WORKSPACE, ["workbench", "src", "tests"]);
  files.listings.set(`${WORKSPACE}/workbench`, ["demo"]);
  files.listings.set(DIR, ["DEMO-PLAN-F1.md", "DEMO-PLAN.md"]);
  const tree = new Tree(files);
  const shell = new FakeShell();
  shell.answer = treeAnswers(tree);
  shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };
  const roles = { "test-author": new Role(tree, author), implementer: new Role(tree, implementer) };
  const jobs = new FakeShellJobs();
  const deps = {
    files, shell, jobs, log: new FakeLogger(), config: createConfigStore({ files, session: new FakeSessionStore() }),
    roleLlm: (role: "test-author" | "implementer", _layout: unknown, wrote: (path: string) => void, writable: readonly string[]) => {
      roles[role].wrote = wrote;
      roles[role].writable = writable;
      return roles[role];
    },
    clock: new FakeClock().now,
  } as Deps;
  return { files, shell, tree, roles, jobs, deps };
}

export type World = ReturnType<typeof setup>;

export const parse = (text: string): ImplementAnswer => JSON.parse(text) as ImplementAnswer;
export const blockedLine = (a: ImplementAnswer): string | undefined => a.lines.find((l) => l.startsWith("BLOCKED"));

/** The record of the files the batch touched, as the world holds it. */
export function touchedRecord(t: World): { touched?: string[]; suiteGreen?: boolean; pr?: unknown } {
  return JSON.parse(t.files.files.get(touchedPath("demo", "F1")) ?? "{}");
}

// ---- the close

export const VALID = "# DEMO-VERIFY-F1 — 2026-10-24 10:00 — fast\n\n## Verdict — VALID\n\nNone.\n";
/** A record of `src/a.ts` and `tests/a.test.ts`, the verdict seen last marked `mark`. */
export const recorded = (mark = "none") => JSON.stringify({ touched: ["src/a.ts", "tests/a.test.ts"], verdictMark: mark });

/** A world at the close: a VALID verdict, the files recorded, a done sheet unless `sheet` says otherwise. */
export function atTheClose(sheet = DONE_SHEET, record: string | null = recorded()): World {
  const t = setup([], [], sheet);
  t.files.files.set(VERDICT_PATH, VALID);
  if (record !== null) t.files.files.set(touchedPath("demo", "F1"), record);
  return t;
}

/** Git answers of a close that commits as Ada on `feat/demo`. */
export function commitsAsAda(t: World): void {
  t.shell.results["git -c core.quotePath=false status --short --untracked-files=all"] = { stdout: " M src/a.ts\n?? tests/a.test.ts\n M other.ts\n" };
  t.shell.results["git branch --show-current"] = { stdout: "feat/demo\n" };
  t.shell.results[GIT_IDENT_COMMAND] = { stdout: "Ada <ada@example.com> 1 +0000" };
  t.shell.results["git var GIT_COMMITTER_IDENT"] = { stdout: "Ada <ada@example.com> 1 +0000" };
  t.shell.results["git rev-parse --short HEAD"] = { stdout: "abc1234\n" };
}

/** Git answers of a close where git has no identity. */
export function noGitIdentity(t: World): void {
  t.shell.results["git branch --show-current"] = { stdout: "feat/demo\n" };
  t.shell.results[GIT_IDENT_COMMAND] = { exitCode: 128, stderr: "fatal: unable to auto-detect email address" };
}

/** The commands of a close that adds and commits exactly the recorded files. */
export const ADD_AND_COMMIT = [
  "git --literal-pathspecs add -- 'src/a.ts' 'tests/a.test.ts'",
  "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'src/a.ts' 'tests/a.test.ts'",
];

export const GLOBAL = "# DEMO-PLAN — Demo\n\n### Batch F1 — Demo — open\n- [ ] 1. One\n- [ ] 2. Two\n\n### Batch F2 — Next — open\n- [ ] 1. Later\n";

/** A world at the close on `branch`, with the global plan, the pull request's context recorded, and the contexts the
 *  opener is asked for recorded. */
export function closing(branch: string, pack = PACK) {
  const t = setup([], [], DONE_SHEET);
  t.files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, pack);
  t.files.files.set(VERDICT_PATH, VALID);
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

/** The pushes a world's shell ran. */
export const pushes = (t: World) => t.shell.commands.filter((c) => c.startsWith("git push"));

// ---- corrections

export const FINDING = "Major Test: step 1 misses the empty case";
const GAPS_TABLE = "| Severity | Axis | Gap | Evidence | Expected fix |\n|---|---|---|---|---|\n";
/** A GAPS verdict of `when`, its one gap step 1's empty case. */
export const gaps = (when: string): string => `# DEMO-VERIFY-F1 — ${when} — fast\n\n## Verdict — GAPS\n\n` +
  `${GAPS_TABLE}| Major | Test | step 1 misses the empty case | a | b |\n\n`;
/** The one GAPS verdict a correction answers. */
export const ONE_GAPS = "# DEMO-VERIFY-F1 — 2026-10-24 10:00 — fast\n\n## Verdict — GAPS\n\n" +
  `${GAPS_TABLE}| Major | Test | step 1 misses the empty case | a | b |\n`;
/** A GAPS verdict the budget stopped before the audit finished. */
export const UNFINISHED = "# DEMO-VERIFY-F1 — 2026-10-24 11:00 — resume\n\n## Verdict — GAPS\n\n" + GAPS_TABLE +
  `| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | tokens: spent | audit again |\n`;

// ---- the cost and the graph

/** The report of one read of `src/a.ts`, in a loop when `inLoop`. */
const oneRead = (inLoop: boolean): AccessCostReport => ({
  members: [{
    member: `${WORKSPACE}/src/a.ts::A::run`, memoryFilters: [],
    cost: { reads: 1, writes: 0, loops: inLoop ? 1 : 0, lambdas: 0, memoryFilters: 0 },
    portCalls: [{ receiver: "repo", method: "get", line: 1, inLoop, inLambda: false }],
  }],
  cost: { reads: 1, writes: 0, loops: inLoop ? 1 : 0, lambdas: 0, memoryFilters: 0 },
});

/** A cost index measuring one read of `src/a.ts`, in a loop when `inLoop`. */
export const costIndex = (inLoop: boolean): FakeCostIndex => {
  const index = new FakeCostIndex();
  index.report = oneRead(inLoop);
  return index;
};

/** A cost index over `roots` whose graph answers `tests` (or fails with it), measuring one read outside loops. */
export const graphIndex = (roots: string[], tests: Partial<AffectedTests> | Error): FakeGraphIndex => {
  const index = new FakeGraphIndex();
  index.indexed = roots;
  index.report = oneRead(false);
  index.tests = tests;
  return index;
};

/** A one-step run after the whole suite went green once for the batch, the pack naming test_project, over `index`. */
export const later = (index: CostIndex) => {
  const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
  t.files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, PACK_WITH_PROJECT);
  t.files.files.set(touchedPath("demo", "F1"), JSON.stringify({ touched: [], verdictMark: "none", suiteGreen: true }));
  t.deps.costIndex = index;
  return t;
};

/** The files of F1 the index is refreshed with. */
export const F1_FILES = [`${WORKSPACE}/src/a.ts`, `${WORKSPACE}/tests/a.test.ts`];

/** The line naming the graph's project no command can be named for. */
export const PROJECT_LEFT_OUT = "affected tests: the graph's projects left out, no command can be named for them — " +
  "a;b (<Project>: the value 'a;b' is not one plain relative name)";
/** The start of the line of the affected tests the graph added to. */
export const AFFECTED_RUN = "affected tests ✓ — node --test tests; node --test tests/integration (the whole suite went green once for F1; " +
  "the graph added tests/integration (1 test class reached))";
