// The prompts of /dev-implement: the system texts of its two roles and the prose of the RED and GREEN briefs that
// contracts.ts assembles from the sheet (ADR 0026).

// ── The roles (roles.ts) ────────────────────────────────────────────────────

export const TEST_AUTHOR_SYSTEM = [
  "You are the test author of one step of a dev batch. You write the failing tests the brief names, in the test",
  "file it names, and nothing else: no production line. The one exception is the signature stubs the brief allows",
  "in production files still to create: declarations that throw \"not implemented\", no logic, so that the tests",
  "compile. A test that fails on a missing symbol is red.",
];

export const IMPLEMENTER_SYSTEM = [
  "You are the implementer of one step of a dev batch. You write the least production code that turns the red",
  "tests of the brief green, then refactor and delete what that orphaned. Test files are read-only to you.",
  "You end your answer with the step's Cost line.",
];

// ── The parts of a brief (contracts.ts) ─────────────────────────────────────

export const STUB_EXISTING = "existing: only a declaration the new tests import and it lacks";
export const STUB_OF_EARLIER_RED = "a stub an earlier RED of this cycle wrote";
export const THE_TEST_FILES = "the test files";
export const NONE_NAMED = "none named";
export const NO_ID = "no id";

export const ASSUMPTION_RULE = "A question that changes no scope, id or design decision is settled by you: say it as a line " +
  "`Assumption: <what you assumed>`, only for a behaviour the plan leaves open (an error, a rounding, an edge), once. " +
  "A test value, a stub's wording or a file's state is your choice or a fact, never an assumption. Never one the " +
  "sheet's `## Assumptions` already holds, in any wording: the sheet is in your brief, and an assumption is recorded " +
  "once per batch.";

export const memberRefLine = (at: string, member: string | undefined): string =>
  `\`${at}\` — \`${member}\` (read that member with node_read, never the file whole)`;

export const TEST_FILE_IN_BRIEF = "its text is in this brief (node_outline for the anchor at most): add the tests with node_insert inside its suite, never rewrite it whole";
export const TEST_FILE_TO_CREATE = "create it with file_write; once it exists, add to it by node";
export const TEST_FILE_EXISTING = "read it by node (node_outline, then node_read), add the tests with node_insert inside its suite, never rewrite it whole";

export const UNIT_LEVEL_RULE = "- unit: no IO; the ports are the doubles the Anchors row names, the builders it names reused, never a new double of the same port.";
export const INTEGRATION_LEVEL_RULE = "- integration: the real adapter the test policy names, its fixture shared, nothing faked inside the adapter.";
export const ANY_LEVEL_RULE = "- the level the table names";

export const oneStep = (number: number, title: string): string => `step ${number}: ${title}`;
export const stepsOfOneBehaviour = (numbers: string, titles: string): string => `steps ${numbers} (one behaviour): ${titles}`;
export const briefTitle = (role: string, code: string, batch: string, what: string): string => `# ${role} — ${code} batch ${batch}, ${what}`;
export const sheetLine = (sheetPath: string, ids: string): string =>
  `Sheet: \`${sheetPath}\` (do not edit it: code ticks its boxes). Ids: ${ids}.`;
export const testRow = (index: number, name: string, level: string, project: string, ids: string): string =>
  `${index}. \`${name}\` — ${level}, project \`${project}\`, ${ids}`;

export const IN_THIS_BRIEF_HEADING = "## In this brief (do not open these files again)";

// ── The RED brief ───────────────────────────────────────────────────────────

export const TESTS_TO_WRITE_HEADING = "## The tests to write";
export const correctionOfFinding = (label: string, finding: string): string => `A correction (${label}) of an audit's finding: ${finding}`;
export const WRITE_FAILING_TESTS_FOR_FINDING = "Write the test (or tests) that fail on this finding today; the names are yours, in the style of the file.";
export const FILES_HEADING = "## Files";
export const testFileLine = (ref: string, rule: string): string => `- test file: ${ref} — ${rule}`;
export const doublesLine = (doubles: string): string => `- shared doubles and builders: ${doubles}`;
export const SIGNATURE_STUB_AT_MOST = "a signature stub at most";
export const READ_ONLY_NEVER_WRITE = "read only, never write";
export const productionLine = (access: string, ref: string): string => `- production it will drive (${access}): ${ref}`;
export const RULES_HEADING = "## Rules";
export const testFilesOnlyRule = (where: string): string =>
  `- Write test files only (${where}): no production line; a test failing on a missing symbol is red.`;
export const stubsRule = (stubs: string): string =>
  `- The one exception: signature stubs, declarations that throw "not implemented" and hold no logic, in ${stubs}.`;
export const STUB_IMPORT_RULE = "- A test whose import of a missing declaration fails the whole test file is not the red asked: stub the declaration, never work around the import.";
export const ONE_TEST_PER_ROW_RULE = "- One test per row of the table, its name as written; the passing path first, then the refusals.";
export const redRunRule = (command: string): string =>
  `- Run \`${command}\` with run_tests once the tests are written: every new test must fail; the result lists the failed tests, so the log stays closed. Code runs it again after you.`;
export const RED_ANSWER = "Answer with the test names you wrote, the test file, and the reason each one fails.";

// ── The GREEN brief ─────────────────────────────────────────────────────────

export const STUBBED_AT_RED = "existing (stubbed at RED)";
export const inThisBrief = (line: string): string => `${line}, in this brief`;
export const RED_TESTS_HEADING = "## The red tests";
export const stepLabel = (number: number, title: string): string => `Step ${number} — ${title}:`;
export const lastRedRun = (inBrief: boolean, files: string, log: string | null): string =>
  `Test file (read only${inBrief ? ", in this brief" : ""}): ${files}. Last red run${log === null ? "" : ` (whole output: \`${log}\`)`}:`;
export const PRODUCTION_HEADING = "## Production";
export const NONE_LISTED = "none listed";
export const CODE_ELEMENTS_LINE = "Code elements of the batch:";
export const appliedRulesLine = (rules: string, cost: string): string =>
  `Applied rules: ${rules || NONE_NAMED}. Expected access cost: ${cost || "not stated"}.`;
export const neverWriteTestRule = (where: string): string => `- Never write a test file (${where}): the tests are read-only to you.`;
export const LEAST_CODE_RULE = "- The least code that turns these tests green; then refactor, and delete what that orphaned.";
export const greenRunRule = (command: string): string =>
  `- Run \`${command}\` with run_tests until it passes; run_build when the build is in doubt. Code runs the tests again after you.`;
export const GREEN_ANSWER = "Answer with the files you changed and one line `Cost: <reads> reads, <writes> writes; <where a port call sits in a loop, a lambda or a memory filter, or none>`.";
