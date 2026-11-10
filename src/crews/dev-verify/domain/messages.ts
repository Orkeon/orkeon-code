// The text dev-verify's domain writes for the user: the gate's lines, the mechanical table, the verdict section and
// the problems of an audit answer.

const ids = (list: readonly string[]): string => list.map((id) => ` ${id}`).join("");

// ── The gate (the harness's wording, so both gates print the same lines) ────

export const SHEET_CLOSED = "sheet: every step reads `TDD: RED [x] GREEN [x] COST [x]`";
export const SHEET_NOT_CLOSED = "sheet not closed: a `TDD:` line is still open, or none is ticked";
export const DESIGN_IDS_CLASSIFIED = "design ids: all applied or non-applicable";
export const designIdsUnclassified = (missing: readonly string[]): string =>
  `design ids neither on an \`Applied rules\` row nor on \`Non-applicable rules\`:${ids(missing)}`;
export const SCOPE_NO_ROOT = "scope: the pack names no layout root, not checked";
export const scopeInRoots = (roots: string): string => `scope: every changed file is under ${roots} or named by the sheet`;
export const filesOutsideRoots = (roots: string): string =>
  `files changed outside ${roots} and absent from the sheet — name them under \`## Decisions\`, or restore them`;
export const TRAITS_NO_RULE = "rule traits: the pack has no tests.rule_trait, not checked";
export const TRAITS_NO_ID = "rule traits: the sheet's `## TDD sequence` names no BR-/UC-/CH- id, nothing to check";
export const traitsCarried = (shown: string): string => `rule traits: every id of the sheet is carried by a test, ${shown}`;
export const idsNotCarried = (shown: string, untested: readonly string[]): string =>
  `ids of the sheet's TDD sequence that no test carries as ${shown}:${ids(untested)}`;
export const strayTraitIds = (planDir: string, stray: readonly string[]): string =>
  `traits citing an id absent from ${planDir}/*.md:${ids(stray)}`;
export const DIFF_CHECK_CLEAN = "git diff --check: clean";
export const DIFF_CHECK_DIRTY = "git diff --check reports trailing whitespace or conflict markers";
export const gateHeader = (batch: string, sheet: string): string => `GATE — batch ${batch} — sheet ${sheet}`;
export const gateGreen = (batch: string): string => `GATE — batch ${batch}: GREEN`;
export const gateRed = (batch: string): string => `GATE — batch ${batch}: RED — fix and run again, no audit before`;

// ── The mechanical table ────────────────────────────────────────────────────

export const buildReused = (log: string): string => `\`exit: 0\` (reused ${log})`;
export const BUILD_RUN_GREEN = "`exit: 0` (run)";
export const buildRunRed = (exit: number, why: string): string => `\`exit: ${exit}\`${why !== "" ? ` — ${why}` : ""}`;
export const timedOutAfter = (seconds: number): string => `timed out after ${seconds} s`;
export const shellRefused = (message: string): string => `the shell refused it: ${message}`;
export const TRAITS_NOT_APPLICABLE = "not applicable: the pack has no tests.rule_trait or tests.trait_pattern";
export const SHEET_NAMES_NO_ID = "the sheet's `## TDD sequence` names no BR-/UC-/CH- id";
export const idsCarriedAs = (list: string, shown: string): string => `gate: ${list} each carried as ${shown} — capture \`traits\``;
export const NO_TEST_METHOD = "the step tables name no test method";
export const NO_TEST_ROOT = "no test root in the pack's layout";
export const TEST_ROOTS_NOT_SEARCHED = "the test roots were not searched";
export const methodsFound = (found: number, total: number, first: string): string =>
  `${found}/${total} found (git grep --untracked), first \`${first}\``;
export const methodsAbsent = (roots: string, absent: string): string => `absent from ${roots}: ${absent}`;
export const noTestLog = (looked: string): string => `no test log in ${looked}`;
export const NO_EXIT_LINE = "no `exit=` line";
export const exitLine = (exit: number): string => `\`exit=${exit}\``;
export const testRunEvidence = (passed: string, failed: string, exit: string, name: string): string =>
  `passed ${passed}, failed ${failed}, ${exit} — ${name}`;
export const noSummaryLine = (name: string): string => `no summary line and no \`exit=\` in the tail of ${name}`;
export const NO_LAYOUT_ROOT = "the pack names no layout root";
export const scopeEvidence = (roots: string): string =>
  `gate: every changed file under ${roots}, the plan folder or named by the sheet — capture \`changed-files\``;
export const notComputed = (reason: string): string => `not computed — ${reason}`;
export const costGreen = (costLine: string): string => `\`exit: 0\` — ${costLine}`;
export const NO_APPLIED_RULES_ROW = "the sheet has no `Applied rules` row";
export const unknownDesignRuleIds = (list: string): string => `unknown design-rule ids: ${list}`;
export const ROW_CITES_NO_ID = "the row cites no id";
export const eachDesignRuleId = (list: string): string => `${list}, each a design-rule id`;
export const JUDGED_BY_AUDITOR = "judged pass (the auditor)";
export const tickedNoneOpen = (ticked: number): string => `gate: ${ticked} ticked, none open`;
export const designIdsEvidence = (planDir: string): string =>
  `gate: every DDD-/APP-/PERF- id applied or on \`Non-applicable rules\` of ${planDir}/`;
export const tableTitle = (batch: string): string => `# Mechanical audit — ${batch}`;
export const TABLE_HEADER = "| Axis | Check | Result | Evidence |";

// ── The capture sections ────────────────────────────────────────────────────

export const cutNotCaptured = (more: number): string => `\n[cut: ${more} more characters not captured]\n`;
export const TRAITS_NOT_CHECKED = "not checked — the pack has no tests.rule_trait or tests.trait_pattern\n";
export const idsOfTheSheet = (list: string): string => `ids of the sheet: ${list}`;
export const NO_CLASS_FOUND = "no class found";
export const buildOutputsNotPaths = (name: string): string => `layout.build_outputs takes folder names, not paths: ${name}`;
export const UNQUOTABLE_SCOPE_REASON = "not captured: unquotable scope";

// ── The verdict ─────────────────────────────────────────────────────────────

export const NO_VALIDATION = "none — the capture's build and last test run stand";
export const buildIsRed = (check: string): string => `the build is red: ${check}`;

// ── The problems of an audit answer (written beside the reply, and fed back to the model) ──

export const rowSeverity = (k: number): string => `row ${k}: severity must be Blocking, Major or Minor`;
export const rowAxis = (k: number, label: string, axes: string): string => `row ${k}: axis '${label}' is not one of ${axes}`;
export const rowFieldEmpty = (k: number, field: string): string => `row ${k}: ${field} is empty`;
export const rowNoCitation = (k: number): string => `row ${k}: evidence cites no path:line`;
export const VERDICT_VALID_OR_GAPS = "verdict must be VALID or GAPS";
export const VALIDATIONS_NOT_LIST = "validations must be a list of commands";
export const tooManyValidations = (max: number, count: number): string => `at most ${max} validations, not ${count}`;
export const UNDECIDED_NOT_LIST = "undecided must be a list";
export const undecidedIncomplete = (k: number): string => `undecided ${k}: check and reason are needed`;
