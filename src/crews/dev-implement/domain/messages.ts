// The problems the domain of /dev-implement states: why a test command, a correction, a tick or a step check does
// not hold (ADR 0026).

// ── Test commands (contracts.ts) ────────────────────────────────────────────

export const SHELL_OPERATOR_OUTSIDE_QUOTES = "a shell operator outside double quotes";
export const stepNamesNoTestFile = (step: number): string => `step ${step} names no test file in ## Anchors`;
export const PACK_HAS_NO_TEST_COMMAND = "the pack has no commands.test_class or commands.test_project";
export const PACK_HAS_NO_TEST_PROJECT = "the pack has no commands.test_project";

// ── Corrections (correction.ts) ─────────────────────────────────────────────

export const CORRECTION_NAMES_NO_FINDING = "the correction names no finding: — correction: <finding>";
export const findingNamesUnknownIds = (ids: readonly string[]): string =>
  `the finding names ${ids.join(", ")}, which the sheet does not carry: a new id changes the scope ` +
  "(/dev-spec <code> <kind> for the change, then /dev-plan), never a correction";
export const NO_STEP_TO_CORRECT = "the sheet has no step with a test file to correct";
export const SHEET_LACKS_TDD_OR_ANCHORS = "the sheet lacks ## TDD sequence or ## Anchors";
export const ANCHORS_HAVE_NO_ROW = "the sheet's ## Anchors has no row";
export const correctsStep = (number: number, title: string): string => `Corrects step ${number} (${title}); its earlier evidence stays.`;
export const correctionTestRow = (k: number, level: string, project: string, ids: string): string =>
  `| 1 | \`C${k}: the test the author names\` | ${level} | \`${project}\` | ${ids} |`;

// ── Cycles (cycles.ts) ──────────────────────────────────────────────────────

export const NO_TEST_FILE = "no test file";

// ── Ticks (sheet-ticks.ts) ──────────────────────────────────────────────────

export const sheetHasNoStep = (step: number): string => `the sheet has no step ${step}`;
export const stepHasNoTddLine = (step: number): string => `step ${step} has no TDD line`;
export const notTheTddLine = (line: number, step: number): string => `line ${line} is not step ${step}'s TDD line`;
export const tddLineHasNoBox = (step: number, box: string): string => `step ${step}'s TDD line has no ${box} box`;

// ── Step checks (step-checks.ts) ────────────────────────────────────────────

export const testsDidNotRun = (reason: string): string => `the step's tests did not run: ${reason}`;
export const TESTS_TIMED_OUT = "the step's tests timed out";
export const TEST_AUTHOR_CHANGED_NOTHING = "the test author changed no file";
export const productionChangedBeforeRed = (paths: readonly string[]): string =>
  `a production path changed before a red test: ${paths.join(", ")}`;
export const onlyStubsChanged = (paths: readonly string[]): string =>
  `the test author changed no test file, only stubs: ${paths.join(", ")}`;
export const NEW_TESTS_PASS_AT_ONCE = "the new tests pass at once: a test green before its code is never kept";
export const noFailureAdded = (before: number, after: number): string =>
  `the new tests add no failure (failures ${before} → ${after}): a test green before its code is never kept`;
export const testFileChangedAtGreen = (paths: readonly string[]): string =>
  `a test file changed while turning it green: ${paths.join(", ")}`;
export const testsStillFail = (exit: number): string => `the step's tests still fail (exit ${exit})`;
export const GREEN_BY_ITSELF =
  "the implementer changed no file, yet the tests that failed before now pass: a test that turns green by itself is flaky";
export const NO_COST_LINE = "the implementer stated no Cost line";
export const portCallInLoop = (line: string): string =>
  `a port call in a loop, a lambda or a memory filter: back to /dev-plan (${line})`;

// ── The sheet (step-section.ts) ─────────────────────────────────────────────

export const anchorsRowNamesMissingStep = (step: string): string => `an Anchors row names step ${step}, which the sheet lacks`;
export const tddLineWithoutTest = (step: number): string => `step ${step} has a TDD line and no test`;
