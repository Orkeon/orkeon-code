// The text the dev commands show the user (ADR 0026): their usage, their refusals, the lines of a chain and of
// /dev-status. Read by dev.ts, dev-batches.ts, dev-implement.ts, dev-source.ts and the *.cmd.ts of commands/dev/.

// A chain of crews (dev-implement.ts, dev-batches.ts)
export const thenType = (command: string) => `then type ${command}`;
export const failedLine = (reason: string) => `✗ ${reason}`;
export const closeFollows = (command: string) => `→ the close follows: ${command}`;
/** The line a hop prints when the session's context could not be read again: the crew reads its record. */
export const CONTEXT_NOT_READ_LINE = "⚠ the session's mode could not be read again: the context read at the launch applies";
export const WRITES_FILES = "writes files";
export const WRITES_COMMITS_PUSHES = "writes files, commits and pushes";
export const CLOSE_COMMITS = "commits (the close of the batch)";
export const batchChainFailed = (error: string) => `✗ the batch's chain failed: ${error}`;
export const couldNotBeLaunched = (crew: string, reason: string, command: string) =>
  `✗ ${crew} could not be launched (${reason}): type ${command}`;

// /dev-batches
export const DEV_BATCHES_USAGE =
  "usage: /dev-batches [<code>] [--pr] [--concurrency n] | <code> F<n> [--close [--pr]] [— correction: <finding>]" +
  " | <code> F<n> --audit [fast | full | resume] [--gate-only]" +
  "   (no code: the run in progress goes on; n from 1 to 4, above 1 in bypassPermissions; with F<n>, <code> may be a <path>/<CODE>-PLAN.md)";
export const devBatchesRefusal = (text: string) => `dev-batches: ${text}`;
export const CONCURRENCY_NEEDS_NUMBER = "--concurrency needs a number";
export const namesItsBatch = (option: string) => `${option} names its batch: /dev-batches <code> F<n> ${option}`;
export const runUnknownOption = (option: string) =>
  `unknown option '${option}' (--pr, --concurrency; with F<n>: --close, --audit)`;
export const notAWorkCode = (token: string) => `'${token}' is not a work code (a folder name of the work folder)`;
export const oneCodeAtMost = (code: string, token: string) => `one code at most, not '${code}' and '${token}'`;
export const correctionNamesFinding = (command: string) => `a correction names its finding: ${command}`;
export const goesWithAudit = (token: string, batch: string) =>
  `'${token}' goes with --audit: /dev-batches <code> ${batch} --audit ${token}`;
export const batchUnknownOption = (option: string, batch: string) =>
  `unknown option '${option}' with ${batch} (--close, --pr, --audit)`;
export const onePlanAtMost = (plan: string, token: string) => `one plan at most, not '${plan}' and '${token}'`;
export const notACodeNorPlan = (token: string) => `'${token}' is neither a code nor a <CODE>-PLAN.md path`;
export const prGoesWithClose = (batch: string) =>
  `with ${batch}, --pr goes with --close (the pull request is opened at the close)`;
export const CORRECTION_OR_CLOSE = "a correction runs the batch, --close commits it: one at a time";
export const oneAuditMode = (mode: string, token: string) =>
  `one audit mode at most (fast, full or resume), not '${mode}' and '${token}'`;
export const auditUnknownOption = (option: string) => `unknown option '${option}' with --audit (only --gate-only)`;
export const namesItsBatchFirst = (typed: string) => `/${typed} names its batch first: F<n>, e.g. F2`;
export const correctionNamesBatch = (command: string) => `a correction names its batch: ${command}`;
export const oneBatchAtMost = (batch: string, other: string) => `one batch at most, not ${batch} and ${other}`;
export const concurrencyNotWithBatch = (batch: string) =>
  `--concurrency runs a plan's batches: it does not go with ${batch}`;
export const AUDIT_OR_CORRECTION = "--audit judges the batch, a correction runs it: one at a time";
export const CHAIN_FAILED_THEN = "then type /dev-batches: the run goes on from the first batch not done";
export const batchesChainFailed = (crew: string, error: string) => `✗ the dev-batches chain failed (${crew}): ${error}`;
export const A_CREW = "a crew";
export const batchesChainStopped = (reason: string) => `✗ the dev-batches chain stopped (${reason}): ${CHAIN_FAILED_THEN}`;
export const chainNotKept = (reason: string) =>
  `dev-batches: the session could not keep which chain runs (${reason}): nothing was launched`;
export const auditFailed = (error: string) => `✗ the audit failed: ${error}`;

// /dev-spec and /dev-change
export const DEV_SPEC_USAGE =
  'usage: /dev-spec <code> [bug | refactor | perf] [--run "<command>"] [<brief text> | <path>.md | <#issue> | <revision request>]';
/** Why --run needs a kind, said where it is refused. */
export const RUN_NEEDS_KIND =
  "--run goes with a kind: bug (the command that reproduces it) or perf (the command that measures it); a feature is a spec and runs nothing";
export const withUsage = (text: string, usage: string) => `${text}\n${usage}`;
export const notASpecCode = (word: string) => `'${word}' is not a code (letters, digits, '.', '_', '-')`;
export const unknownOption = (word: string) => `unknown option ${word}`;
export const RUN_NEEDS_COMMAND = "--run needs the command, quoted";
export const RUN_BEFORE_TEXT = "--run comes before the text";

// /dev-status
export const DEV_STATUS_USAGE = "usage: /dev-status [<code>]";
export const NOT_IN_THE_PLAN = "not in the plan";
export const NO_VERDICT = "no verdict";
export const NO_SHEET = "no sheet";
export const workFolderLine = (label: string) => `work folder: ${label}`;
export const packLine = (shown: string) => `pack: ${shown}`;
export const warningLine = (warning: string) => `warning: ${warning}`;
export const moreWarnings = (count: number) => `… ${count} more warnings`;
export const sheetOpenTicks = (id: string, red: number, steps: number) =>
  `${id} is done in the plan but its sheet has open ticks (RED ${red}/${steps})`;
export const validButOpen = (id: string) => `${id} is VALID but the plan still says open`;
export const noBatchLine = (name: string) => `${name} has no batch line in the plan`;
export const planLine = (name: string, feature: string, batches: number, done: number) =>
  `plan ${name}${feature} (${batches} batches, ${done} done)`;
export const moreBatches = (count: number, first: string, last: string) => `… ${count} more batches (${first} to ${last})`;
export const noCodeUnder = (folder: string) =>
  `no code under ${folder}/ (a code is a folder holding SPEC-, CHANGE- or *-PLAN.md files)`;
export const moreFoldersNotProbed = (count: number) => `… ${count} more folders not probed`;
export const notAStatusCode = (code: string) =>
  `dev-status: '${code}' is not a code: letters, digits, '.', '_' and '-', starting with a letter or a digit`;
export const workFolderInMainWorktree = (folder: string) =>
  `dev-status: the work folder ${folder} is in the main worktree, outside the mounts: run /dev-status from the main checkout`;
export const cannotBeListed = (folder: string, reason: string) => `dev-status: ${folder}/ cannot be listed (${reason})`;
export const holdsNoDevFile = (folder: string, code: string) =>
  `dev-status: ${folder}/${code}/ holds no SPEC-, CHANGE- or *-PLAN.md file`;
export const codesHere = (codes: string) => `codes here: ${codes}`;
export const NO_CODE_HERE = "no code here";
export const noFolder = (folder: string, code: string, here: string) => `dev-status: no folder ${folder}/${code}/ (${here})`;

// /dev-learn
export const DEV_LEARN_USAGE = "usage: /dev-learn [<axis>] [--list] | --accept <id>[,<id>…] | --refuse <id | motif text>";
export const ACCEPT_REFUSE_ALONE = "dev-learn: --accept and --refuse each come alone";
export const notAProposalId = (piece: string) =>
  `dev-learn: '${piece}' is not a proposal id (8 or 10 hex digits, from PROPOSALS.md)`;
export const ACCEPT_NEEDS_ID = "dev-learn: --accept needs at least one proposal id, e.g. --accept 3f2a9c1e";
export const REFUSE_NEEDS_TARGET = "dev-learn: --refuse needs a proposal id or the motif's words";
export const REFUSED_MOTIF_TOO_LONG = "dev-learn: a refused motif is at most 200 characters";
export const learnUnknownOption = (token: string) => `dev-learn: unknown option '${token}' (--list, --accept, --refuse)`;
export const oneAxisAtMost = (axis: string, token: string) => `dev-learn: one axis at most, not '${axis}' and '${token}'`;
export const notAnAxis = (token: string) => `dev-learn: '${token}' is not an axis`;

// /dev-plan
export const DEV_PLAN_USAGE = "usage: /dev-plan [<code> | <path>/SPEC-<code>.md | <path>/CHANGE-<code>.md] [--replace]";
export const REPLACE_ONCE = "dev-plan: --replace once at most";
export const planUnknownOption = (token: string) => `dev-plan: unknown option '${token}' (only --replace)`;
export const oneSourceAtMost = (source: string, token: string) =>
  `dev-plan: one source at most, not '${source}' and '${token}'`;
export const notACodeNorSource = (token: string) =>
  `dev-plan: '${token}' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path`;
