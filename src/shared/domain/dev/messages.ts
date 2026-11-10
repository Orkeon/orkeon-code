// The messages of shared/domain/dev: the problems a parser or a check reports and the stops the user reads
// (ADR 0026).

// ── Parse problems of the dev files ─────────────────────────────────────

export const unknownBatchLine = (line: string): string => `unknown batch line '${line}'`;
export const malformedSummaryRow = (row: string): string => `malformed summary row '${row}'`;
export const malformedTddLine = (line: string): string => `malformed TDD line '${line}'`;
export const tddLineOutsideStep = (line: string): string => `TDD line outside a step '${line}'`;
export const twoTddLines = (step: number): string => `step ${step} has two TDD: lines`;
export const unknownVerdictTitle = (title: string): string => `unknown verdict title '${title}'`;
export const unknownVerdictLine = (line: string): string => `unknown verdict line '${line}'`;
export const unknownSeverity = (severity: string): string => `unknown severity '${severity}'`;
export const malformedGapRow = (row: string): string => `malformed gap row '${row}'`;
export const duplicatedId = (id: string): string => `duplicated id ${id}`;
export const idInChangeBrief = (id: string): string => `${id} in a change brief`;
export const BRIEF_TITLE_NAMES_NO_KIND = "the brief's title names no kind (bug, refactor or perf)";

// ── The Blocking stop of /dev-plan ──────────────────────────────────────

export const blockingQuestionsOpen = (shown: string, count: number): string =>
  `dev-plan: ${shown} has ${count} open Blocking question(s); no plan is written.`;
export const settleThemFirst = (settle: string, code: string, change: boolean): string =>
  `→ Settle them first: ${settle} ${code}${change ? " <its kind: bug, refactor or perf>" : ""}, or edit the file; then /dev-plan ${code}.`;

// ── A question as a model gives it ──────────────────────────────────────

export const severityMustBe = (k: number): string => `question ${k}: severity must be Blocking or Major`;
export const questionOneLine = (k: number, max: number): string =>
  `question ${k}: one line of at most ${max} characters ending with ?, no '|'`;
export const impactOneLine = (k: number): string => `question ${k}: the impact is one line, no '|'`;
export const optionCount = (k: number, max: number): string =>
  `question ${k}: no option, or 2 to ${max} options with the recommended one first`;
export const optionOneLine = (k: number, max: number): string =>
  `question ${k}: an option is one line of at most ${max} characters, no ';' nor '|'`;
export const notAnOptionToList = (k: number, option: string): string => `question ${k}: '${option}' is not an option to list`;
export const twoOptionsSame = (k: number): string => `question ${k}: two options read the same`;

// ── The self-check of a plan ────────────────────────────────────────────

export const stepOneMissing = (sheet: string): string => `${sheet}: step 1 is missing: the sheet has no step`;
export const stepOutOfOrder = (sheet: string, step: number, expected: number): string =>
  `${sheet}: step ${step} is numbered out of order (expected ${expected})`;
export const stepHasNoTdd = (sheet: string, step: number): string => `${sheet}: step ${step} has no TDD: line`;
export const lastStepIsNot = (sheet: string, step: number, build: string): string =>
  `${sheet}: step ${step} is the last step and is not ${build}`;
export const buildStepHoldsTdd = (sheet: string, step: number, build: string): string =>
  `${sheet}: step ${step} is ${build} and holds a TDD: line`;
export const anchorRowsMismatch = (sheet: string, rows: number, steps: number): string =>
  `${sheet}: ## Anchors has ${rows} rows for ${steps} steps`;
export const designIdsNeither = (missing: readonly string[]): string =>
  `design ids neither applied nor non-applicable: ${missing.join(", ")}`;
export const batchesDiffer = (summary: string, lines: string, sheets: string): string =>
  `batches differ: summary ${summary}, plan lines ${lines}, sheets ${sheets}`;
export const dependsOnDiffers = (sheet: string, summary: string, own: string): string =>
  `${sheet}: Depends on differs between the summary (${summary}) and the sheet (${own})`;
export const noTraceabilityRow = (id: string): string => `${id}: no row of ## 2. Traceability`;
export const noTestNamesIt = (id: string): string => `${id}: no test of any sheet's ## TDD sequence names it`;
export const notASourceId = (sheet: string, id: string): string => `${sheet}: ${id} is not an id of the source`;
export const noAppliedRulesRow = (sheet: string): string => `${sheet}: no Applied rules row`;
export const assumptionsNotEmpty = (sheet: string): string => `${sheet}: ## Assumptions is not empty`;
export const idOutsideBatch = (sheet: string, id: string): string =>
  `${sheet}: ${id} appears in ## TDD sequence outside the batch's ids`;

// ── The call guard of a dev step: why a call is refused ────────────────

export const packGivesNo = (key: string): string => `the pack gives no ${key}: no rule on it`;
export const notRunInMode = (step: string, tool: string, mode: string): string =>
  `${step}: '${tool}' is not run in mode '${mode}': the host has no permission gate, so the crew's ` +
  `callback applies the mode itself`;
export const ruleSetOrigin = (id: string): string => `the rule set ${id}`;
export const rewriteRuleOrigin = (role: string): string => `the ${role}'s rewrite rule`;
export const rootsOrigin = (role: string): string => `the ${role}'s roots`;
export const refusedByRule = (step: string, rule: string, origin: string, how: string): string =>
  `${step}: refused by '${rule}' of ${origin}${how}`;
export const whichPathReaches = (path: string): string => `, which '${path}' reaches`;
export const whichPathCanReach = (path: string): string => `, which '${path}' can reach`;
export const editBatchRefused = (step: string, why: string): string => `${step}: edit_batch refused: ${why}`;
export const validateNotRun = (validate: string): string => `validate '${validate}' is not run in a dev step`;
export const NO_LIST_OF_OPERATIONS = "no list of operations";
export const operationNamesNoPath = (n: number): string => `operation ${n} names no path`;
export const operationUnknownKind = (n: number, kind: string): string => `operation ${n} has the unknown kind '${kind}'`;

// ── The access cost of a batch ──────────────────────────────────────────

export const NO_CODE_INDEX_WIRED = "the crew wires no code index; judge the Cost axis from the diff";
export const CODE_INDEX_EMPTY = "the code index is empty";
export const codeIndexHolds = (roots: readonly string[], workspace: string): string =>
  `the code index holds ${roots.join(", ")}, not ${workspace}`;
export const notIndexedReason = (holds: string): string =>
  `not indexed — ${holds}: run /analyze, then audit the batch again; judge the Cost axis from the diff`;
export const backToDesign = (blocking: number): string => `${blocking} - back to design`;
export const costLine = (reads: string, writes: string, verdict: string): string =>
  `Cost: ${reads} + ${writes} through ports outside loops; ` +
  `in a loop, a lambda or a memory filter: ${verdict}`;
export const PORTS_OUTSIDE_LOOPS = "Ports outside loops";
export const PORTS_IN_A_LOOP = "Ports in a loop";
export const PORTS_IN_A_LAMBDA = "Ports in a lambda";
export const MEMORY_FILTER_ON_AWAITED = "Memory filter on an awaited result";
export const NO_MEMBER_INDEXED = "no member of the changed files in the code index";
export const noneAwaitsAPort = (members: string): string => `${members}, none awaits a port or filters in memory`;
export const noChangedFile = (where: string): string => `no changed file${where}\n`;
export const costNotComputed = (reason: string): string => `Cost: not computed — ${reason}`;
export const cutAtLines = (lines: number): string => `[cut at ${lines} lines]`;

// ── The answer of a dev reviewer ────────────────────────────────────────

export const QUESTION_EMPTY = "it is empty";
export const questionLongerThan = (max: number): string => `it is longer than ${max} characters`;
export const QUESTION_NO_MARK = "it does not end with ?";
export const rowSeverityMustBe = (k: number): string => `row ${k}: severity must be Blocking or Major`;
export const rowOneClosedQuestion = (k: number, fault: string): string =>
  `row ${k}: the question must be one closed question ending with ? (${fault})`;
export const rowEvidenceEmpty = (k: number): string => `row ${k}: evidence is empty`;
export const rowEvidenceCitesNothing = (k: number): string => `row ${k}: evidence cites no path:line, § section or heading`;
export const rowTargetNotOneOf = (k: number, named: string, targets: string): string =>
  `row ${k}: target '${named}' is not one of ${targets}`;
export const rowTwoTargets = (k: number, named: string): string => `row ${k}: target '${named}' names two targets`;
export const ANSWER_NOT_AN_OBJECT = "the answer is not an object";
export const VERDICT_CLEAR_OR_GAPS = "verdict must be CLEAR or GAPS";
export const ROWS_MUST_BE_A_LIST = "rows must be a list";
export const atMostRows = (max: number, count: number): string => `at most ${max} rows, not ${count}`;
export const rowRepeats = (k: number, first: number): string => `row ${k}: repeats row ${first}`;

// ── The YAML subset of the repository pack ──────────────────────────────

export const YAML_PROBLEMS = {
  tab: "a tab in the indentation",
  tabInLine: "a tab outside quotes and comments",
  marker: "a document marker is not supported",
  anchor: "anchors, aliases and tags are not supported",
  flowMap: "a flow mapping is not supported",
  flowOpen: "a flow sequence must close on its line",
  flowNested: "a nested flow sequence is not supported",
  flowAfter: "text after a closing bracket",
  flowEmpty: "an empty item in a flow sequence",
  moreIndented: "a more-indented line inside a folded block is not supported",
  quoteOpen: "a quoted scalar must close on its line",
  quoteAfter: "text after a closing quote",
  colon: "': ' inside a plain value: quote it",
  key: "a mapping key must be a plain name",
  indent: "bad indentation (a value continued on the next line is not supported)",
  itemForKey: "a sequence item where a mapping key was expected",
  keyForItem: "a mapping key where a sequence item was expected",
  nestedItem: "a nested sequence item on one line is not supported",
} as const;
export const ambiguousNumber = (v: string): string => `an ambiguous number '${v}': quote it`;
export const ambiguousDate = (v: string): string => `an ambiguous date '${v}': quote it`;
export const unknownEscape = (e: string): string => `an unknown escape '\\${e}' in a double-quoted scalar`;
export const plainCannotStartWith = (c: string): string => `a plain value cannot start with '${c}': quote it`;
export const onlyFoldedBlock = (indicator: string): string => `only the folded block '>-' is supported, not '${indicator}'`;

// ── The repository pack ─────────────────────────────────────────────────

export const expectedMapping = (kind: string): string => `expected a mapping, found a ${kind}`;
export const expectedString = (kind: string): string => `expected a string, found a ${kind}`;
export const LIST_FOUND_MAPPING = "expected a list of strings, found a mapping";
export const listHolding = (kind: string): string => `expected a list of strings, found a list holding a ${kind}`;
export const testsAlsoSourceRoot = (tests: string, key: string): string =>
  `'${tests}' is also layout.${key}: the test author and the implementer would both be refused that folder; ` +
  `drop layout.tests and name the test files with layout.test_files ("${tests}/*.test.ts")`;
export const PACK_NOT_A_MAPPING = "the pack is not a mapping";
export const noRepositoryPack = (key: string): string => `no repository pack: add ${key} to .orkeon/repo.yaml`;
export const packHasNo = (pack: string, key: string): string => `the repository pack ${pack} has no ${key}: add it there`;

// ── Test traits and test commands ───────────────────────────────────────

export const TRAIT_NAME_CHARS = "a trait name takes letters, digits, '_' and '-'";
export const PATTERN_EMPTY = "the pattern is empty";
export const PATTERN_TOO_LONG = "the pattern is longer than 80 characters";
export const PATTERN_NO_TAB_OR_BREAK = "a tab or a line break is not allowed";
export const PATTERN_NO_SINGLE_QUOTE = "a single quote is not allowed";
export const PATTERN_NO_PIPE = "a '|' is not allowed: the runtime's shell refuses it";
export const PATTERN_ONE_ID = "the pattern must hold <id> exactly once";
export const PATTERN_ONE_NAME = "the pattern may hold <name> once at most";
export const PATTERN_ANGLES = "'<' and '>' may only enclose <id> and <name>";
export const PATTERN_TOO_SHORT = "the pattern needs at least two characters around <id>";
export const valueHoldsDotDot = (value: string): string => `the value '${value}' holds a '..' segment`;
export const valueNotPlain = (value: string): string => `the value '${value}' is not one plain relative name`;
export const NOT_ONE_LINE = "not one line of at most 400 characters";
export const SHELL_OPERATOR = "a shell operator outside double quotes";
export const PACK_HAS_NO_TEST_COMMAND = "the pack has no test_class, test_project or test_integration";
export const nothingMayFollow = (rest: string): string => `nothing may follow the pack's command: '${rest}'`;
export const INTEGRATION_WITHOUT_FILTER = "test_integration without a filter is a whole suite";
export const NOT_A_PACK_TEST_COMMAND = "not one of the pack's test_class, test_project or test_integration commands";
export const AS_THE_PACK_NAMES_IT = "as the pack names it";
export const validationLineText = (command: string, exit: number, scope: string, tests: string | number): string =>
  `\`${command}\` — exit ${exit}, scope ${scope}, ${tests} tests`;

// ── Concurrency of /dev-batches ─────────────────────────────────────────

export const concurrencyNotWhole = (raw: string): string => `concurrency must be a whole number from 1, not '${raw}'`;
export const concurrencyAtMost = (n: number, max: number): string => `concurrency ${n} refused: at most ${max} batches at once`;
export const concurrencyModeAsks = (n: number, mode: string): string =>
  `concurrency ${n} refused: the session mode ${mode} asks before shell commands, and two batches would ask at once: ` +
  "/mode bypassPermissions, or run with --concurrency 1";
export const concurrencyGitFails = (n: number): string =>
  `concurrency ${n} refused: git does not work inside a worktree under this shell confinement (Tools:Shell:Confinement:Mode)` +
  "; a runtime from Orkeon/orkeon#191 on binds a linked worktree's git dir: update it, or run with --concurrency 1";
