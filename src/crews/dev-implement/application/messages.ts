// The lines /dev-implement shows: its status and report lines, its BLOCKED reasons and the headers of its logs
// (ADR 0026).

// ── The run (run-dev-implement.ts) ──────────────────────────────────────────

export const blockedLine = (line: string): string => `BLOCKED — ${line}`;
export const sheetNotWritten = (reason: string): string => `the sheet could not be written: ${reason}`;
export const assumptionsWritten = (added: readonly string[]): string =>
  `assumption${added.length === 1 ? "" : "s"} written to ## Assumptions, to be validated by the user: ${added.join("; ")}`;
export const assumptionsNotWritten = (failed: string, added: readonly string[]): string =>
  `⚠ assumptions not written (${failed}): ${added.join("; ")}`;
export const SHEET_PUT_BACK = "the sheet was changed by the role, and put back";
export const sheetNotPutBack = (reason: string): string => `the sheet was changed by the role and could not be put back: ${reason}`;
export const roleChangedPlanFolder = (role: string, paths: string, putBack: string | null): string =>
  `${role} changed the plan folder (${paths}): the sheet and the plan are code's own${putBack === null ? "" : `; ${putBack}`}`;
export const whitespaceFixed = (path: string, fixed: readonly string[]): string => `whitespace ✓ — ${path}: ${fixed.join(", ")}`;
export const whitespaceNotWritten = (path: string, fixed: readonly string[], reason: string): string =>
  `⚠ whitespace — ${path}: ${fixed.join(", ")}, not written (${reason})`;
export const NO_PRODUCTION_CHANGED = "measured: not computed — no production file changed in this run";
export const costNotComputed = (reason: string): string => `measured: not computed — ${reason}`;
export const costFlagged = (costLine: string, flagged: readonly string[]): string =>
  `measured ${costLine}; flagged: ${flagged.join("; ")} — back to /dev-plan (the design names the access, the code cannot move it)`;
export const costMeasured = (costLine: string): string => `measured: ${costLine}`;

// ── A cycle ─────────────────────────────────────────────────────────────────

export const stepActProblem = (step: number, act: string, problem: string): string => `step ${step} ${act}: ${problem}`;
export const FAILURE_NOT_CHECKED = " (its own failure not checked: the run's tail shows no failure count)";
export const redDone = (step: number, tests: string, stubs: readonly string[], unchecked: string): string =>
  `step ${step} RED ✓ — ${tests}${stubs.length === 0 ? "" : ` (stubs: ${stubs.join(", ")})`}${unchecked}`;
export const notRun = (refused: string): string => `(not run: ${refused})`;
export const NO_FILE_CHANGED = "no file changed";
export const greenDone = (label: string, changed: string): string => `${label} GREEN ✓ — ${changed || NO_FILE_CHANGED}`;
export const costDone = (label: string, cost: string, measured: string): string => `${label} COST ✓ — ${cost}; ${measured}`;
export const shownLog = (path: string): string => ` (log: ${path})`;

// ── Restore ─────────────────────────────────────────────────────────────────

export const restoreRefused = (refusal: string): string => `restore: ${refusal}`;
export const restoreCouldNotRun = (command: string, reason: string): string => `restore: '${command}' could not run: ${reason}`;
export const restoreNoVerdict = (seconds: number): string => `still running after ${seconds} s: no verdict`;
export const restoreStillRunning = (command: string, seconds: number): string => `restore: '${command}' still running after ${seconds} s`;
export const restoreExited = (command: string, exit: number, log: string): string => `restore: '${command}' exited ${exit}${log}`;
export const restored = (command: string): string => `restored once: ${command}`;

// ── The index, the build and the suites ─────────────────────────────────────

export const indexNotIndexed = (root: string): string => `index: not refreshed — ${root} is not indexed`;
export const indexReindexFailed = (reason: string): string => `index: not refreshed — incremental_reindex: ${reason}`;
export const indexNotRefreshed = (reason: string): string => `index: not refreshed — ${reason}`;
export const indexRefreshed = (count: number, batch: string | undefined): string =>
  `index: ${count} file${count === 1 ? "" : "s"} of ${batch} refreshed`;
export const graphNotRead = (reason: string): string => `affected tests: the graph was not read — ${reason}; the sheet's projects alone`;
export const BUILD_NOT_RUN = "build: not run — the pack has no commands.build";
export const buildRefused = (refusal: string): string => `build: ${refusal}`;
export const buildStillRunning = (seconds: number, log: string): string => `build still running after ${seconds} s${log}`;
export const buildExited = (command: string, exit: number, log: string, tail: string): string => `build: '${command}' exited ${exit}${log}\n${tail}`;
export const RUN_BLOCKING = " (run blocking)";
export const buildDone = (command: string, blocking: boolean, log: string): string =>
  `build ✓ — ${command}${blocking ? RUN_BLOCKING : ""}${log}`;
export const graphProjectsLeftOut = (leftOut: readonly string[]): string =>
  `affected tests: the graph's projects left out, no command can be named for them — ${leftOut.join("; ")}`;
export const affectedRefused = (refusal: string): string => `affected tests: ${refusal}`;
export const affectedStillRunning = (seconds: number, log: string): string => `affected tests still running after ${seconds} s${log}`;
export const affectedExited = (command: string, exit: number, log: string, tail: string): string =>
  `affected tests: '${command}' exited ${exit}${log}\n${tail}`;
export const graphAdded = (projects: readonly string[], classes: number): string =>
  `; the graph added ${projects.length === 0 ? "no project" : projects.join(", ")}${classes === 0 ? "" : ` (${classes} test class${classes === 1 ? "" : "es"} reached)`}`;
export const affectedDone = (commands: readonly string[], batch: string | undefined, byGraph: string, log: string): string =>
  `affected tests ✓ — ${commands.join("; ")} (the whole suite went green once for ${batch}${byGraph})${log}`;
export const TEST_NOT_RUN = "test: not run — the pack has no commands.test";
export const testRefused = (refusal: string): string => `test: ${refusal}`;
export const testStillRunning = (seconds: number, log: string): string => `test still running after ${seconds} s${log}`;
export const testExited = (command: string, exit: number, log: string, tail: string): string => `test: '${command}' exited ${exit}${log}\n${tail}`;
export const wholeSuiteUnplaced = (paths: string): string => ` (the whole suite again: the graph could not place ${paths})`;
export const WHOLE_SUITE_EVERY_TEST = " (the whole suite again: the graph reaches every test from these changes)";
export const WHOLE_SUITE_NO_TEST_PROJECT = " (the whole suite again: the pack has no commands.test_project)";
export const testDone = (command: string, blocking: boolean, again: string, log: string): string =>
  `test ✓ — ${command}${blocking ? RUN_BLOCKING : ""}${again}${log}`;
export const andMore = (shown: string, more: number): string => `${shown} and ${more} more`;

// ── The launch ──────────────────────────────────────────────────────────────

export const batchIsFn = (batch: string): string => `the batch is F<n>, e.g. /dev-batches <code> F1: got '${batch}'`;
export const readOnlyMode = (mode: string): string =>
  `the session mode ${mode} is read-only: /dev-batches writes files and commits (/mode default, then run it again)`;
export const NO_REPOSITORY_PACK = "no repository pack (.orkeon/repo.yaml): its layout and commands drive the steps";
export const workFolderOutsideMounts = (folder: string): string => `the work folder ${folder} is outside the mounts`;
export const readOnlyModeAtClose = (mode: string, rerun: string): string =>
  `the session mode ${mode} (read at the launch) is read-only: the close commits (/mode default, then ${rerun})`;
export const notPushedInRun = (code: string): string =>
  `not pushed: /dev-batches ${code} is in progress, its close pushes the plan's branch once`;
export const NO_TEST_LAYOUT = "the pack gives neither layout.tests nor layout.test_files: code cannot tell a test file from a production one";
export const cannotBeRead = (path: string, reason: string): string => `${path} cannot be read: ${reason}`;
export const correctionProblem = (reason: string): string => `correction: ${reason}`;
export const correctionAppended = (sheet: string, step: number, title: string): string =>
  `correction appended to ${sheet} as step ${step} — ${title}`;
export const correctionStillOpen = (step: number, title: string): string =>
  `correction still open as step ${step} — ${title}: run again, nothing appended`;
export const gapsRoundsWarned = (rounds: number): string => `⚠ ${rounds} audit rounds in GAPS: the third still GAPS goes to a human`;
export const sheetMalformed = (problems: readonly string[]): string => `the sheet is malformed: ${problems.join("; ")}`;
export const runTitle = (batch: string, code: string, sheet: string): string => `dev-implement ${batch} (${code}): ${sheet}`;
export const batchGreen = (batch: string, audit: string): string =>
  `→ Batch ${batch}: every step ticked, the build and the tests green. The audit follows: ${audit}`;

// ── Finding the sheet (locate-sheet.ts) ─────────────────────────────────────

export const severalSheets = (batch: string, paths: string): string =>
  `several sheets for ${batch}: ${paths}: name the plan, e.g. /dev-batches <code> ${batch}`;
export const noSheetUnder = (work: string, batch: string): string =>
  `no ${work}/*/*-PLAN-${batch}.md: name the plan, e.g. /dev-batches <code> ${batch}`;
export const planHoldsNoSheet = (folder: string, batch: string): string => `${folder}/ holds no *-PLAN-${batch}.md`;
export const neitherCodeNorPlan = (plan: string): string => `'${plan}' is neither a code nor a <CODE>-PLAN.md path`;
export const noSheetBeside = (sheet: string, plan: string): string => `no ${sheet} beside ${plan}`;

// ── The tree (observe.ts) ───────────────────────────────────────────────────

export const statusCouldNotRun = (command: string, reason: string): string => `${command} could not run: ${reason}`;
export const statusExited = (command: string, exit: number): string => `${command} exited ${exit}`;

// ── The suite jobs (suite-job.ts) ───────────────────────────────────────────

export const noVerdict = (why: string, exit: number): string => `${why}: no verdict (exit=${exit} below)`;
export const runBlocking = (why: string): string => `run blocking (${why}): the runtime cuts a result at 32 000 characters`;
export const stillRunningNoVerdict = (seconds: number, exit: number): string =>
  `still running after ${seconds} s: no verdict (exit=${exit} below)`;
export const CODE_CANNOT_WAIT = "code cannot wait here";
export const jobDidNotStart = (reason: string): string => `the job did not start: ${reason}`;
export const jobCouldNotBeRead = (id: string, reason: string): string => `job ${id} could not be read: ${reason}`;
export const jobCannotBeRead = (id: string, reason: string): string => `job ${id} cannot be read: ${reason}`;
export const tailNotRead = (reason: string): string => `(the tail could not be read: ${reason})`;
export const jobLogHeader = (id: string, log: string, lines: number): string =>
  `job ${id}, its whole log at ${log} (the run's own); the last ${lines} lines follow`;
export const jobStillRunning = (id: string, seconds: number, exit: number, log: string): string =>
  `job ${id} still running after ${seconds} s: no verdict (exit=${exit} below); its log at ${log}`;
export const lostWaitOnJob = (id: string): string => `code could no longer wait on job ${id}`;

// ── The close (close.ts) ────────────────────────────────────────────────────

export const notAudited = (verdictPath: string, audit: string): string =>
  `BLOCKED — close: no ${verdictPath}: the batch is audited first (${audit})`;
export const notValid = (verdictName: string, verdict: string): string =>
  `BLOCKED — close: the last verdict of ${verdictName} is ${verdict}, not VALID: nothing is committed`;
export const noFileRecorded = (batch: string, code: string): string =>
  `BLOCKED — close: no file recorded for ${batch} (.orkeon/dev/${code}/implement-${batch}.json): commit the batch with /commit <files>`;
export const verdictNotRewritten = (verdictName: string, batch: string, audit: string): string =>
  `BLOCKED — close: ${verdictName} was not written since the last run of ${batch} changed the batch: audit it again (${audit})`;
export const sheetUnreadableAtClose = (sheet: string): string => `BLOCKED — close: ${sheet} cannot be read: nothing is committed`;
export const tddBoxOpen = (steps: string, sheet: string, code: string, batch: string): string =>
  `BLOCKED — close: step ${steps} of ${sheet} still has a TDD box open: /dev-batches ${code} ${batch} first`;
export const NO_CURRENT_BRANCH = "BLOCKED — close: no current branch (a detached HEAD?): check out the work branch, then ";
export const defaultBranchAsksWorkBranch = (branch: string, wanted: string, reason: string, rerun: string): string =>
  `BLOCKED — close: ${branch} is the default branch and the pack asks for a work branch (${wanted}): ${reason}, then ${rerun}`;
export const branchCreated = (branch: string, from: string, pattern: string): string =>
  `✓ branch ${branch} created from ${from} (contrib.branch ${pattern})`;
export const noBranchName = (pattern: string): string => `no branch name can be made from '${pattern}' (<prefix>/<slug>): create it`;
export const branchExists = (name: string): string => `the branch ${name} exists already: switch to it (git switch ${name})`;
export const switchFailed = (name: string, reason: string): string => `git switch -c ${name} failed (${reason}): create it`;
export const sheetMarkedDone = (sheet: string, today: string): string => `✓ ${sheet} marked done (${today})`;
export const sheetNotMarkedDone = (sheet: string, reason: string): string => `⚠ ${sheet} could not be marked done: ${reason}`;
export const planBatchMarkedDone = (plan: string, batch: string): string => `✓ ${plan}: batch ${batch} marked done`;
export const planNotFound = (plan: string, batch: string): string =>
  `⚠ ${plan} not found beside the sheet: its batch ${batch} is not marked done`;
