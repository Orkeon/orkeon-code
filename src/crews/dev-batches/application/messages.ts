// The lines /dev-batches shows: its status and report lines, its BLOCKED reasons, the stops it logs and the lines of
// the plan's close (ADR 0026).

import { CLOSE_STOP } from "../../dev-implement/domain/markers.ts";

// ── Shared by the run and its waves ─────────────────────────────────────────

export const HASH_NOT_READ = "(hash not read)";
export const LOG_UNWRITABLE = "BLOCKED — the log must be writable before a launch";
/** The stop of a batch whose close committed nothing; `failed` is the close's own ✗ line, its mark cut. */
export const closeStop = (failed: string | undefined): string => `${CLOSE_STOP} ${failed ?? "the batch was not committed"}`;

// ── The run (run-dev-batches.ts) ────────────────────────────────────────────

export const logNotWritten = (path: string, reason: string): string => `⚠ the log ${path} could not be written: ${reason}`;
export const CHAIN_ANSWERED_NOTHING = "the chain answered nothing";
export const noBranchFromPattern = (wanted: string): string =>
  `no branch name can be made from contrib.branch '${wanted}' (<prefix>/<slug>): create the work branch`;
export const backOnBranch = (name: string): string => `✓ back on ${name}, the run's branch`;
export const FILES_NOT_READ = "(files not read)";
export const notAWorkCodeBlocked = (code: string): string => `BLOCKED — '${code}' is not a work code (a folder name of the work folder)`;
export const runInProgress = (active: string, record: string, code: string): string =>
  `BLOCKED — the run of ${active} is in progress (${record}): ` +
  `take it to its close (/dev-batches ${active}), or delete that file to drop it, then /dev-batches ${code}`;
export const NO_RUN_TO_GO_ON = "no /dev-batches run to go on with: /dev-batches <code>";
export const blockedReadOnlyMode = (mode: string, code: string): string =>
  `BLOCKED — the session mode ${mode} is read-only: the batches write files and commit (/mode default, then /dev-batches ${code})`;
export const concurrencyRefused = (parallel: number): string =>
  `BLOCKED — concurrency ${parallel} refused: no batch agents on this host; run with --concurrency 1`;
export const workOutsideMounts = (folder: string): string => `BLOCKED — the work folder ${folder} is outside the mounts`;
export const noPlanUnder = (folder: string, code: string, known: string): string => `BLOCKED — no plan under ${folder}/${code}/${known}: /dev-plan first`;
export const recordNotWritten = (reason: string, code: string): string =>
  `⚠ the run record could not be written (${reason}): after a refused hop, type /dev-batches ${code}`;
export const runGoesOn = (code: string, parallel: number): string => `→ the run of ${code} goes on, ${parallel} batches at once`;
export const logUnwritableThen = (code: string): string => `${LOG_UNWRITABLE}, then /dev-batches ${code}`;
export const doneAndCommitted = (id: string): string => `✓ ${id} done and committed`;
export const notMarkedDone = (id: string): string => `⚠ ${id} is not marked done in its sheet or the plan: mark it by hand`;
export const validNotCommitted = (id: string): string =>
  `${id}: an audit since its launch says VALID, and no commit yet: its chain may still be closing it (nothing logged)`;
export const waitForChain = (close: string, code: string): string =>
  `→ wait for the chain's answer; else the close (${close}), then /dev-batches ${code} goes on`;
export const relaunchedRound = (id: string, round: number, max: number): string => `→ ${id} relaunched, audit round ${round} of ${max}: `;
export const resumeAudit = (code: string, id: string): string => `/dev-batches ${code} ${id} (no correction: its audit resumes)`;
export const humanDecidesCorrection = (rounds: number | null, command: string, code: string): string =>
  `→ a human decides: ${rounds !== null ? `${rounds} audit rounds in GAPS; ` : ""}the correction the audit names (${command}), then /dev-batches ${code} goes on`;
export const humanDecidesClose = (close: string, code: string): string =>
  `→ a human decides: the close (${close}), then /dev-batches ${code} goes on`;
export const humanDecidesAgain = (code: string, id: string): string =>
  `→ a human decides; then /dev-batches ${code} goes on (${id} again, from its sheet's ticks)`;
export const everyBatchDone = (code: string, log: string): string => `${code}: every batch is done and the run is closed (${log})`;
export const everyBatchDoneArrow = (code: string, log: string): string => `→ ${code}: every batch done, the run closed (${log})`;
export const preflightBlocked = (code: string): string => `BLOCKED — preflight: settle each ✗ above, then /dev-batches ${code}`;
export const wavesUnreadable = (code: string): string => `BLOCKED — the plan's waves could not be read, then /dev-batches ${code}`;
export const batchReviewNotRun = (id: string, reason: string, code: string): string =>
  `→ ${id} not launched: the review could not run (${reason}); /dev-batches ${code} reviews it again`;
export const NO_REVIEWER = "no reviewer on this host";
export const reviewGaps = (id: string, blocking: number, major: number): string => `review of ${id}: GAPS — ${blocking} Blocking, ${major} Major`;
export const settleBlocking = (id: string, sheet: string, code: string): string =>
  `→ ${id} not launched: settle the Blocking questions in ${sheet} (or /dev-plan), then /dev-batches ${code} launches it without a second review`;
export const detachedHead = (code: string): string =>
  `BLOCKED — branch: the checkout stands on no branch (a detached HEAD): check the work branch out, then /dev-batches ${code}`;
export const humanDecidesStops = (code: string, parallel: number): string =>
  `→ a human decides: each stop above, its worktree kept; then /dev-batches ${code} --concurrency ${parallel} goes on`;
export const nextWaveFollows = (code: string, parallel: number): string => `→ the next wave follows: /dev-batches ${code} --concurrency ${parallel}`;
export const keptByParallelRun = (next: string, path: string, code: string): string =>
  `BLOCKED — ${next} stays in ${path}, kept by a parallel run: /dev-batches ${code} --concurrency 2 relaunches it there; ` +
  `or remove it (git worktree remove --force ${path}, then git branch -D batches/${code}/${next}) to run it here`;
export const launchLine = (next: string, event: string, position: number, total: number, code: string): string =>
  `→ ${next} ${event} (${position}/${total}): /dev-batches ${code} ${next}, then its audit and its commit`;

// ── A wave (run-wave.ts) ────────────────────────────────────────────────────

export const batchAgentAnswered = (first: string): string => `BLOCKED — the batch agent answered: ${first}`;
export const worktreeKept = (path: string): string =>
  `  worktree ${path} kept: a test suite run on the checkout may find its files until it is removed (git worktree remove ${path})`;
export const stayInWorktree = (batch: string, path: string, code: string, concurrency: number, correction: string | undefined): string =>
  `→ ${batch}'s code, sheet and verdict stay in ${path}: /dev-batches ${code} --concurrency ${concurrency} relaunches it there` +
  (correction === undefined ? "" : `, its correction first (${correction})`);
export const notAWorktreeName = (name: string): string => `'${name}' is not a worktree name`;
export const branchNotOnWorktree = (branch: string, path: string, why: string): string =>
  `branch ${branch} exists but ${path} is not on it (${why}): remove the branch or check it out there`;
export const planNotMarked = (name: string, batch: string, reason: string): string => `⚠ ${name}: batch ${batch} not marked done (${reason})`;
export const BATCH_ANSWERED_NOTHING = "the batch answered nothing";
export const stateNotIgnored = (state: string): string =>
  `BLOCKED — worktree: ${state} is not ignored by git: a parallel run needs .orkeon/ ignored (.gitignore or .git/info/exclude); or run with --concurrency 1`;
export const doneBeforeStop = (batch: string, path: string): string => `${batch}: done and committed in ${path} before the run stopped`;
export const gapsRoundsHuman = (batch: string, rounds: number): string => `${batch}: ${rounds} audit rounds in GAPS, a human decides`;
export const relaunchedAfterGaps = (batch: string, path: string, round: number, max: number): string =>
  `${batch} returned GAPS: relaunched in ${path}, audit round ${round} of ${max}`;
export const NO_CORRECTION_RESUMES = " (no correction: its audit resumes)";
export const logUnwritableNotRelaunched = (batch: string): string => `${LOG_UNWRITABLE}: ${batch} not relaunched`;
export const budgetStop = (limit: number): string => `stopped BLOCKED — budget: ${limit} tool calls`;
export const IT_ANSWERED_NOTHING = "it answered nothing";
export const stoppedNoVerdict = (last: string, fails: readonly string[]): string =>
  `stopped BLOCKED — dev-verify wrote no verdict: ${last}${fails.length === 0 ? "" : ` (${fails.join("; ")})`}`;

// ── The seed and the harvest (seed-harvest.ts) ──────────────────────────────

export const workFolderOutside = (work: string): string => `the work folder '${work}' is not a folder of the checkout`;
export const memoryDirOutside = (dir: string): string => `memory.dir '${dir}' is not a folder of the checkout`;
export const notAWorkCode = (code: string): string => `'${code}' is not a work code`;
export const tooManyToSeed = (path: string, max: number): string =>
  `${path} not seeded: more than ${max} files to copy (the work folder, .orkeon/dev, the packs, memory.dir)`;
export const notBroughtBack = (batch: string, path: string, why: string): string => `⚠ ${batch}'s files not brought back from ${path}: ${why}`;
export const changedSinceSeed = (batch: string, kept: string, path: string): string =>
  `⚠ ${batch}: ${kept} changed in the checkout since the seed: kept as they are, the batch's copies left in ${path}`;

// ── The plan's close (plan-close.ts) ────────────────────────────────────────

export const BEFORE_THIS_RUN = "before this run";
export const planBatches = (prefix: string, feature: string, ids: string, plan: string, commits: string): string =>
  `${prefix} — ${feature}: batches ${ids}, ` +
  `from \`${plan}\`, one commit each (${commits}).`;
export const closeNoBranch = (code: string): string =>
  `✗ close: no current branch (a detached HEAD?): check out the work branch, then /dev-batches ${code}`;
export const closeOnDefault = (branch: string, wanted: string, work: string, code: string): string =>
  `✗ close: ${branch} is the default branch and the pack asks for a work branch (${wanted}): ` +
  `git switch ${work}, then /dev-batches ${code}`;
export const committedOnDefaultWanted = (wanted: string, branch: string): string =>
  `⚠ the pack asks for a work branch (${wanted}), but the batches are committed on ${branch}`;
export const committedOnDefault = (branch: string, push: string): string =>
  `✓ every batch is committed on ${branch}, the default branch: no pull request; pushing it is yours (${push})`;
export const onOriginAlready = (branch: string): string => `✓ ${branch} is on origin already`;
export const pushDenied = (command: string): string => `✗ not pushed: a session rule denies '${command}'; the commits stay local`;
export const runStaysOpen = (code: string, push: string): string =>
  `the run stays open: /dev-batches ${code} tries the push again; a confined shell reaches no ` +
  `remote, so push from a terminal (${push}), then /dev-batches ${code} closes the run`;
