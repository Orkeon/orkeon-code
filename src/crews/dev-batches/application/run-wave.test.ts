// One wave of a parallel /dev-batches over FakeShell, FakeFiles and a fake runBatch: the batches start together
// under their own worktrees, seeded first; the driver alone logs, merges the VALID ones in id order, harvests and
// removes their worktrees; a stop keeps its worktree, its files there alone, names the command that relaunches it
// there and ends the run once the wave settles. Run:
//   node --test src/crews/dev-batches/application/run-wave.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { runBatchChain, runWave } from "./run-wave.ts";
import type { BatchOutcome, BatchRun, WaveDeps, WaveRequest } from "./run-wave.ts";
import { appendToLog } from "../domain/batches-log.ts";
import { parseBatchesState } from "../../../shared/domain/dev/batches-state.ts";
import type { BatchesLogEntry } from "../../../shared/domain/dev/batches-state.ts";
import { worktreePlace } from "../../../shared/domain/git/worktree.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const NOW = new Date(Date.UTC(2026, 9, 24, 10, 0));
const q = (s: string) => `'${s}'`;
const exists = (b: string) => `git rev-parse --verify --quiet ${q(`refs/heads/batches/prune/${b}`)}`;
const add = (b: string) => `git worktree add --relative-paths -b ${q(`batches/prune/${b}`)} ${q(`.orkeon/worktrees/prune-${b}`)} 'feat/prune'`;
const head = (b: string) => `git -C ${q(`.orkeon/worktrees/prune-${b}`)} symbolic-ref -q HEAD`;
const merge = (b: string) => `git merge --ff-only ${q(`batches/prune/${b}`)}`;
const tip = (b: string) => `git rev-parse --verify ${q(`refs/heads/batches/prune/${b}`)}`;
const ahead = (b: string) => `git rev-list --count ${q(`refs/heads/batches/prune/${b}`)} --not 'feat/prune'`;
const remove = (b: string) => `git worktree remove ${q(`.orkeon/worktrees/prune-${b}`)}`;
const rebase = (b: string) => `git -C ${q(`.orkeon/worktrees/prune-${b}`)} rebase 'feat/prune'`;
const IGNORED = `git check-ignore -q '.orkeon/dev/prune'`;
const MERGED = (b: string) => `git merge-base --is-ancestor ${q(`refs/heads/batches/prune/${b}`)} 'feat/prune'`;
const WT = (b: string) => `/workspace/.orkeon/worktrees/prune-${b}`;
const SHEET = (b: string) => `todo/prune/PRUNE-PLAN-${b}.md`;

/** The main checkout's work folder: the plan and the two sheets, each folder listed by its parent. */
function mainFiles(): FakeFiles {
  const files = new FakeFiles();
  for (const [path, content] of [["todo/prune/PRUNE-PLAN.md", "plan"], [SHEET("F2"), "sheet F2"], [SHEET("F3"), "sheet F3"]]) {
    files.files.set(`/workspace/${path}`, content);
  }
  files.listings.set("/workspace/todo", ["prune"]);
  files.listings.set("/workspace/todo/prune", ["PRUNE-PLAN.md", "PRUNE-PLAN-F2.md", "PRUNE-PLAN-F3.md"]);
  return files;
}

/** What a batch writes under its worktree: its ticked sheet, and its verdict; the folders listed as on disk. */
function batchWrites(files: FakeFiles, root: string, batch: string): void {
  files.files.set(`${root}/${SHEET(batch)}`, `${batch} ticked`);
  files.files.set(`${root}/todo/prune/PRUNE-VERIFY-${batch}.md`, "verdict");
  files.listings.set(`${root}/todo`, ["prune"]);
  files.listings.set(`${root}/todo/prune`, ["PRUNE-PLAN.md", "PRUNE-PLAN-F2.md", "PRUNE-PLAN-F3.md", `PRUNE-VERIFY-${batch}.md`]);
}

/** A log in memory, as the driver's LogBook. */
class Book {
  text: string | null;
  added: string[] = [];
  saved = 0;
  constructor(text: string | null = null) { this.text = text; }
  add(line: string): void { this.added.push(line); }
  entries(): BatchesLogEntry[] { return parseBatchesState(appendToLog(this.text, "prune", this.added)).entries; }
  async save(): Promise<string | null> { this.saved++; return null; }
  events(): string[] { return this.added.map((l) => l.replace(/^- \S+ \S+ /, "")); }
}

/** A shell where the batches' branches are new and the checkout stands on the work branch. */
function shellFor(batches: readonly string[]): FakeShell {
  const shell = new FakeShell();
  shell.results["git branch --show-current"] = { stdout: "feat/prune\n" };
  for (const b of batches) {
    shell.results[exists(b)] = { exitCode: 1 };
    shell.results[head(b)] = { stdout: `refs/heads/batches/prune/${b}\n` };
    shell.results[tip(b)] = { stdout: `abc${b.slice(1)}def\n` };
  }
  return shell;
}

function request(wave: string[], book: Book, over: Partial<WaveRequest> = {}): WaveRequest {
  return {
    code: "prune", concurrency: 2, wave, workBranch: "feat/prune", work: "todo", memoryDir: ".orkeon/memory", now: NOW,
    probe: false, sheets: { F2: "PRUNE-PLAN-F2.md", F3: "PRUNE-PLAN-F3.md" }, audits: () => 0, steps: () => undefined,
    book, ...over,
  };
}

const valid = (batch: string): BatchOutcome => ({ batch, verdict: "VALID", hash: "1111111", lines: [`✓ committed 1111111 on batches/prune/${batch}`], spent: 40 });

describe("runWave", () => {
  it("starts every batch of the wave before any settles, each under its own worktree, seeded first", async () => {
    const shell = shellFor(["F2", "F3"]);
    const started: BatchRun[] = [];
    const release: Array<() => void> = [];
    const files = mainFiles();
    const deps: WaveDeps = {
      files, shell,
      runBatch: (run) => {
        started.push(run);
        strictEqual(files.files.get(`${run.root}/todo/prune/PRUNE-PLAN.md`), "plan", `${run.batch} seeded before its run`);
        return new Promise((done) => release.push(() => done(valid(run.batch))));
      },
    };
    const book = new Book();
    const pending = runWave(request(["F2", "F3"], book), deps);
    for (let i = 0; i < 20 && started.length < 2; i++) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
    deepStrictEqual(started.map((r) => [r.batch, r.root, r.branch]), [
      ["F2", "/workspace/.orkeon/worktrees/prune-F2", "batches/prune/F2"],
      ["F3", "/workspace/.orkeon/worktrees/prune-F3", "batches/prune/F3"],
    ]);
    ok(book.saved >= 1, "the launches are written before the batches run");
    release.forEach((r) => r());
    const out = await pending;
    strictEqual(out.stopped, false);
    ok(shell.commands.includes(add("F2")) && shell.commands.includes(add("F3")));
  });

  it("logs launched for each, then each batch's lines in id order; merges in id order, the second rebased", async () => {
    const shell = shellFor(["F2", "F3"]);
    let f3Merges = 0;
    const run = shell.run.bind(shell);
    shell.run = async (c, o) => {
      if (c !== merge("F3") || f3Merges++ > 0) return run(c, o);
      shell.commands.push(c);
      return { stdout: "", stderr: "fatal: Not possible to fast-forward, aborting.\n", exitCode: 128 };
    };
    const book = new Book();
    const files = mainFiles();
    const write = files.write.bind(files);
    // The driver's writes to the main checkout, in the shell's order.
    files.write = async (path, content) => {
      if (!path.startsWith("/workspace/.orkeon/worktrees/")) shell.commands.push(`write ${path}`);
      return write(path, content);
    };
    // F3 settles first: the log still follows the ids.
    const out = await runWave(request(["F2", "F3"], book), {
      files, shell,
      runBatch: async (r) => {
        batchWrites(files, r.root, r.batch);
        return r.batch === "F2" ? new Promise((d) => setTimeout(() => d(valid("F2")), 5)) : valid("F3");
      },
    });
    deepStrictEqual(book.events(), [
      "F2 launched prune-F2 audits 0", "F3 launched prune-F3 audits 0",
      "F2 returned VALID", "F2 merged abc2def", "F3 returned VALID", "F3 merged abc3def",
    ]);
    const merges = shell.commands.filter((c) => c.startsWith("git merge --ff-only"));
    deepStrictEqual(merges, [merge("F2"), merge("F3"), merge("F3")]);
    ok(shell.commands.includes(rebase("F3")));
    ok(shell.commands.indexOf(remove("F2")) > shell.commands.indexOf(merge("F2")));
    ok(shell.commands.includes(remove("F3")));
    // Harvested after the merge, so that a merge's checkout of a tracked sheet is never overwritten.
    ok(shell.commands.indexOf(`write /workspace/${SHEET("F2")}`) > shell.commands.indexOf(merge("F2")), shell.commands.join("\n"));
    strictEqual(files.files.get(`/workspace/${SHEET("F3")}`), "F3 ticked");
    strictEqual(files.files.get("/workspace/todo/prune/PRUNE-VERIFY-F2.md"), "verdict");
    strictEqual(out.stopped, false);
    ok(out.lines.some((l) => l.startsWith("✓ F2 VALID")), out.lines.join("\n"));
  });

  it("merges the VALID batch beside a GAPS one; the GAPS one's files stay in its kept worktree, its correction logged and the relaunch named", async () => {
    const shell = shellFor(["F2", "F3"]);
    const book = new Book();
    const files = mainFiles();
    const gaps: string[] = [];
    const out = await runWave(request(["F2", "F3"], book), {
      files, shell,
      runBatch: async (r) => {
        batchWrites(files, r.root, r.batch);
        return r.batch === "F2" ? valid("F2") : {
          batch: "F3", verdict: "GAPS", spent: 30, correction: "Major tests: none",
          lines: ["→ Batch F3 GAPS", "→ /dev-implement F3 — correction: Major tests: none", "it appends the gap to the sheet as a step"],
        };
      },
      afterGaps: async (vfsPath) => { gaps.push(vfsPath); return ["→ 1 candidate mistake: /dev-learn"]; },
    });
    deepStrictEqual(book.events().slice(2), ["F2 returned VALID", "F2 merged abc2def", "F3 returned GAPS — correction: Major tests: none"]);
    ok(!shell.commands.includes(merge("F3")) && !shell.commands.includes(remove("F3")));
    // The main checkout never claims F3's work: its sheet and verdict stay in the worktree with its code.
    strictEqual(files.files.get(`/workspace/${SHEET("F3")}`), "sheet F3");
    ok(!files.files.has("/workspace/todo/prune/PRUNE-VERIFY-F3.md"));
    deepStrictEqual(gaps, [`${WT("F3")}/todo`]);
    strictEqual(out.stopped, true);
    ok(out.lines.includes("→ 1 candidate mistake: /dev-learn"));
    ok(!out.lines.some((l) => l.includes("/dev-implement")), out.lines.join("\n"));
    strictEqual(files.files.get(`/workspace/${SHEET("F2")}`), "F2 ticked");
    ok(out.lines.some((l) => l.includes(".orkeon/worktrees/prune-F3 kept") && l.includes("test suite")), out.lines.join("\n"));
    strictEqual(out.lines.at(-1), "→ F3's code, sheet and verdict stay in .orkeon/worktrees/prune-F3: /dev-batches prune --concurrency 2 relaunches it there, its correction first (Major tests: none)");
  });

  it("relaunches a GAPS batch in its worktree with the correction its log entry carries", async () => {
    const shell = shellFor(["F2"]);
    delete shell.results[exists("F2")];
    const book = new Book(appendToLog(null, "prune", [
      "- 2026-10-24 09:00 F2 launched prune-F2 audits 0", "- 2026-10-24 09:30 F2 returned GAPS — correction: Major tests: none",
    ]));
    const runs: BatchRun[] = [];
    await runWave(request(["F2"], book), { files: mainFiles(), shell, runBatch: async (r) => { runs.push(r); return valid("F2"); } });
    deepStrictEqual(runs.map((r) => [r.batch, r.correction]), [["F2", "Major tests: none"]]);
    ok(!shell.commands.includes(add("F2")));
  });

  it("refuses the wave when the dev state is not ignored by git: nothing made", async () => {
    const shell = shellFor(["F2"]);
    shell.results[IGNORED] = { exitCode: 1 };
    let ran = false;
    const out = await runWave(request(["F2"], new Book()), { files: mainFiles(), shell, runBatch: async () => { ran = true; return valid("F2"); } });
    strictEqual(ran, false);
    ok(!shell.commands.includes(add("F2")));
    strictEqual(out.lines.at(-1), "BLOCKED — worktree: .orkeon/dev/prune is not ignored by git: a parallel run needs .orkeon/ ignored (.gitignore or .git/info/exclude); or run with --concurrency 1");
  });

  it("stops on a rebase conflict: logged BLOCKED — merge, the worktree kept and named", async () => {
    const shell = shellFor(["F2"]);
    shell.results[merge("F2")] = { exitCode: 128, stderr: "fatal: Not possible to fast-forward, aborting.\n" };
    shell.results[rebase("F2")] = { exitCode: 1, stderr: "CONFLICT (content): Merge conflict in src/a.ts\n" };
    const book = new Book();
    const out = await runWave(request(["F2"], book), { files: new FakeFiles(), shell, runBatch: async () => valid("F2") });
    const last = book.events().at(-1)!;
    ok(last.startsWith("F2 stopped BLOCKED — merge: not merged, the rebase stopped (CONFLICT"), last);
    ok(!shell.commands.includes(remove("F2")));
    strictEqual(out.stopped, true);
    ok(out.lines.some((l) => l.includes(".orkeon/worktrees/prune-F2 kept")));
    strictEqual(out.lines.at(-1), "→ F2's code, sheet and verdict stay in .orkeon/worktrees/prune-F2: /dev-batches prune --concurrency 2 relaunches it there");
  });

  it("says a batch the runtime rejected, and a budget stop, as BLOCKED stops", async () => {
    const shell = shellFor(["F2", "F3"]);
    const book = new Book();
    const out = await runWave(request(["F2", "F3"], book), {
      files: new FakeFiles(), shell,
      runBatch: async (r) => {
        if (r.batch === "F2") throw new Error("The agent working root '/workspace/.orkeon/worktrees/prune-F2' is not under any mount of the file system.");
        return { batch: "F3", verdict: "BLOCKED", lines: ["stopped BLOCKED — budget: 120 tool calls"], spent: 120 };
      },
    });
    deepStrictEqual(book.events().slice(2), [
      "F2 stopped BLOCKED — The agent working root '/workspace/.orkeon/worktrees/prune-F2' is not under any mount of the file system.",
      "F3 stopped BLOCKED — budget: 120 tool calls",
    ]);
    strictEqual(out.stopped, true);
  });

  it("reuses the worktree of a batch the log leaves launched: relaunched, nothing created", async () => {
    const shell = shellFor(["F2"]);
    delete shell.results[exists("F2")];
    const book = new Book(appendToLog(null, "prune", ["- 2026-10-24 09:00 F2 launched prune-F2 audits 0"]));
    const runs: string[] = [];
    await runWave(request(["F2"], book), { files: new FakeFiles(), shell, runBatch: async (r) => { runs.push(r.batch); return valid("F2"); } });
    ok(!shell.commands.includes(add("F2")));
    deepStrictEqual(runs, ["F2"]);
    strictEqual(book.events()[0], "F2 relaunched prune-F2 audits 0");
  });

  it("refuses a branch of the batch that exists without its worktree on it: nothing launched", async () => {
    const shell = shellFor(["F2"]);
    delete shell.results[exists("F2")];
    shell.results[head("F2")] = { exitCode: 128, stderr: "fatal: cannot change to '.orkeon/worktrees/prune-F2'\n" };
    const book = new Book();
    let ran = false;
    const out = await runWave(request(["F2"], book), { files: new FakeFiles(), shell, runBatch: async () => { ran = true; return valid("F2"); } });
    strictEqual(ran, false);
    deepStrictEqual(book.added, []);
    ok(out.stopped && out.lines.at(-1)!.startsWith("BLOCKED — worktree: "), out.lines.join("\n"));
  });

  it("merges without a run a batch whose worktree sheet is done and whose branch holds the close's commit", async () => {
    const shell = shellFor(["F2"]);
    delete shell.results[exists("F2")];
    shell.results[ahead("F2")] = { stdout: "1\n" };
    const files = new FakeFiles();
    files.files.set("/workspace/.orkeon/worktrees/prune-F2/todo/prune/PRUNE-PLAN-F2.md", "# PRUNE-PLAN-F2 — prune — done (2026-10-24)\n");
    const book = new Book(appendToLog(null, "prune", ["- 2026-10-24 09:00 F2 launched prune-F2 audits 0"]));
    let ran = false;
    await runWave(request(["F2"], book), { files, shell, runBatch: async () => { ran = true; return valid("F2"); } });
    strictEqual(ran, false);
    deepStrictEqual(book.events(), ["F2 returned VALID", "F2 merged abc2def"]);
    ok(shell.commands.includes(merge("F2")));
  });

  it("removes without a run a done batch whose branch the work branch already holds (killed between merge and removal)", async () => {
    const shell = shellFor(["F2"]);
    delete shell.results[exists("F2")];
    shell.results[ahead("F2")] = { stdout: "0\n" };
    shell.results[MERGED("F2")] = { exitCode: 0 };
    const files = mainFiles();
    files.files.set(`${WT("F2")}/${SHEET("F2")}`, "# PRUNE-PLAN-F2 — prune — done (2026-10-24)\n");
    const book = new Book(appendToLog(null, "prune", ["- 2026-10-24 09:00 F2 launched prune-F2 audits 0"]));
    let ran = false;
    const out = await runWave(request(["F2"], book), { files, shell, runBatch: async () => { ran = true; return valid("F2"); } });
    strictEqual(ran, false);
    ok(shell.commands.includes(remove("F2")), shell.commands.join("\n"));
    strictEqual(out.stopped, false);
  });

  it("says a removal git refuses as a ⚠ line, the merge standing", async () => {
    const shell = shellFor(["F2"]);
    shell.results[`git -C ${q(".orkeon/worktrees/prune-F2")} status --porcelain --untracked-files=all`] = { stdout: "?? tmp.log\n" };
    const out = await runWave(request(["F2"], new Book()), { files: new FakeFiles(), shell, runBatch: async () => valid("F2") });
    ok(out.lines.some((l) => l.startsWith("⚠ refused: .orkeon/worktrees/prune-F2 holds 1 uncommitted")), out.lines.join("\n"));
    strictEqual(out.stopped, false);
  });

  it("probes git under the first worktree before any launch; a failure refuses the run and removes the worktrees made", async () => {
    const shell = shellFor(["F2", "F3"]);
    const book = new Book();
    let ran = false;
    const roots: string[] = [];
    const out = await runWave(request(["F2", "F3"], book, { probe: true }), {
      files: new FakeFiles(), shell,
      runBatch: async () => { ran = true; return valid("F2"); },
      probe: async (root) => { roots.push(root); return { exitCode: 128, top: "" }; },
    });
    deepStrictEqual(roots, ["/workspace/.orkeon/worktrees/prune-F2"]);
    strictEqual(ran, false);
    deepStrictEqual(book.added, []);
    strictEqual(out.lines.at(-1),
      "BLOCKED — concurrency 2 refused: git does not work inside a worktree under this shell confinement (Tools:Shell:Confinement:Mode); run with --concurrency 1 (runtime issue Orkeon/orkeon#188)");
    ok(shell.commands.includes(remove("F2")) && shell.commands.includes(remove("F3")));
  });

  it("goes on when the probe's top is the worktree, and refuses a top that is another folder", async () => {
    const good = shellFor(["F2"]);
    const ran: string[] = [];
    await runWave(request(["F2"], new Book(), { probe: true }), {
      files: new FakeFiles(), shell: good, runBatch: async (r) => { ran.push(r.batch); return valid("F2"); },
      probe: async (root) => ({ exitCode: 0, top: `${root}\n` }),
    });
    deepStrictEqual(ran, ["F2"]);
    const other = shellFor(["F2"]);
    const out = await runWave(request(["F2"], new Book(), { probe: true }), {
      files: new FakeFiles(), shell: other, runBatch: async () => valid("F2"),
      probe: async () => ({ exitCode: 0, top: "/workspace\n" }),
    });
    ok(out.stopped && out.lines.at(-1)!.includes("Orkeon/orkeon#188"));
  });

  it("stops before any launch when a worktree cannot be seeded", async () => {
    const shell = shellFor(["F2"]);
    const files = mainFiles();
    files.write = async () => { throw new Error("No space left on device"); };
    let ran = false;
    const out = await runWave(request(["F2"], new Book()), { files, shell, runBatch: async () => { ran = true; return valid("F2"); } });
    strictEqual(ran, false);
    strictEqual(out.lines.at(-1), "BLOCKED — seed: .orkeon/worktrees/prune-F2 not seeded: No space left on device");
  });

  it("hands each batch its open steps", async () => {
    const shell = shellFor(["F2", "F3"]);
    const steps: Array<number | undefined> = [];
    await runWave(request(["F2", "F3"], new Book(), { steps: (b) => (b === "F2" ? 3 : undefined) }), {
      files: new FakeFiles(), shell, runBatch: async (r) => { steps.push(r.steps); return valid(r.batch); },
    });
    deepStrictEqual(steps, [3, undefined]);
  });
});

describe("runBatchChain", () => {
  const RUN = { code: "prune", batch: "F2", name: "prune-F2", root: "/workspace/.orkeon/worktrees/prune-F2", branch: "batches/prune/F2", steps: 2 };
  const LAUNCH = { plan: "prune", hooks: [], effort: "high", permissionMode: "bypassPermissions", permissionRules: [], githubTool: false };
  const VERIFY_INPUT = { batch: "F2", plan: "todo/prune/PRUNE-PLAN.md", mode: "fast" };
  const implemented = JSON.stringify({ lines: ["F2 step 1 green"], next: { crew: "dev-verify", input: VERIFY_INPUT } });
  const VALID = "written: todo/prune/PRUNE-VERIFY-F2.md — capture: todo/prune/capture-F2/\n→ Batch F2 VALID. The close commits the batch's files";
  const GAPS = "written: todo/prune/PRUNE-VERIFY-F2.md — capture: todo/prune/capture-F2/\n→ /dev-implement F2 — correction: Major tests: none";
  const spend = (calls = 10, limit = 100) => ({ limit, calls: () => calls, exhausted: () => calls >= limit });

  it("runs implement, the audit, then the close without a push, and answers VALID with the commit", async () => {
    const inputs: unknown[] = [];
    const out = await runBatchChain(RUN, LAUNCH, {
      implement: async (input) => {
        inputs.push(input);
        return (input as { close?: boolean }).close ? JSON.stringify({ lines: ["✓ committed 1a2b3c4 on batches/prune/F2: 3 file(s)"] }) : implemented;
      },
      verify: async (input) => { inputs.push(input); return VALID; },
      spend: spend(),
    });
    deepStrictEqual(inputs, [
      { ...LAUNCH, batch: "F2", steps: 2 },
      VERIFY_INPUT,
      { ...LAUNCH, batch: "F2", close: true, push: false },
    ]);
    strictEqual(out.verdict, "VALID");
    strictEqual(out.hash, "1a2b3c4");
    strictEqual(out.spent, 10);
  });

  it("answers GAPS without a close, and BLOCKED when the implement names no audit or the close commits nothing", async () => {
    let closes = 0;
    const implement = async (input: Record<string, unknown>) => {
      if (input.close) { closes++; return JSON.stringify({ lines: ["✗ git commit failed (nothing to commit)"] }); }
      return implemented;
    };
    const gaps = await runBatchChain(RUN, LAUNCH, { implement, verify: async () => GAPS, spend: spend() });
    deepStrictEqual([gaps.verdict, gaps.correction], ["GAPS", "Major tests: none"]);
    strictEqual(closes, 0);
    const none = await runBatchChain(RUN, LAUNCH, { implement: async () => JSON.stringify({ lines: ["BLOCKED — step 1: the red tests did not fail"] }), verify: async () => VALID, spend: spend() });
    deepStrictEqual([none.verdict, none.lines[0]], ["BLOCKED", "BLOCKED — step 1: the red tests did not fail"]);
    const unclosed = await runBatchChain(RUN, LAUNCH, { implement, verify: async () => VALID, spend: spend() });
    deepStrictEqual([unclosed.verdict, unclosed.lines.at(-1)], ["BLOCKED", "BLOCKED — close: git commit failed (nothing to commit)"]);
  });

  it("hands a relaunched batch's correction to its implement", async () => {
    const inputs: Array<Record<string, unknown>> = [];
    await runBatchChain({ ...RUN, correction: "Major tests: none" }, LAUNCH, {
      implement: async (input) => { inputs.push(input); return implemented; }, verify: async () => GAPS, spend: spend(),
    });
    deepStrictEqual(inputs[0], { ...LAUNCH, batch: "F2", steps: 2, correction: "Major tests: none" });
  });

  it("stops the batch once its tool calls are spent: stopped BLOCKED — budget", async () => {
    let audits = 0;
    const out = await runBatchChain(RUN, LAUNCH, {
      implement: async () => implemented, verify: async () => { audits++; return VALID; }, spend: spend(120, 120),
    });
    deepStrictEqual([out.verdict, out.lines.at(-1), out.spent, audits], ["BLOCKED", "stopped BLOCKED — budget: 120 tool calls", 120, 0]);
  });
});
