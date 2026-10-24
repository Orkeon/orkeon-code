// The two briefs of a step, made by code from the sheet and the pack (never by a model): the RED
// contract the test author works from and the GREEN contract the implementer works from. Each
// names the batch, the ids, the behaviour, the files, the narrow test command code runs after the
// act, and the reading and editing rules. A contract never asks to read a file whole but the test
// file the author writes. Pure.
import type { RepoPackCommands, RepoPackLayout } from "../../../shared/domain/dev/repo-pack.ts";
import { PLACEHOLDER, plainWords, valueProblem } from "../../../shared/domain/dev/test-commands.ts";
import { BOUNDED_READ_RULE, EXACT_EDIT_RULE } from "../../../shared/domain/dev/reading-rule.ts";
import type { AnchorRef, ImplementSheet, ImplementStep } from "./step-section.ts";

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
  return plainWords(command) ? { ok: true, command } : { ok: false, reason: "a shell operator outside double quotes" };
}

/** The narrow command that runs the step's tests: `test_class`, else `test_project`; never the whole suite. */
export function testCommandFor(commands: RepoPackCommands, step: ImplementStep): TestCommand {
  const file = testFileOf(step);
  if (file === null) return { ok: false, reason: `step ${step.number} names no test file in ## Anchors` };
  const values = { project: step.tests[0]?.project ?? "", klass: classOf(file) };
  const byClass = commands.testClass?.trim();
  if (byClass) return fill(byClass, values);
  const byProject = commands.testProject?.trim();
  if (byProject) return fill(byProject, values);
  return { ok: false, reason: "the pack has no commands.test_class or commands.test_project" };
}

export interface ContractInput {
  code: string;
  sheetPath: string;
  sheet: ImplementSheet;
  step: ImplementStep;
  layout: RepoPackLayout;
  testCommand: string;
}

function refLine(ref: AnchorRef): string {
  const at = ref.line === undefined ? ref.path : `${ref.path}:${ref.line}`;
  if (ref.state === "member") return `\`${at}\` — \`${ref.member}\` (read that member by range, never the file whole)`;
  return `\`${at}\` — ${ref.state}`;
}

function ids(step: ImplementStep): string {
  return [...new Set(step.tests.flatMap((t) => t.ids))].join(", ") || "none named";
}

function levelRule(step: ImplementStep): string {
  const levels = new Set(step.tests.map((t) => t.level.toLowerCase()));
  const lines: string[] = [];
  if (levels.has("unit")) lines.push("- unit: no IO; the ports are the doubles the Anchors row names, the builders it names reused, never a new double of the same port.");
  if (levels.has("integration")) lines.push("- integration: the real adapter the test policy names, its fixture shared, nothing faked inside the adapter.");
  return lines.length === 0 ? "- the level the table names" : lines.join("\n");
}

function header(input: ContractInput, role: string): string[] {
  const { sheet, step } = input;
  return [
    `# ${role} — ${input.code} batch ${sheet.batch ?? "?"}, step ${step.number}: ${step.title}`,
    "",
    `Sheet: \`${input.sheetPath}\` (do not edit it: code ticks its boxes). Ids: ${ids(step)}.`,
  ];
}

function testsTable(step: ImplementStep): string[] {
  return step.tests.map((t, i) => `${i + 1}. \`${t.name}\` — ${t.level}, project \`${t.project}\`, ${t.ids.join(", ") || "no id"}`);
}

/** The test author's brief: write the step's tests, all red, test files only. */
export function redContract(input: ContractInput): string {
  const { step, layout } = input;
  const file = testFileOf(step) ?? "(none)";
  const doubles = step.anchor?.doubles ?? "";
  return [
    ...header(input, "RED"),
    "",
    "## The tests to write",
    ...testsTable(step),
    ...(step.note.length > 0 ? ["", ...step.note] : []),
    "",
    "## Files",
    `- test file: ${refLine(step.anchor?.testFiles[0] ?? { path: file, state: "to create" })} — you may read it whole and rewrite it`,
    `- shared doubles and builders: ${doubles === "" ? "none named" : doubles}`,
    ...(step.anchor?.production ?? []).map((r) => `- production it will drive (read only, never write): ${refLine(r)}`),
    "",
    "## Rules",
    `- Write under \`${layout.tests ?? "the test folder"}\` only: no production line, no stub; a test failing on a missing symbol is red.`,
    "- One test per row of the table, its name as written; the passing path first, then the refusals.",
    levelRule(step),
    `- Run \`${input.testCommand}\` with run_tests once the tests are written: every new test must fail. Code runs it again after you.`,
    `- ${BOUNDED_READ_RULE}`,
    `- ${EXACT_EDIT_RULE}`,
    "",
    "Answer with the test names you wrote, the test file, and the reason each one fails.",
  ].join("\n");
}

/** The implementer's brief: the least production code that turns the red tests green, tests read-only. */
export function greenContract(input: ContractInput, red: { tail: string; log: string | null }): string {
  const { step, sheet, layout } = input;
  const elements = sheet.codeElements.length === 0 ? ["none listed"] : sheet.codeElements;
  return [
    ...header(input, "GREEN"),
    "",
    "## The red tests",
    ...testsTable(step),
    `Test file (read only): \`${testFileOf(step) ?? "(none)"}\`. Last red run${red.log === null ? "" : ` (whole output: \`${red.log}\`)`}:`,
    "```",
    red.tail,
    "```",
    "",
    "## Production",
    ...(step.anchor?.production ?? []).map((r) => `- ${refLine(r)}`),
    "Code elements of the batch:",
    ...elements,
    `Applied rules: ${sheet.appliedRules || "none named"}. Expected access cost: ${sheet.accessCost || "not stated"}.`,
    "",
    "## Rules",
    `- Never write under \`${layout.tests ?? "the test folder"}\`: the tests are read-only to you.`,
    "- The least code that turns these tests green; then refactor, and delete what that orphaned.",
    `- Run \`${input.testCommand}\` with run_tests until it passes; run_build when the build is in doubt. Code runs the tests again after you.`,
    `- ${BOUNDED_READ_RULE}`,
    `- ${EXACT_EDIT_RULE}`,
    "",
    "Answer with the files you changed and one line `Cost: <reads> reads, <writes> writes; <where a port call sits in a loop, a lambda or a memory filter, or none>`.",
  ].join("\n");
}
