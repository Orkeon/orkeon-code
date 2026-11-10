// The text the dev services show the user: refusals of a step, warnings, preflight and close lines, the decisions of
// /dev-learn.

// brief-inventory.ts
export const indexUnavailable = (reason: string): string => `the code index is not available (${reason}): the draft has no inventory`;
export const searchFailed = (phrase: string, reason: string): string => `search failed for '${phrase}': ${reason}`;
export const inventoryLine = (entries: number, calls: number, cache: string): string =>
  `inventory: ${entries} entries (${calls} index calls${cache})`;

// close-batch.ts
export const gitStatusFailedLine = (reason: string): string => `✗ git status failed: ${reason}`;
export const leftOutWorkFolder = (paths: string): string => `left out (the work folder is never committed): ${paths}`;
export const noChangeToCommit = (paths: string): string => `no change to commit: ${paths}`;
export const notCommittedUnsafe = (paths: string): string => `✗ not committed: ${paths} cannot go through the shell; commit by hand`;
export const NOTHING_TO_COMMIT_LINE = "✗ nothing to commit";
export const pushDeniedByRule = (command: string): string => `✗ not pushed: a session rule denies '${command}'; the commit stays local`;
export const pushedToOrigin = (branch: string): string => `✓ pushed ${branch} to origin`;

// find-repo-pack.ts
export const packUnreadable = (path: string, reason: string): string => `${path} cannot be read (${reason}): no repository pack is used`;
export const packIgnored = (error: string): string => `${error}: the repository pack is ignored`;
export const severalPacks = (packs: string, path: string): string => `several repository packs are deployed (${packs}): ${path} is read`;

// learn-decision.ts
export const cannotBeListed = (folder: string, reason: string): string => `${folder}/ cannot be listed (${reason})`;
export const cannotBeRead = (path: string, reason: string): string => `${path} cannot be read (${reason})`;
export const axisDone = (axis: string, count: number): string => `axis ${axis} done: ${count} gaps marked treated`;
export const learnStateUnreadable = (file: string, reason: string): string =>
  `dev-learn: ${file} cannot be read (${reason}): fix or delete it; nothing was written`;
export const learnStateInvalid = (problem: string): string => `dev-learn: ${problem}: fix or delete it; nothing was written`;
export const learnBlockedNotWritten = (file: string, reason: string): string => `dev-learn: BLOCKED — ${file} cannot be written (${reason})`;
export const noProposal = (id: string, folder: string): string => `dev-learn: no proposal ${id} in the 10 newest ${folder}/learn-*/ folders`;
export const learnStateLine = (file: string, treated: number): string => `state: ${file} — ${treated} gaps treated in all`;
export const alreadyDecided = (id: string, decision: string, date: string): string => `${id} was already ${decision} on ${date}`;
export const refusedUnreadable = (file: string, reason: string): string => `dev-learn: ${file} cannot be read (${reason}): nothing was written`;
export const alreadyRefused = (topic: string, date: string): string => `${topic} was already refused on ${date}`;
export const refusedLine = (topic: string, file: string): string => `refused: ${topic} — left out of future proposals (${file})`;
export const refuseByWords = (notFound: string): string => `${notFound} (to refuse a motif by its words, write more than an id)`;
export const learnOutsideMounts = (folder: string): string =>
  `dev-learn: the work folder ${folder} is in the main worktree, outside the mounts: run /dev-learn from the main checkout`;
export const learnNoWorkFolder = (folder: string): string => `dev-learn: no work folder ${folder}/: nothing to learn from`;

// load-dev-context.ts
export const workDirUnreadable = (key: string, reason: string): string =>
  `${key} could not be read (${reason}): the pack or the default decides`;
export const notIgnoredByGit = (path: string): string => `${path} is not ignored by git: add it to .gitignore (Orkeon Code never edits it)`;
export const TODO_HOLDS_HARNESS_WORK =
  "todo/ holds harness artefacts and nothing names workbench/: set layout.work: workbench in the pack, " +
  "or HARNESS_WORK_DIR=workbench in .claude/settings.local.json env (W-01)";
export const severalPlans = (shown: string, names: string, chosen: string): string => `several plans in ${shown}/: ${names}: ${chosen} is read`;

// plan-source.ts
export const bothSpecAndChange = (shown: string, code: string): string =>
  `dev-plan: ${shown}/ holds both SPEC-${code}.md and CHANGE-${code}.md: name the file`;
export const neitherSpecNorChange = (shown: string, code: string): string => `dev-plan: ${shown}/ holds no SPEC-${code}.md nor CHANGE-${code}.md`;
export const notASource = (token: string): string => `dev-plan: '${token}' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path`;
export const SOURCE_UNDER_CLAUDE = "dev-plan: a source under .claude/ is the harness's own: copy it to the work folder first";
export const planOutsideWorkspace = (folder: string, workspace: string): string =>
  `dev-plan: the work folder ${folder} is outside ${workspace}: run /dev-plan from the main worktree`;
export const noSourceToPlan = (folder: string): string =>
  `dev-plan: no SPEC- or CHANGE- file without a plan in ${folder}/: name one, e.g. /dev-plan <code>`;
export const severalCodes = (codes: string, first: string): string =>
  `dev-plan: several codes could be planned (${codes}): name one, e.g. /dev-plan ${first}`;
export const planSourceUnreadable = (path: string, reason: string): string => `dev-plan: ${path} cannot be read (${reason})`;

// preflight.ts
export const PLAN_NONE = "plan: none in the code's folder: /dev-plan first";
export const noSheetFor = (batches: string): string => `sheets: no sheet for ${batches}`;
export const SHEETS_OK = "preflight ✓ sheets: one for every batch not done";
export const identityMissing = (detail: string): string =>
  `git identity: ${detail} (each batch's close commits): git config user.name and user.email in the repository ` +
  "(a confined shell reads no --global file)";
export const identityOk = (name: string, email: string): string => `preflight ✓ git identity: ${name} <${email}>`;
export const BRANCH_NONE = "branch: none checked out (a detached HEAD?): check out the work branch";
export const changesOutsideWorkFolder = (count: number, paths: string): string =>
  `preflight ⚠ tree: ${count} change(s) outside the work folder (${paths}): a close commits only its batch's files`;

// question-round.ts, settle-questions.ts
export const REWRITE_REFUSED = "the rewrite was refused";
export const decisionsNotFolded = (problem: string): string =>
  `the body does not say the decisions yet (${problem}); ` +
  "they are recorded under Decisions";
export const EMPTY_ANSWER_LEAVES_OPEN = "\n(an empty answer leaves the questions in the file)";

// resolve-work-folder.ts
export const notARelativeFolder = (source: string, value: string, reason: string, fallback: string): string =>
  `${source} '${value}' is not a relative folder of the checkout (${reason}): ${fallback}/ applies`;
export const absentFromCheckout = (source: string, value: string, fallback: string): string =>
  `${source} '${value}' is absent from the checkout: ${fallback}/ applies`;
export const linkedWorktreeNote = (folder: string): string =>
  `this checkout is a linked worktree: the work folder is the main worktree's ${folder}`;

// source-review.ts
export const reviewNotRun = (reason: string): string => `review: not run (${reason})`;
export const addedAsOpenQuestions = (count: number): string => `, ${count} added as open questions`;
export const reviewCounts = (verdict: string, blocking: number, major: number, kept: string): string =>
  `review: ${verdict} — ${blocking} Blocking, ${major} Major${kept}`;

// source-step.ts
export const invalidCode = (step: string): string => `${step}: invalid crew input: code`;
export const invalidInput = (step: string, name: string): string => `${step}: invalid crew input: ${name}`;
export const NO_WORK_TREE = "no work tree";
export const runFromCheckout = (step: string, workspace: string, top: string): string =>
  `${step}: run from the checkout at ${workspace} (git reports ${top})`;
export const workFolderOutsideMounts = (step: string, folder: string): string =>
  `${step}: the work folder ${folder} is outside the checkout's mounts: run from the main worktree`;
export const outsideCheckout = (step: string, request: string, workspace: string): string =>
  `${step}: ${request} is outside the checkout: give a path under ${workspace}`;
export const stepCannotRead = (step: string, path: string, reason: string): string => `${step}: ${path} cannot be read (${reason})`;
export const titleDoesNotReadCode = (code: string): string => `the title does not read the code ${code}`;
export const idsReadBack = (read: string, expected: string): string => `the ids read back are ${read}, not ${expected}`;
export const openQuestionsReadBack = (read: number, written: number): string => `${read} open questions read back, ${written} written`;
export const DECISIONS_DO_NOT_READ_BACK = "the decisions do not read back";

// step-precedents.ts, tool-call-policy.ts, tool-callbacks.ts
export const recallFailed = (trigger: string, reason: string): string => `shared memory: recall ${trigger} failed, no precedents (${reason})`;
export const relativePathResolved = (step: string, tool: string): string => `${step}: ${tool}: a relative path resolved under the checkout`;
export const mountCheckRefusedPreHook = (step: string, n: number, tool: string): string =>
  `${step}: the runtime's mount check refused pre-tool hook #${n} for ${tool}`;
export const preHookRefused = (step: string, n: number, tool: string): string => `${step}: pre-tool hook #${n} refused ${tool}`;
export const postHooksFailed = (step: string, count: number, tool: string): string =>
  `${step}: ${count} post-tool hook(s) failed after ${tool}`;

// verdict-sources.ts
export const folderListsTooMany = (folder: string, cap: number): string =>
  `${folder}/ lists ${cap} entries or more: later files are not read`;
export const workListsTooMany = (folder: string, cap: number): string =>
  `${folder}/ lists ${cap} entries or more: later folders are not read`;

// wrapped-tools.ts
export const restoreNotRun = (reason: string): string => `restore not run: ${reason}`;
