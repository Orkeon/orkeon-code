// The two briefs of a step, made by code from the sheet and the pack (never by a model): the RED
// contract the test author works from and the GREEN contract the implementer works from. Each
// names the batch, the ids, the behaviour, the files, the narrow test command code runs after the
// act, and the reading and editing rules: by node. A contract never asks to read a file whole. Pure.
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
  /** The files open to RED as signature stubs: `stubsOf(step)`, and the stubs an earlier RED of the cycle wrote. */
  stubs?: readonly string[];
}

/** The production files a RED step may write as signature stubs: its Anchors' `to create` production paths. */
export function stubsOf(step: ImplementStep): string[] {
  return (step.anchor?.production ?? []).filter((r) => r.state === "to create").map((r) => r.path);
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
const ASSUMPTION_RULE = "A question that changes no scope, id or design decision is settled by you: say it as a line `Assumption: <what you assumed>`.";

function refLine(ref: AnchorRef): string {
  const at = ref.line === undefined ? ref.path : `${ref.path}:${ref.line}`;
  if (ref.state === "member") return `\`${at}\` — \`${ref.member}\` (read that member with node_read, never the file whole)`;
  return `\`${at}\` — ${ref.state}`;
}

/** How the test author works on its test file: creates it whole when it is to create, else adds to it by node. */
function testFileRule(state: string): string {
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
export function redContract(input: ContractInput): string {
  const { step, layout } = input;
  const file = testFileOf(step) ?? "(none)";
  const doubles = step.anchor?.doubles ?? "";
  const stubs = input.stubs ?? stubsOf(step);
  const own = stubsOf(step);
  const correction = CORRECTION.exec(step.title);
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
    `- test file: ${refLine(step.anchor?.testFiles[0] ?? { path: file, state: "to create" })} — ${testFileRule(step.anchor?.testFiles[0]?.state ?? "to create")}`,
    `- shared doubles and builders: ${doubles === "" ? "none named" : doubles}`,
    ...(step.anchor?.production ?? []).map((r) => `- production it will drive (${stubs.includes(r.path) ? "a signature stub at most" : "read only, never write"}): ${refLine(r)}`),
    "",
    "## Rules",
    `- Write test files only (${testsWhere(layout)}): no production line; a test failing on a missing symbol is red.`,
    ...(stubs.length === 0 ? [] : [`- The one exception: signature stubs in ${stubs.map((p) => `\`${p}\``).join(", ")} (${stubs.every((p) => own.includes(p)) ? "to create" : "to create, or a stub an earlier RED of this cycle wrote"}) — declarations that throw "not implemented", no logic.`]),
    "- One test per row of the table, its name as written; the passing path first, then the refusals.",
    levelRule(step),
    `- Run \`${input.testCommand}\` with run_tests once the tests are written: every new test must fail. Code runs it again after you.`,
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
  const seen = new Set<string>();
  return [
    ...header(input, "GREEN", steps),
    "",
    "## The red tests",
    ...steps.flatMap((s) => [...(steps.length > 1 ? [`Step ${s.number} — ${s.title}:`] : []), ...testsTable(s)]),
    `Test file (read only): ${testFiles.map((f) => `\`${f}\``).join(", ")}. Last red run${red.log === null ? "" : ` (whole output: \`${red.log}\`)`}:`,
    "```",
    red.tail,
    "```",
    "",
    "## Production",
    ...production.filter((r) => !seen.has(refLine(r)) && seen.add(refLine(r)) !== undefined).map((r) => `- ${refLine(r)}`),
    "Code elements of the batch:",
    ...elements,
    `Applied rules: ${sheet.appliedRules || "none named"}. Expected access cost: ${sheet.accessCost || "not stated"}.`,
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
