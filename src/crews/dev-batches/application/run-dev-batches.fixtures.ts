// The work folder, scripted git and runs of the runDevBatches tests: the fixture work folder
// tests/fixtures/dev/workbench/demo/ (F1 done, F2 after F1, F3 alone) over FakeFiles, a FakeShell answering the
// close's git, the plan marked as the chain would, and the runs that drive a plan to its close.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { parseBatchesState } from "../../../shared/domain/dev/batches-state.ts";
import {
  GIT_COMMITTER_IDENT_COMMAND, GIT_CURRENT_BRANCH_COMMAND, GIT_DEFAULT_BRANCH_COMMAND, GIT_HEAD_COMMAND, GIT_IDENT_COMMAND,
  gitPushCommand,
} from "../../../shared/domain/git/close.ts";
import { ACTIVE_RECORD, runDevBatches } from "./run-dev-batches.ts";
import type { BatchesAnswer, DevBatchesDeps } from "./run-dev-batches.ts";
import { WORKSPACE } from "../../../shared/domain/dev/path-rebase.ts";

const DEMO_DIR = fileURLToPath(new URL("../../../../tests/fixtures/dev/workbench/demo/", import.meta.url));
export const DIR = `${WORKSPACE}/workbench/demo`;
export const PLAN = `${DIR}/DEMO-PLAN.md`;
export const LOG = `${WORKSPACE}/.orkeon/dev/demo/batches-state.md`;
export const VERDICT_F2 = `${DIR}/DEMO-VERIFY-F2.md`;
const IDENT = { stdout: "Ada <ada@example.org> 1761300000 +0000\n" };

export interface Setup { files: FakeFiles; shell: FakeShell; deps: DevBatchesDeps }

/** The demo work folder, a shell on `branch`, and a clock moving one minute at each read. */
export function setup(branch = "feat/demo"): Setup {
  const files = new FakeFiles();
  const names = readdirSync(DEMO_DIR).sort();
  for (const name of names) files.files.set(`${DIR}/${name}`, readFileSync(DEMO_DIR + name, "utf-8"));
  files.listings.set(WORKSPACE, ["workbench"]);
  files.listings.set(`${WORKSPACE}/workbench`, ["demo"]);
  files.listings.set(DIR, names);
  const shell = new FakeShell();
  shell.results[GIT_IDENT_COMMAND] = IDENT;
  shell.results[GIT_COMMITTER_IDENT_COMMAND] = IDENT;
  shell.results[GIT_CURRENT_BRANCH_COMMAND] = { stdout: `${branch}\n` };
  shell.results[GIT_DEFAULT_BRANCH_COMMAND] = { stdout: "origin/main\n" };
  shell.results[GIT_HEAD_COMMAND] = { stdout: "abc1234\n" };
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  let minute = 0;
  const deps: DevBatchesDeps = {
    files, shell, config, log: new FakeLogger(), clock: () => new Date(Date.UTC(2026, 9, 24, 8, minute++)),
  };
  return { files, shell, deps };
}

export const parse = (text: string): BatchesAnswer => JSON.parse(text) as BatchesAnswer;

/** One run of the use case, its answer parsed. */
export const run = async (input: Record<string, unknown>, deps: DevBatchesDeps): Promise<BatchesAnswer> => parse(await runDevBatches(input, deps));

/** The run record, read back. */
export const record = (files: FakeFiles): Record<string, any> => JSON.parse(files.files.get(ACTIVE_RECORD)!);

export const markDone = (files: FakeFiles, batch: string): void => {
  const plan = files.files.get(PLAN)!;
  files.files.set(PLAN, plan.replace(new RegExp(`(### Batch ${batch} — [^\\n]*?) — open`), "$1 — done (2026-10-24)"));
};

/** F1 open again, in the plan and its sheet: the plan's three batches all to run. */
export const reopenF1 = (files: FakeFiles): void => {
  files.files.set(PLAN, files.files.get(PLAN)!.replace("### Batch F1 — Parsers — done (2026-10-20)", "### Batch F1 — Parsers — open"));
  const sheet = `${DIR}/DEMO-PLAN-F1.md`;
  files.files.set(sheet, files.files.get(sheet)!.replace("# DEMO-PLAN-F1 — Parsers — done (2026-10-20)", "# DEMO-PLAN-F1 — Parsers")
    .replace(/^Done \(2026-10-20\).*$/m, ""));
};

/** F3's sheet with an assumption to validate. */
export const addF3Assumption = (files: FakeFiles): void => {
  const f3 = `${DIR}/DEMO-PLAN-F3.md`;
  files.files.set(f3, `${files.files.get(f3)!}\n## Assumptions\n| # | Assumption | To be validated by |\n|---|---|---|\n| H1 | ids are stable | the user |\n`);
};

export const VALID_F2 = "# DEMO-VERIFY-F2 — 2026-10-24 09:00 — fast\n\n## Verdict — VALID\n\nValidations: `npm test` — exit 0, whole suite\n";

/** F2 launched then done, F3 launched then done: the next run, back from F3, closes the plan. */
export async function beforeTheClose(files: FakeFiles, deps: DevBatchesDeps, first: Record<string, unknown> = {}): Promise<void> {
  await runDevBatches({ code: "demo", ...first }, deps);
  markDone(files, "F2");
  await runDevBatches({ after: [] }, deps);
  markDone(files, "F3");
}

/** The run back from F3 that closes the plan. */
export const BACK_FROM_F3 = { after: [] };

/** The runs of a three-batch plan (F1 reopened), each followed by marking its batch done as the chain would. */
export const THREE_BATCH_RUNS: readonly { input: Record<string, unknown>; then?: (files: FakeFiles) => void }[] = [
  { input: { code: "demo" }, then: (files) => markDone(files, "F1") },
  { input: { after: ["✓ committed 1111111 on feat/demo: 2 file(s)"] }, then: (files) => markDone(files, "F2") },
  { input: { after: ["✓ committed 2222222 on feat/demo: 1 file(s)"] }, then: (files) => { markDone(files, "F3"); addF3Assumption(files); } },
  { input: { after: ["→ F3 committed"] } },
];

/** The demo with F1 reopened, its first `n` runs of THREE_BATCH_RUNS made. */
export async function threeBatchesAfter(n: number): Promise<Setup> {
  const at = setup();
  reopenF1(at.files);
  for (const step of THREE_BATCH_RUNS.slice(0, n)) {
    await runDevBatches(step.input, at.deps);
    step.then?.(at.files);
  }
  return at;
}

export const events = (files: FakeFiles): string[] =>
  parseBatchesState(files.files.get(LOG) ?? "").entries.map((e) => `${e.batch ?? ""} ${e.event}`.trim());

/** The merged entries' details: the commit each close named. */
export const mergedDetails = (files: FakeFiles): Array<string | undefined> =>
  parseBatchesState(files.files.get(LOG)!).entries.filter((e) => e.event === "merged").map((e) => e.detail);

/** How many times the shell pushed the work branch. */
export const pushes = (shell: FakeShell): number => shell.commands.filter((c) => c === gitPushCommand("feat/demo")).length;

/** The PR body the close wrote. */
export const prBody = (files: FakeFiles): string => files.writes.find((w) => w.path.endsWith("/PR.md"))?.content ?? "";

export const PR_ASSUMPTIONS =
  "## Assumptions to validate\n\n| Id | Assumption | To be validated by |\n|----|------------|--------------------|\n| F3 H1 | ids are stable | the user |\n";

/** A reviewer answering CLEAR. */
export function clearReviewer(): FakeLlm {
  const llm = new FakeLlm();
  llm.extractions = [{ verdict: "CLEAR", rows: [] }];
  return llm;
}

/** A reviewer raising one Blocking question on F2. */
export function blockingReviewer(): FakeLlm {
  const llm = new FakeLlm();
  llm.extractions = [{ verdict: "GAPS", rows: [{ severity: "Blocking", question: "Does F2 still read the parsers F1 gave?", evidence: "DEMO-PLAN-F2.md:6", target: "F2" }] }];
  return llm;
}

/** What the reviewer of F2 is handed once F1 closed with 1111111. */
export const F2_REVIEW_BRIEF: readonly string[] = [
  "The batches closed before it, with their commits and files:\nF1 1111111: ",
  "### workbench/demo/DEMO-PLAN-F2.md\n```text\n# DEMO-PLAN-F2 — Command",
  "### what F1 changed (git show 1111111)\n```text\ndiff --git a/src/parsers.ts b/src/parsers.ts\n+export const parse = 1;\n```",
  "The plan: workbench/demo/DEMO-PLAN.md (in this brief)",
];

export const F1_SHOW = { stdout: "diff --git a/src/parsers.ts b/src/parsers.ts\n+export const parse = 1;\n" };

/** The demo's repository pack asking for a work branch. */
export const BRANCH_PACK = "contrib:\n  branch: feat|fix/<slug>\n";
export const REPO_YAML = `${WORKSPACE}/.orkeon/repo.yaml`;
export const FEAT_DEMO_EXISTS = "git rev-parse --verify --quiet 'refs/heads/feat/demo'";

/** On main, the pack asking for a work branch, the run's branch absent. */
export function packedOnMain(): Setup {
  const at = setup("main");
  at.files.files.set(REPO_YAML, BRANCH_PACK);
  at.shell.results[FEAT_DEMO_EXISTS] = { exitCode: 1 };
  return at;
}

/** The verdict file of F2 with a third GAPS audit, written since the launch (the fixture holds two before it). */
export function addGapsAudit(files: FakeFiles): void {
  const text = files.files.get(VERDICT_F2);
  files.files.set(VERDICT_F2, `${text}\n${text?.split("\n\n# ")[1].replace(/^/, "# ")}`);
}

/** Session concurrency values a run refuses. */
export const BAD_CONCURRENCIES: readonly unknown[] = [5, 0, "x"];

/** Session modes that ask before shell commands. */
export const ASKING_MODES: readonly string[] = ["default", "acceptEdits"];

export const IN_PROGRESS_LINE =
  "BLOCKED — the run of demo is in progress (.orkeon/dev/batches-active.json): take it to its close (/dev-batches demo), " +
  "or delete that file to drop it, then /dev-batches other";

export const GAPS_HUMAN_LINE =
  "→ a human decides: the correction the audit names (/dev-implement F2 demo — correction: <finding>), then /dev-batches demo goes on";

export const KEPT_F2_LINE =
  "BLOCKED — F2 stays in .orkeon/worktrees/demo-F2, kept by a parallel run: /dev-batches demo --concurrency 2 relaunches it there; " +
  "or remove it (git worktree remove --force .orkeon/worktrees/demo-F2, then git branch -D batches/demo/F2) to run it here";

/** The record of a parallel run of demo, in `mode`. */
export const parallelRecord = (mode = "bypassPermissions"): string =>
  JSON.stringify({ code: "demo", pr: false, context: { permissionMode: mode, concurrency: 2 } });

export const BRANCH_NAMES: readonly { name: string; pattern: string; expected: string | null }[] = [
  { name: "takes the pattern's first prefix", pattern: "feat|fix/<slug>", expected: "feat/demo" },
  { name: "names no branch for a pattern without a prefix", pattern: "<slug>", expected: null },
];

/** F2 and F3 anchoring disjoint paths: one wave of two; the batch agents recorded in `runs`. */
export function parallelSetup(): Setup & { runs: Array<{ batch: string; root: string; mode: string }> } {
  const at = setup();
  const anchors = (path: string) => `\n## Anchors\n\n| Step | Test class / fixture | Shared doubles and builders | Production filled or created |\n|------|----|----|----|\n| 1 — x | \`${path}.test.ts\` — to create | — | \`${path}.ts\` — to create |\n`;
  for (const [batch, path] of [["F2", "src/status"], ["F3", "docs/status"]]) {
    const sheet = `${DIR}/DEMO-PLAN-${batch}.md`;
    at.files.files.set(sheet, at.files.files.get(sheet)! + anchors(path));
  }
  for (const b of ["F2", "F3"]) {
    at.shell.results[`git rev-parse --verify --quiet 'refs/heads/batches/demo/${b}'`] = { exitCode: 1 };
    at.shell.results[`git -C '.orkeon/worktrees/demo-${b}' symbolic-ref -q HEAD`] = { stdout: `refs/heads/batches/demo/${b}\n` };
    at.shell.results[`git rev-parse --verify 'refs/heads/batches/demo/${b}'`] = { stdout: `beef${b.slice(1)}00\n` };
  }
  const runs: Array<{ batch: string; root: string; mode: string }> = [];
  at.deps.runBatch = async (r, context) => {
    runs.push({ batch: r.batch, root: r.root, mode: context.permissionMode });
    return { batch: r.batch, verdict: "VALID", hash: "1111111", lines: [], spent: 10 };
  };
  at.deps.probe = async (root) => ({ exitCode: 0, top: root });
  return { ...at, runs };
}
