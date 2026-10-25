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

/** `test_project` for one Project cell: the affected tests of a later run. */
export function projectCommandFor(commands: RepoPackCommands, project: string): TestCommand {
  const byProject = commands.testProject?.trim();
  if (!byProject) return { ok: false, reason: "the pack has no commands.test_project" };
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
  if (existingStubsOf(step).includes(path)) return "existing: only a declaration the new tests import and it lacks";
  return "a stub an earlier RED of this cycle wrote";
}

/** Where the tests live, as the pack says: its test folder, and its test file patterns. */
function testsWhere(layout: RepoPackLayout): string {
  const parts = [
    ...(layout.tests?.trim() ? [`under \`${layout.tests.trim()}\``] : []),
    ...(layout.testFiles ?? []).filter((p) => p.trim() !== "").map((p) => `\`${p.trim()}\``),
  ];
  return parts.length === 0 ? "the test files" : parts.join(" or ");
}

const CORRECTION = /^Correction (C\d+) — (.*)$/;
const ASSUMPTION_RULE = "A question that changes no scope, id or design decision is settled by you: say it as a line " +
  "`Assumption: <what you assumed>`, only for a behaviour the plan leaves open (an error, a rounding, an edge), once. " +
  "A test value, a stub's wording or a file's state is your choice or a fact, never an assumption.";

/** One anchor as a brief line; `shown` overrides the state it says (a file the sheet says to create, stubbed since). */
function refLine(ref: AnchorRef, shown: string = ref.state): string {
  const at = ref.line === undefined ? ref.path : `${ref.path}:${ref.line}`;
  if (ref.state === "member") return `\`${at}\` — \`${ref.member}\` (read that member with node_read, never the file whole)`;
  return `\`${at}\` — ${shown}`;
}

/** How the test author works on its test file: creates it whole when it is to create, else adds to it by node; one
 *  carried in the brief is not read again. */
function testFileRule(state: string, inBrief: boolean): string {
  if (inBrief) return "its text is in this brief (node_outline for the anchor at most): add the tests with node_insert inside its suite, never rewrite it whole";
  return state === "to create"
    ? "create it with file_write; once it exists, add to it by node"
    : "read it by node (node_outline, then node_read), add the tests with node_insert inside its suite, never rewrite it whole";
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

function header(input: ContractInput, role: string, steps: readonly ImplementStep[] = [input.step]): string[] {
  const { sheet } = input;
  const what = steps.length === 1
    ? `step ${steps[0].number}: ${steps[0].title}`
    : `steps ${steps.map((s) => s.number).join(", ")} (one behaviour): ${steps.map((s) => s.title).join("; ")}`;
  const allIds = [...new Set(steps.flatMap((s) => s.tests.flatMap((t) => t.ids)))].join(", ") || "none named";
  return [
    `# ${role} — ${input.code} batch ${sheet.batch ?? "?"}, ${what}`,
    "",
    `Sheet: \`${input.sheetPath}\` (do not edit it: code ticks its boxes). Ids: ${steps.length === 1 ? ids(steps[0]) : allIds}.`,
  ];
}

function testsTable(step: ImplementStep): string[] {
  return step.tests.map((t, i) => `${i + 1}. \`${t.name}\` — ${t.level}, project \`${t.project}\`, ${t.ids.join(", ") || "no id"}`);
}

/** The test author's brief: write the step's tests, all red, test files only. */
/** The most carried text a role's brief holds, in characters. */
export const CARRIED_CONTRACT_CHARS = 12_000;

/** The carried texts as a section of the brief (or nothing), and the files it holds whole. */
function carriedSection(input: ContractInput): { lines: string[]; whole: ReadonlySet<string> } {
  const { blocks, whole } = carry(input.carried ?? [], CARRIED_CONTRACT_CHARS);
  return { lines: blocks.length === 0 ? [] : ["", "## In this brief (do not open these files again)", ...blocks], whole };
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
    "## The tests to write",
    ...(correction === null
      ? testsTable(step)
      : [`A correction (${correction[1]}) of an audit's finding: ${correction[2]}`,
        "Write the test (or tests) that fail on this finding today; the names are yours, in the style of the file."]),
    ...(step.note.length > 0 ? ["", ...step.note] : []),
    "",
    "## Files",
    `- test file: ${refLine(shownRef)} — ${testFileRule(testRef.state, testInBrief)}`,
    `- shared doubles and builders: ${doubles === "" ? "none named" : doubles}`,
    ...(step.anchor?.production ?? []).map((r) => `- production it will drive (${stubs.includes(r.path) ? "a signature stub at most" : "read only, never write"}): ${refLine(r)}`),
    ...carried.lines,
    "",
    "## Rules",
    `- Write test files only (${testsWhere(layout)}): no production line; a test failing on a missing symbol is red.`,
    ...(stubs.length === 0 ? [] : [
      `- The one exception: signature stubs, declarations that throw "not implemented" and hold no logic, in ${stubs.map((p) => `\`${p}\` (${stubKind(step, p)})`).join(", ")}.`,
      "- A test whose import of a missing declaration fails the whole test file is not the red asked: stub the declaration, never work around the import.",
    ]),
    "- One test per row of the table, its name as written; the passing path first, then the refusals.",
    levelRule(step),
    `- Run \`${input.testCommand}\` with run_tests once the tests are written: every new test must fail; the result lists the failed tests, so the log stays closed. Code runs it again after you.`,
    `- ${NODE_READ_RULE}`,
    `- ${BOUNDED_READ_RULE}`,
    `- ${NODE_EDIT_RULE}`,
    `- ${ASSUMPTION_RULE}`,
    "",
    "Answer with the test names you wrote, the test file, and the reason each one fails.",
  ].join("\n");
}

/** The implementer's brief: the least production code that turns the red tests green, tests read-only. */
export function greenContract(input: ContractInput, red: { tail: string; log: string | null }): string {
  const { sheet, layout } = input;
  const steps = input.cycle !== undefined && input.cycle.length > 0 ? input.cycle : [input.step];
  const elements = sheet.codeElements.length === 0 ? ["none listed"] : sheet.codeElements;
  const testFiles = [...new Set(steps.map((s) => testFileOf(s) ?? "(none)"))];
  const production = steps.flatMap((s) => s.anchor?.production ?? []);
  const carried = carriedSection(input);
  // A production file to create exists once RED stubbed it: the brief carries it and says so.
  const shown = (r: AnchorRef): string => carried.whole.has(r.path)
    ? `${refLine(r, r.state === "to create" ? "existing (stubbed at RED)" : r.state)}, in this brief`
    : refLine(r);
  const seen = new Set<string>();
  return [
    ...header(input, "GREEN", steps),
    "",
    "## The red tests",
    ...steps.flatMap((s) => [...(steps.length > 1 ? [`Step ${s.number} — ${s.title}:`] : []), ...testsTable(s)]),
    `Test file (read only${testFiles.every((f) => carried.whole.has(f)) ? ", in this brief" : ""}): ${testFiles.map((f) => `\`${f}\``).join(", ")}. Last red run${red.log === null ? "" : ` (whole output: \`${red.log}\`)`}:`,
    "```",
    red.tail,
    "```",
    "",
    "## Production",
    ...production.filter((r) => !seen.has(refLine(r)) && seen.add(refLine(r)) !== undefined).map((r) => `- ${shown(r)}`),
    "Code elements of the batch:",
    ...elements,
    `Applied rules: ${sheet.appliedRules || "none named"}. Expected access cost: ${sheet.accessCost || "not stated"}.`,
    ...carried.lines,
    "",
    "## Rules",
    `- Never write a test file (${testsWhere(layout)}): the tests are read-only to you.`,
    "- The least code that turns these tests green; then refactor, and delete what that orphaned.",
    `- Run \`${input.testCommand}\` with run_tests until it passes; run_build when the build is in doubt. Code runs the tests again after you.`,
    `- ${NODE_READ_RULE}`,
    `- ${BOUNDED_READ_RULE}`,
    `- ${NODE_EDIT_RULE}`,
    `- ${ASSUMPTION_RULE}`,
    "",
    "Answer with the files you changed and one line `Cost: <reads> reads, <writes> writes; <where a port call sits in a loop, a lambda or a memory filter, or none>`.",
  ].join("\n");
}
