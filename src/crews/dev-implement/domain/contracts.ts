// The two briefs of a step, made by code from the sheet and the pack (never by a model): the RED
// contract the test author works from and the GREEN contract the implementer works from. Each
// names the batch, the ids, the behaviour, the files, the narrow test command code runs after the
// act, and the reading and editing rules: by node. A contract never asks to read a file whole. Pure.
import { carry } from "../../../shared/domain/dev/carried-text.ts";
import type { CarriedText } from "../../../shared/domain/dev/carried-text.ts";
import type { RepoPackCommands, RepoPackLayout } from "../../../shared/domain/dev/repo-pack.ts";
import { PLACEHOLDER, plainWords, valueProblem } from "../../../shared/domain/dev/test-commands.ts";
import { BOUNDED_READ_RULE, NODE_EDIT_RULE, NODE_READ_RULE } from "../../../shared/domain/dev/reading-rule.ts";
import type { AnchorRef, ImplementSheet, ImplementStep } from "./step-section.ts";
import { CORRECTION_LABEL as CORRECTION, STALE_HEADING } from "./markers.ts";
import { PACK_HAS_NO_TEST_COMMAND, PACK_HAS_NO_TEST_PROJECT, SHELL_OPERATOR_OUTSIDE_QUOTES, stepNamesNoTestFile } from "./messages.ts";
import {
  ANY_LEVEL_RULE, ASSUMPTION_RULE, CODE_ELEMENTS_LINE, FILES_HEADING, GREEN_ANSWER, IN_THIS_BRIEF_HEADING, INTEGRATION_LEVEL_RULE,
  LEAST_CODE_RULE, NO_ID, NONE_LISTED, NONE_NAMED, ONE_TEST_PER_ROW_RULE, PRODUCTION_HEADING, READ_ONLY_NEVER_WRITE, RED_ANSWER,
  RED_TESTS_HEADING, RULES_HEADING, SIGNATURE_STUB_AT_MOST, STUB_EXISTING, STUB_IMPORT_RULE, STUB_OF_EARLIER_RED, STUBBED_AT_RED,
  TEST_FILE_EXISTING, TEST_FILE_IN_BRIEF, TEST_FILE_TO_CREATE, TESTS_TO_WRITE_HEADING, THE_TEST_FILES, UNIT_LEVEL_RULE,
  WRITE_FAILING_TESTS_FOR_FINDING, appliedRulesLine, briefTitle, correctionOfFinding, doublesLine, greenRunRule, inThisBrief,
  lastRedRun, memberRefLine, neverWriteTestRule, oneStep, productionLine, redRunRule, sheetLine, stepLabel, stepsOfOneBehaviour,
  stubsRule, testFileLine, testFilesOnlyRule, testRow,
} from "./prompts.ts";

export type TestCommand = { ok: true; command: string } | { ok: false; reason: string };

/** What the placeholder `<Class>` stands for: a C# file's base name, else the test file's path. */
export function classOf(testFile: string): string {
  const name = testFile.split("/").pop() ?? testFile;
  return name.endsWith(".cs") ? name.slice(0, -3) : testFile;
}

/** The step's test file: the first path of its Anchors test cell; null when it names none. */
export function testFileOf(step: ImplementStep): string | null {
  return step.anchor?.testFiles[0]?.path ?? null;
}

function fill(template: string, values: { project: string; klass: string }): TestCommand {
  const holes = template.match(PLACEHOLDER) ?? [];
  for (const hole of holes) {
    const value = /project/i.test(hole) ? values.project : values.klass;
    const problem = valueProblem(value);
    if (problem !== null) return { ok: false, reason: `${hole}: ${problem}` };
  }
  const command = template.replace(PLACEHOLDER, (hole) => (/project/i.test(hole) ? values.project : values.klass));
  return plainWords(command) ? { ok: true, command } : { ok: false, reason: SHELL_OPERATOR_OUTSIDE_QUOTES };
}

/** The narrow command that runs the step's tests: `test_class`, else `test_project`; never the whole suite. */
export function testCommandFor(commands: RepoPackCommands, step: ImplementStep): TestCommand {
  const file = testFileOf(step);
  if (file === null) return { ok: false, reason: stepNamesNoTestFile(step.number) };
  const values = { project: step.tests[0]?.project ?? "", klass: classOf(file) };
  const byClass = commands.testClass?.trim();
  if (byClass) return fill(byClass, values);
  const byProject = commands.testProject?.trim();
  if (byProject) return fill(byProject, values);
  return { ok: false, reason: PACK_HAS_NO_TEST_COMMAND };
}

/** `test_project` for one Project cell: the affected tests of a later run. */
export function projectCommandFor(commands: RepoPackCommands, project: string): TestCommand {
  const byProject = commands.testProject?.trim();
  if (!byProject) return { ok: false, reason: PACK_HAS_NO_TEST_PROJECT };
  return fill(byProject, { project, klass: project });
}

export interface ContractInput {
  code: string;
  sheetPath: string;
  sheet: ImplementSheet;
  step: ImplementStep;
  /** Every step of the cycle, `step` first: one GREEN turns them all green. */
  cycle?: readonly ImplementStep[];
  layout: RepoPackLayout;
  testCommand: string;
  /** Texts carried in the brief (the sheet, the test file), so the role opens no file for them. */
  carried?: readonly CarriedText[];
  /** The files open to RED as signature stubs: `stubsOf(step)`, and the stubs an earlier RED of the cycle wrote. */
  stubs?: readonly string[];
}

/** The production files a RED step may write as signature stubs: its Anchors' `to create` production paths. */
export function stubsOf(step: ImplementStep): string[] {
  return (step.anchor?.production ?? []).filter((r) => r.state === "to create").map((r) => r.path);
}

/** The existing production files a RED step may add a signature stub to: its Anchors' `existing` production paths. A
 *  declaration the new tests import and the module lacks is stubbed there, so that the import fails no other test (an
 *  ES module's missing export fails its whole test file). */
export function existingStubsOf(step: ImplementStep): string[] {
  return (step.anchor?.production ?? []).filter((r) => r.state === "existing").map((r) => r.path);
}

/** What a stub path is to the test author: a file to create, an existing one, or an earlier RED's stub. */
function stubKind(step: ImplementStep, path: string): string {
  if (stubsOf(step).includes(path)) return "to create";
  if (existingStubsOf(step).includes(path)) return STUB_EXISTING;
  return STUB_OF_EARLIER_RED;
}

/** Where the tests live, as the pack says: its test folder, and its test file patterns. */
function testsWhere(layout: RepoPackLayout): string {
  const parts = [
    ...(layout.tests?.trim() ? [`under \`${layout.tests.trim()}\``] : []),
    ...(layout.testFiles ?? []).filter((p) => p.trim() !== "").map((p) => `\`${p.trim()}\``),
  ];
  return parts.length === 0 ? THE_TEST_FILES : parts.join(" or ");
}

/** One anchor as a brief line; `shown` overrides the state it says (a file the sheet says to create, stubbed since). */
function refLine(ref: AnchorRef, shown: string = ref.state): string {
  const at = ref.line === undefined ? ref.path : `${ref.path}:${ref.line}`;
  if (ref.state === "member") return memberRefLine(at, ref.member);
  return `\`${at}\` — ${shown}`;
}

/** How the test author works on its test file: creates it whole when it is to create, else adds to it by node; one
 *  carried in the brief is not read again. */
function testFileRule(state: string, inBrief: boolean): string {
  if (inBrief) return TEST_FILE_IN_BRIEF;
  return state === "to create" ? TEST_FILE_TO_CREATE : TEST_FILE_EXISTING;
}

function ids(step: ImplementStep): string {
  return [...new Set(step.tests.flatMap((t) => t.ids))].join(", ") || NONE_NAMED;
}

function levelRule(step: ImplementStep): string {
  const levels = new Set(step.tests.map((t) => t.level.toLowerCase()));
  const lines: string[] = [];
  if (levels.has("unit")) lines.push(UNIT_LEVEL_RULE);
  if (levels.has("integration")) lines.push(INTEGRATION_LEVEL_RULE);
  return lines.length === 0 ? ANY_LEVEL_RULE : lines.join("\n");
}

function header(input: ContractInput, role: string, steps: readonly ImplementStep[] = [input.step]): string[] {
  const { sheet } = input;
  const what = steps.length === 1
    ? oneStep(steps[0].number, steps[0].title)
    : stepsOfOneBehaviour(steps.map((s) => s.number).join(", "), steps.map((s) => s.title).join("; "));
  const allIds = [...new Set(steps.flatMap((s) => s.tests.flatMap((t) => t.ids)))].join(", ") || NONE_NAMED;
  return [
    briefTitle(role, input.code, sheet.batch ?? "?", what),
    "",
    sheetLine(input.sheetPath, steps.length === 1 ? ids(steps[0]) : allIds),
  ];
}

function testsTable(step: ImplementStep): string[] {
  return step.tests.map((t, i) => testRow(i + 1, t.name, t.level, t.project, t.ids.join(", ") || NO_ID));
}

/** The test author's brief: write the step's tests, all red, test files only. */
/** The most carried text a role's brief holds, in characters. */
export const CARRIED_CONTRACT_CHARS = 12_000;

/** The carried texts as a section of the brief (or nothing), and the files it holds whole. */
function carriedSection(input: ContractInput): { lines: string[]; whole: ReadonlySet<string> } {
  const { blocks, whole } = carry(input.carried ?? [], CARRIED_CONTRACT_CHARS);
  return { lines: blocks.length === 0 ? [] : ["", IN_THIS_BRIEF_HEADING, ...blocks], whole };
}

export function redContract(input: ContractInput): string {
  const { step, layout } = input;
  const file = testFileOf(step) ?? "(none)";
  const doubles = step.anchor?.doubles ?? "";
  const stubs = input.stubs ?? [...stubsOf(step), ...existingStubsOf(step)];
  const correction = CORRECTION.exec(step.title);
  const testRef: AnchorRef = step.anchor?.testFiles[0] ?? { path: file, state: "to create" };
  const carried = carriedSection(input);
  const testInBrief = carried.whole.has(testRef.path);
  // A file the sheet says is to create exists once an earlier step wrote it: the brief carries it and says so.
  const shownRef: AnchorRef = testInBrief && testRef.state === "to create" ? { ...testRef, state: "existing" } : testRef;
  return [
    ...header(input, "RED"),
    "",
    TESTS_TO_WRITE_HEADING,
    ...(correction === null
      ? testsTable(step)
      : [correctionOfFinding(correction[1], correction[2]), WRITE_FAILING_TESTS_FOR_FINDING]),
    ...(step.note.length > 0 ? ["", ...step.note] : []),
    "",
    FILES_HEADING,
    testFileLine(refLine(shownRef), testFileRule(testRef.state, testInBrief)),
    doublesLine(doubles === "" ? NONE_NAMED : doubles),
    ...(step.anchor?.production ?? []).map((r) => productionLine(stubs.includes(r.path) ? SIGNATURE_STUB_AT_MOST : READ_ONLY_NEVER_WRITE, refLine(r))),
    ...carried.lines,
    "",
    RULES_HEADING,
    testFilesOnlyRule(testsWhere(layout)),
    ...(stubs.length === 0 ? [] : [
      stubsRule(stubs.map((p) => `\`${p}\` (${stubKind(step, p)})`).join(", ")),
      STUB_IMPORT_RULE,
    ]),
    ONE_TEST_PER_ROW_RULE,
    levelRule(step),
    redRunRule(input.testCommand),
    `- ${NODE_READ_RULE}`,
    `- ${BOUNDED_READ_RULE}`,
    `- ${NODE_EDIT_RULE}`,
    `- ${ASSUMPTION_RULE}`,
    "",
    RED_ANSWER,
  ].join("\n");
}

/** The implementer's brief: the least production code that turns the red tests green, tests read-only. */
export function greenContract(input: ContractInput, red: { tail: string; log: string | null }): string {
  const { sheet, layout } = input;
  const steps = input.cycle !== undefined && input.cycle.length > 0 ? input.cycle : [input.step];
  const elements = sheet.codeElements.length === 0 ? [NONE_LISTED] : sheet.codeElements;
  const testFiles = [...new Set(steps.map((s) => testFileOf(s) ?? "(none)"))];
  const production = steps.flatMap((s) => s.anchor?.production ?? []);
  const carried = carriedSection(input);
  // A production file to create exists once RED stubbed it: the brief carries it and says so.
  const shown = (r: AnchorRef): string => carried.whole.has(r.path)
    ? inThisBrief(refLine(r, r.state === "to create" ? STUBBED_AT_RED : r.state))
    : refLine(r);
  const seen = new Set<string>();
  return [
    ...header(input, "GREEN", steps),
    "",
    RED_TESTS_HEADING,
    ...steps.flatMap((s) => [...(steps.length > 1 ? [stepLabel(s.number, s.title)] : []), ...testsTable(s)]),
    lastRedRun(testFiles.every((f) => carried.whole.has(f)), testFiles.map((f) => `\`${f}\``).join(", "), red.log),
    "```",
    red.tail,
    "```",
    "",
    PRODUCTION_HEADING,
    ...production.filter((r) => !seen.has(refLine(r)) && seen.add(refLine(r)) !== undefined).map((r) => `- ${shown(r)}`),
    CODE_ELEMENTS_LINE,
    ...elements,
    appliedRulesLine(sheet.appliedRules, sheet.accessCost),
    ...carried.lines,
    "",
    RULES_HEADING,
    neverWriteTestRule(testsWhere(layout)),
    LEAST_CODE_RULE,
    greenRunRule(input.testCommand),
    `- ${NODE_READ_RULE}`,
    `- ${BOUNDED_READ_RULE}`,
    `- ${NODE_EDIT_RULE}`,
    `- ${ASSUMPTION_RULE}`,
    "",
    GREEN_ANSWER,
  ].join("\n");
}

/** The block that ends a role's prompt with the `stale:` lines the next batch's review handed the launch (its Major
 *  rows); "" without any. */
export function staleBlock(lines: readonly string[]): string {
  const kept = lines.map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l !== "");
  return kept.length === 0 ? "" : [STALE_HEADING, ...kept].join("\n");
}
