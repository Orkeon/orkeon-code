// The text dev-verify's use case shows the user: the gate's refusals, the audit's outcomes and BLOCKED lines, the
// capture's notes, and the lines of the run.

// ── The gate ────────────────────────────────────────────────────────────────

export const gateCouldNotRun = (command: string, why: string): string => `the gate could not run '${command}': ${why}`;
export const gateExit = (command: string, exit: number, why: string): string =>
  `the gate could not run '${command}': exit ${exit}${why === "" ? "" : ` (${why})`}`;
export const outputCutByRuntime = (command: string, omitted: number): string =>
  `the output of '${command}' was cut by the runtime (${omitted} characters omitted): the list is incomplete, run the gate again on a smaller change`;
export const planFileNotRead = (name: string, max: number): string =>
  `plan folder: ${name} not read (beyond the first ${max} .md files, *-PLAN*.md first)`;
export const sheetUnreadable = (sheet: string, why: string): string => `the sheet ${sheet} cannot be read (${why})`;

// ── The audit ───────────────────────────────────────────────────────────────

export const validationsAlreadyRan = (max: number): string => `refused: ${max} validations already ran in this audit`;
export const refusedOutcome = (reason: string | null): string => `refused: ${reason}`;
export const notRunOutcome = (reason: string): string => `not run: ${reason}`;
export const notRunLine = (command: string, outcome: string): string => `\`${command}\` — ${outcome}`;
export const validationRed = (outcome: string, counted: string): string => `a validation is red: ${outcome}${counted}`;
export const runByTheAudit = (command: string, outcome: string, counted: string): string =>
  `\`${command}\` ${outcome}${counted}, run by the audit`;
export const MAKE_VALIDATION_PASS = "make the validation pass";
export const failedCount = (failed: number): string => `, ${failed} failed`;
export const NO_PROBLEM_RECORDED = "no problem recorded";
export const blockedUnwritable = (path: string, why: string): string => `dev-verify: BLOCKED — ${path} cannot be written (${why})`;
export const blockedUnparsable = (first: string, replies: string): string =>
  `dev-verify: BLOCKED — the auditor's answer did not parse after one re-ask (${first}): ` +
  `its replies are in ${replies}; no verdict written`;
export const noVerdictWritten = (failed: string): string => `${failed}; no verdict written`;
export const blockedBudgetSpent = (spent: string, first: string, capture: string): string =>
  `dev-verify: BLOCKED — the step's budget is spent (${spent}: ${first}): the capture stays in ${capture}/`;
export const blockedCancelled = (first: string, capture: string): string =>
  `dev-verify: BLOCKED — the audit was cancelled (${first}): the capture stays in ${capture}/; no verdict written`;
export const blockedModelFailed = (first: string, capture: string): string =>
  `dev-verify: BLOCKED — the model call failed (${first}): the capture stays in ${capture}/; no verdict written`;
export const blockedOther = (first: string): string => `dev-verify: BLOCKED — ${first}; no verdict written`;
export const namedAfterValidations = (command: string): string => `\`${command}\` — named after the validations had run`;

// ── The capture ─────────────────────────────────────────────────────────────

export const commandFailed = (command: string, why: string): string => `not captured: '${command}' failed (${why})`;
export const diffBeyondFirst = (path: string, max: number): string => `${path} → no diff captured (beyond the first ${max} files)`;
export const diffQuoteInPath = (path: string): string => `${path} → no diff captured (a quote in the path)`;
export const diffFailed = (path: string, command: string, why: string): string =>
  `${path} → no diff captured ('${command}' failed (${why}))`;
export const cutByRuntime = (omitted: number): string => ` (cut by the runtime, ${omitted} characters omitted)`;
export const logMissing = (log: string): string => `log missing or empty: ${log}`;
export const LOG_HOLDS_ERROR = "the log holds an error";
export const CANNOT_COMPARE_DATES = "the shell cannot compare dates: more than 200 files, or a path the shell cannot quote";
export const cannotCompareDates = (why: string): string => `the shell cannot compare dates: ${why}`;
export const changedAfter = (paths: string): string => `changed after it:${paths}`;
export const BUILD_NOT_RUN = "not run — the pack has no commands.build";
export const buildReusedLine = (log: string): string =>
  `exit: 0 (reused ${log}: ends green, no changed file newer — one build per batch)`;
export const logNotReused = (why: string): string => `log not reused (${why}): built again`;
export const buildTimedOut = (seconds: number): string => `exit: none — timed out after ${seconds} s`;
export const buildRefused = (message: string): string => `not run — the shell refused it: ${message}`;
export const testLogEmpty = (log: string): string => `missing or empty: ${log}`;
export const noTestLog = (first: string, second: string): string => `no test log: neither ${first} nor ${second}`;
export const NO_TEST_ROOT_GIVEN = "no test root given";
export const NOT_A_PLAIN_WORD = "not searched (the name is not a plain word)";
export const cutAtFiles = (max: number): string => `[cut at ${max} files]`;
export const NO_CHANGED_SOURCE = "no changed source file";
export const NO_CHANGED_FILE = "no changed file";
export const captureTitle = (batch: string): string => `# Audit capture — batch ${batch}`;

// ── The run ─────────────────────────────────────────────────────────────────

export const auditAgainFix = (command: string): string =>
  `audit the batch again (${command}), or split it if it spends the budget again`;
export const BATCH_INPUT = "dev-verify: the input batch must be F<n>, e.g. F2";
export const PLAN_INPUT = "dev-verify: the input plan must be a code or a <CODE>-PLAN.md path";
export const MODE_INPUT = "dev-verify: the input mode must be fast, full or resume";
export const GATE_ONLY_INPUT = "dev-verify: the input gateOnly must be true or false";
export const severalSheets = (batch: string, sheets: string, command: string): string =>
  `dev-verify: several sheets for ${batch}: ${sheets}: ` +
  `name the plan, e.g. ${command}`;
export const noSheetInWork = (work: string, batch: string, command: string): string =>
  `dev-verify: no ${work}/*/*-PLAN-${batch}.md: name the plan, e.g. ${command}`;
export const neitherCodeNorPlan = (plan: string): string => `dev-verify: '${plan}' is neither a code nor a <CODE>-PLAN.md path`;
export const noSheetInPlan = (work: string, plan: string, batch: string): string =>
  `dev-verify: ${work}/${plan}/ holds no *-PLAN-${batch}.md`;
export const notUnderWork = (plan: string, work: string): string => `dev-verify: '${plan}' is not under the work folder ${work}/`;
export const noSheetBeside = (sheet: string, plan: string): string => `dev-verify: no ${sheet} beside ${plan}`;
export const NO_TEST_COMMAND = "commands.test — the pack has none";
export const suiteNotRun = (command: string, why: string): string => `\`${command}\` — not run: ${why}`;
export const suiteTimedOut = (seconds: number): string => `the whole fast suite did not finish within ${seconds} s`;
export const runByFullAudit = (command: string, outcome: string): string => `\`${command}\` ${outcome}, run by the full audit`;
export const SUITE_TIMEOUT_FIX = "make the suite finish within its timeout, or run it by hand and record the outcome";
export const NO_EXIT_CODE_REPORTED = "no exit code reported";
export const suiteRed = (exitText: string, counted: string): string => `the whole fast suite is red: ${exitText}${counted}`;
export const MAKE_SUITE_GREEN = "make the suite green";
export const wholeSuite = (exitText: string): string => `whole fast suite — ${exitText}`;
export const NOT_IN_WORK_TREE = "dev-verify: not inside a git work tree";
export const wrongWorkTree = (top: string, workspace: string): string =>
  `dev-verify: the git work tree is ${top}, not ${workspace}: run Orkeon Code at the top of the repository`;
export const workInMainWorktree = (work: string): string =>
  `dev-verify: the work folder ${work} is in the main worktree, outside the mounts: run the audit from the main checkout`;
export const runHeader = (batch: string, sheet: string, mode: string, work: string): string =>
  `batch ${batch} — sheet ${sheet} — mode ${mode} — work folder ${work}`;
export const resumeNeeds = (verdict: string, command: string): string => `dev-verify: resume needs ${verdict}: run ${command} first`;
export const RESUME_WHOLE_BATCH = "resume: no audit of this batch finished — the whole batch is audited (fast), the section appended";
export const resumeEarlierGaps = (when: string): string =>
  `resume: the last audit did not finish — the gaps of the audit of ${when} are resumed`;
export const GATE_ONLY_DONE = "dev-verify: --gate-only: the gate alone, no capture and no audit";
export const writtenUnfinished = (verdict: string, path: string): string =>
  `dev-verify: ${verdict} written to ${path} (the audit did not finish)`;
export const unfinishedTail = (text: string, verdict: string, path: string): string =>
  `${text}; ${verdict} written to ${path}: the audit did not finish`;
export const auditorDisagrees = (said: string, made: string): string => `the auditor said ${said}; the rows make it ${made}`;
export const verdictWritten = (verdict: string, path: string): string => `dev-verify: ${verdict} written to ${path}`;
export const batchValid = (batch: string): string =>
  `→ Batch ${batch} VALID. The close commits the batch's files (run by itself when /dev-batches launched this audit):`;
export const gapAppended = (command: string): string =>
  `  it appends the gap to the sheet as a new step and runs it; the audit follows by itself (${command})`;
