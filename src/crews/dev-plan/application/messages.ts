// The messages of /dev-plan: its refusals, the warnings and log lines of its inventory, the lines of its end
// message, and the words of its crew (ADR 0026).

// ── The crew ────────────────────────────────────────────────────────────

export const PLANNER_GOAL = "Turn a settled specification or change brief into batches a test-first implementation can follow";
export const PLAN_REVIEW_TASK = "review of the plan";

// ── Refusals ────────────────────────────────────────────────────────────

/** The last line of a plan ready to implement; `{command}` names the next step. */
export const END_LINE = "→ Read and validate the plan. Then implement batch by batch: {command}";
export const BAD_INPUT_SOURCE = "dev-plan: invalid crew input: source";
export const BAD_INPUT_REPLACE = "dev-plan: invalid crew input: replace";
export const planRunFromCheckout = (workspace: string, top: string): string =>
  `dev-plan: run from the checkout at ${workspace} (git reports ${top === "" ? "no work tree" : top})`;

// ── An existing plan ────────────────────────────────────────────────────

export const batchIsDone = (id: string): string => `batch ${id} is done`;
export const stepIsTicked = (n: number, id: string): string => `step ${n} of ${id} is ticked`;
export const titleReadsDone = (date: string): string => `its title reads done (${date})`;
export const tddLineTicked = (n: number): string => `the TDD line of step ${n} is ticked`;
export const planExists = (shown: string, code: string): string =>
  `dev-plan: ${shown} exists: /dev-plan ${code} --replace writes a new plan over it (nothing is merged)`;
export const planCannotBeReadNothingReplaced = (shown: string, why: string): string => `dev-plan: ${shown} cannot be read (${why}): nothing is replaced`;
export const recordsWorkDone = (shown: string, done: string): string =>
  `dev-plan: ${shown} records work done (${done}): a started plan is never replaced; plan the rest as a new change`;

// ── The plan ────────────────────────────────────────────────────────────

export const planRendererDefect = (first: string): string =>
  `dev-plan: a checked answer rendered a plan that fails its self-check (a renderer defect): ${first}`;
export const namesNoTraceableId = (shown: string): string => `dev-plan: ${shown} names no UC-, BR- or CH- id: nothing to trace`;
export const planTitleNamesNoKind = (shown: string): string => `dev-plan: ${shown}: the title names no kind (bug, refactor or perf)`;
export const noRoomForInventory = (fixed: number, max: number): string =>
  `dev-plan: the prompt leaves no room for the inventory: its instructions, ids, commands and precedents take ${fixed} ` +
  `of ${max} characters; nothing is written. Split the source, or run it again with fewer precedents.`;
export const REFUSED_TWICE = "dev-plan: the plan was refused twice; nothing is written.";
export const fewerBatches = (batches: number, previous: number, extra: string, code: string): string =>
  `dev-plan: the new plan has ${batches} batches and the previous one ${previous}; ` +
  `Orkeon Code cannot delete a file: remove ${extra} by hand, then /dev-plan ${code} --replace. Nothing is written.`;
export const planFileNotWritten = (shown: string, why: string): string =>
  `dev-plan: ${shown} could not be written (${why}); the files before it are written`;
export const planWritten = (shown: string, sheets: number): string => `dev-plan: ${shown} and ${sheets} sheets written`;

// ── The end message ─────────────────────────────────────────────────────

export const everyBatch = (first: string, code: string): string =>
  `${first}, or /dev-batches ${code} for every batch in their dependencies' order`;
export const reviewHead = (verdict: string, blocking: number, majors: number, places: string): string =>
  `review: ${verdict} — ${blocking} Blocking, ${majors} Major (${places})`;
export const BOTH_LINES = "the Commands and Layout lines";
export const COMMANDS_LINE = "the Commands line";
export const notInPack = (keys: string, where: string, planName: string, code: string): string =>
  `${keys} not in the pack: fill them on ${where} of ${planName} § 1, or add them to ` +
  `.orkeon/repo.yaml and run /dev-plan ${code} --replace`;
export const reviewNotRunWithCause = (reason: string, first: string): string => `review: not run (${reason}: ${first})`;
export const REVIEWED_FAILS_SELF_CHECK =
  "dev-plan: the reviewed plan fails its self-check; the files written before the review stay as they are.";
export const ROWS_NOT_WRITTEN = "review rows that could not be written:";
export const inventoryFromTitles = (entries: number, titles: number, index: string, calls: number): string =>
  `inventory: ${entries} entries from ${titles} titles (index ${index}, ${calls} calls)`;
export const SETTLE_CHANGE = "the change brief: /dev-spec";
export const SETTLE_SPEC = "the spec: /dev-spec";
export const planBlocked = (questions: string, shown: string): string =>
  `dev-plan: the plan is blocked: ${questions} in ${shown} § 4; every batch reads — blocked.`;
export const answerThenReplan = (pronoun: string, settle: string, code: string, kind: string): string =>
  `→ Answer ${pronoun} in ${settle} ${code}${kind}, then /dev-plan ${code} --replace. Do not implement before.`;
export const unreviewed = (code: string): string =>
  `→ The plan is written but unreviewed: read it closely before implementing, or /dev-plan ${code} --replace to plan and review again.`;

// ── The inventory ───────────────────────────────────────────────────────

export const searchFailedUnquoted = (id: string, why: string): string => `search failed for ${id}: ${why}`;
export const indexCannotBeBuilt = (why: string): string =>
  `dev-plan: the code index cannot be built (${why}): anchors would be guesses, so no plan is written`;
export const indexStatus = (status: string, note: string): string => `dev-plan: code index ${status}${note === "" ? "" : `; ${note}`}`;
export const INDEX_EMPTY = "the code index holds no file: every anchor is a path to create";
export const titlesNotSearched = (count: number, ids: string): string => `${count} titles not searched: ${ids}`;
export const titlesSearched = (titles: number, kept: number): string => `dev-plan: ${titles} titles searched, ${kept} symbols kept`;
export const droppedOutside = (fqn: string, path: string): string => `${fqn} dropped: ${path} is outside what a plan may anchor`;
export const entriesLocated = (count: number): string => `dev-plan: ${count} entries located`;
export const closureTruncated = (fqn: string): string => `closure of ${fqn} truncated`;
export const anchorsFailed = (fqn: string, why: string): string => `anchors failed for ${fqn}: ${why}`;
export const callersAsked = (count: number): string => `dev-plan: callers asked for ${count} entries`;
export const graphJoined = (edges: number): string => `dev-plan: module graph of ${edges} edges joined`;
export const graphFailed = (why: string): string => `the module graph failed: ${why}`;
