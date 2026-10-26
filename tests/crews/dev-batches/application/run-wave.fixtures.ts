// The checkout, shell, log and requests of the runWave and runBatchChain tests: the git command lines the driver
// runs, the work folder over FakeFiles, a log in memory, the batch outcomes and the chain's answers.
import type { BatchOutcome, WaveRequest } from "../../../../src/crews/dev-batches/application/run-wave.ts";
import { appendToLog } from "../../../../src/crews/dev-batches/domain/batches-log.ts";
import { parseBatchesState } from "../../../../src/shared/domain/dev/batches-state.ts";
import type { BatchesLogEntry } from "../../../../src/shared/domain/dev/batches-state.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const NOW = new Date(Date.UTC(2026, 9, 24, 10, 0));
export const q = (s: string) => `'${s}'`;
export const exists = (b: string) => `git rev-parse --verify --quiet ${q(`refs/heads/batches/prune/${b}`)}`;
export const add = (b: string) => `git worktree add --relative-paths -b ${q(`batches/prune/${b}`)} ${q(`.orkeon/worktrees/prune-${b}`)} 'feat/prune'`;
export const head = (b: string) => `git -C ${q(`.orkeon/worktrees/prune-${b}`)} symbolic-ref -q HEAD`;
export const merge = (b: string) => `git merge --ff-only ${q(`batches/prune/${b}`)}`;
export const tip = (b: string) => `git rev-parse --verify ${q(`refs/heads/batches/prune/${b}`)}`;
export const ahead = (b: string) => `git rev-list --count ${q(`refs/heads/batches/prune/${b}`)} --not 'feat/prune'`;
export const remove = (b: string) => `git worktree remove ${q(`.orkeon/worktrees/prune-${b}`)}`;
export const rebase = (b: string) => `git -C ${q(`.orkeon/worktrees/prune-${b}`)} rebase 'feat/prune'`;
export const status = (b: string) => `git -C ${q(`.orkeon/worktrees/prune-${b}`)} status --porcelain --untracked-files=all`;
export const IGNORED = `git check-ignore -q '.orkeon/dev/prune'`;
export const MERGED = (b: string) => `git merge-base --is-ancestor ${q(`refs/heads/batches/prune/${b}`)} 'feat/prune'`;
export const WT = (b: string) => `${WORKSPACE}/.orkeon/worktrees/prune-${b}`;
export const SHEET = (b: string) => `todo/prune/PRUNE-PLAN-${b}.md`;

/** The main checkout's work folder: the plan and the two sheets, each folder listed by its parent. */
export function mainFiles(): FakeFiles {
  const files = new FakeFiles();
  for (const [path, content] of [["todo/prune/PRUNE-PLAN.md", "plan"], [SHEET("F2"), "sheet F2"], [SHEET("F3"), "sheet F3"]]) {
    files.files.set(`${WORKSPACE}/${path}`, content);
  }
  files.listings.set(`${WORKSPACE}/todo`, ["prune"]);
  files.listings.set(`${WORKSPACE}/todo/prune`, ["PRUNE-PLAN.md", "PRUNE-PLAN-F2.md", "PRUNE-PLAN-F3.md"]);
  return files;
}

/** What a batch writes under its worktree: its ticked sheet, and its verdict; the folders listed as on disk. */
export function batchWrites(files: FakeFiles, root: string, batch: string): void {
  files.files.set(`${root}/${SHEET(batch)}`, `${batch} ticked`);
  files.files.set(`${root}/todo/prune/PRUNE-VERIFY-${batch}.md`, "verdict");
  files.listings.set(`${root}/todo`, ["prune"]);
  files.listings.set(`${root}/todo/prune`, ["PRUNE-PLAN.md", "PRUNE-PLAN-F2.md", "PRUNE-PLAN-F3.md", `PRUNE-VERIFY-${batch}.md`]);
}

/** A promise and the hand that settles it: a batch that returns only when the test releases it. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** A log in memory, as the driver's LogBook. */
export class Book {
  text: string | null;
  added: string[] = [];
  saved = 0;
  constructor(text: string | null = null) { this.text = text; }
  add(line: string): void { this.added.push(line); }
  entries(): BatchesLogEntry[] { return parseBatchesState(appendToLog(this.text, "prune", this.added)).entries; }
  async save(): Promise<string | null> { this.saved++; return null; }
  events(): string[] { return this.added.map((l) => l.replace(/^- \S+ \S+ /, "")); }
}

/** A log whose entries are `lines`. */
export const bookOf = (lines: string[]): Book => new Book(appendToLog(null, "prune", lines));

/** A shell where the batches' branches are new and the checkout stands on the work branch. */
export function shellFor(batches: readonly string[]): FakeShell {
  const shell = new FakeShell();
  shell.results["git branch --show-current"] = { stdout: "feat/prune\n" };
  for (const b of batches) {
    shell.results[exists(b)] = { exitCode: 1 };
    shell.results[head(b)] = { stdout: `refs/heads/batches/prune/${b}\n` };
    shell.results[tip(b)] = { stdout: `abc${b.slice(1)}def\n` };
  }
  return shell;
}

/** A shell for `batches` whose branch for `batch` already exists, with its worktree on it. */
export function shellReopening(batches: readonly string[], batch: string): FakeShell {
  const shell = shellFor(batches);
  delete shell.results[exists(batch)];
  return shell;
}

/** `shell` refusing the first fast-forward of `batch`'s branch, as when the work branch moved past it. */
export function refuseFirstMerge(shell: FakeShell, batch: string): void {
  let merges = 0;
  const prior = shell.answer;
  shell.answer = (c) => (c === merge(batch) && merges++ === 0
    ? { stdout: "", stderr: "fatal: Not possible to fast-forward, aborting.\n", exitCode: 128 }
    : prior?.(c));
}

/** `files` noting each write to the main checkout as a `write <path>` line of the shell's commands, in its order. */
export function traceCheckoutWrites(files: FakeFiles, shell: FakeShell): void {
  files.onWrite = (path) => {
    if (!path.startsWith(`${WORKSPACE}/.orkeon/worktrees/`)) shell.commands.push(`write ${path}`);
  };
}

export function request(wave: string[], book: Book, over: Partial<WaveRequest> = {}): WaveRequest {
  return {
    code: "prune", concurrency: 2, wave, workBranch: "feat/prune", work: "todo", memoryDir: ".orkeon/memory", clock: () => NOW,
    probe: false, sheets: { F2: "PRUNE-PLAN-F2.md", F3: "PRUNE-PLAN-F3.md" }, audits: () => 0, steps: () => undefined,
    book, ...over,
  };
}

export const valid = (batch: string): BatchOutcome => ({ batch, verdict: "VALID", hash: "1111111", lines: [`✓ committed 1111111 on batches/prune/${batch}`], spent: 40 });

/** F3's GAPS outcome, its correction named. */
export const F3_GAPS: BatchOutcome = {
  batch: "F3", verdict: "GAPS", spent: 30, correction: "Major tests: none",
  lines: ["→ Batch F3 GAPS", "→ /dev-implement F3 — correction: Major tests: none", "it appends the gap to the sheet as a step"],
};

/** A global plan with F2 and F3 open, and the same once F2 is merged on 2026-10-24. */
export const OPEN_PLAN = "# PRUNE-PLAN\n\n### Batch F2 — Two — open\n- [ ] 1. a\n\n### Batch F3 — Three — open\n- [ ] 1. b\n";
export const F2_DONE_PLAN = "# PRUNE-PLAN\n\n### Batch F2 — Two — done (2026-10-24)\n- [x] 1. a\n\n### Batch F3 — Three — open\n- [ ] 1. b\n";

/** A clock that moves one minute at each read, from 10:00. */
export function tickingClock(): () => Date {
  let minute = 0;
  return () => new Date(Date.UTC(2026, 9, 24, 10, minute++));
}

export const WORKTREE_ROOT_REFUSED = `The agent working root '${WORKSPACE}/.orkeon/worktrees/prune-F2' is not under any mount of the file system.`;

export const NOT_IGNORED_LINE = "BLOCKED — worktree: .orkeon/dev/prune is not ignored by git: a parallel run needs .orkeon/ ignored (.gitignore or .git/info/exclude); or run with --concurrency 1";

export const PROBE_REFUSED_LINE = "BLOCKED — concurrency 2 refused: git does not work inside a worktree under this shell confinement (Tools:Shell:Confinement:Mode); a runtime from Orkeon/orkeon#191 on binds a linked worktree's git dir: update it, or run with --concurrency 1";

export const F3_RELAUNCH_LINE = "→ F3's code, sheet and verdict stay in .orkeon/worktrees/prune-F3: /dev-batches prune --concurrency 2 relaunches it there, its correction first (Major tests: none)";

export const F2_RELAUNCH_LINE = "→ F2's code, sheet and verdict stay in .orkeon/worktrees/prune-F2: /dev-batches prune --concurrency 2 relaunches it there";

// runBatchChain

export const RUN = { code: "prune", batch: "F2", name: "prune-F2", root: `${WORKSPACE}/.orkeon/worktrees/prune-F2`, branch: "batches/prune/F2", steps: 2 };
export const LAUNCH = { plan: "prune", hooks: [], effort: "high", permissionMode: "bypassPermissions", permissionRules: [], githubTool: false };
export const VERIFY_INPUT = { batch: "F2", plan: "todo/prune/PRUNE-PLAN.md", mode: "fast" };
/** /dev-implement's answer once its steps are green: the audit next. */
export const implemented = JSON.stringify({ lines: ["F2 step 1 green"], next: { crew: "dev-verify", input: VERIFY_INPUT } });
export const AUDIT_VALID = "written: todo/prune/PRUNE-VERIFY-F2.md — capture: todo/prune/capture-F2/\n→ Batch F2 VALID. The close commits the batch's files";
export const AUDIT_GAPS = "written: todo/prune/PRUNE-VERIFY-F2.md — capture: todo/prune/capture-F2/\n→ /dev-implement F2 — correction: Major tests: none";
/** An audit the gate stopped before any verdict. */
export const GATE_RED = "GATE — batch F2 — sheet todo/prune/PRUNE-PLAN-F2.md\n  FAIL design ids …\nGATE — batch F2: RED — fix and run again, no audit before\n";
export const spend = (calls = 10, limit = 100) => ({ limit, calls: () => calls, exhausted: () => calls >= limit });

/** An implement whose steps go green and whose close commits nothing; counts the closes asked of it. */
export class FailingClose {
  closes = 0;
  implement = async (input: Record<string, unknown>): Promise<string> => {
    if (input.close) { this.closes++; return JSON.stringify({ lines: ["✗ git commit failed (nothing to commit)"] }); }
    return implemented;
  };
}
