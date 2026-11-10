// The sources the text-isolation guard is run on, what each one holds, and the files of the repository it reads.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { TEXT_EXCEPTIONS, TEXT_FILE_EXCEPTIONS, logicProblems, proseProblems, scanFile } from "./text-isolation.ts";
import type { LogicFinding, ScannedFile, TextException, TextLiteral } from "./text-isolation.ts";

const ROOT = posix.join(posix.dirname(fileURLToPath(import.meta.url)), "../..");

/** Every .ts file under `dir` (no declaration), by repository path, in sorted order. */
export function filesUnder(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(posix.join(ROOT, dir)).sort()) {
    if (e.startsWith(".") || e === "node_modules") continue;
    const rel = posix.join(dir, e);
    if (statSync(posix.join(ROOT, rel)).isDirectory()) filesUnder(rel, acc);
    else if (rel.endsWith(".ts") && !rel.endsWith(".d.ts")) acc.push(rel);
  }
  return acc;
}

let scanned: readonly ScannedFile[] | null = null;

/** Every .ts file of src/, read and parsed once for every test of the repository. */
export function srcScan(): readonly ScannedFile[] {
  scanned ??= filesUnder("src").map((file) => scanFile(file, readFileSync(posix.join(ROOT, file), "utf-8")));
  return scanned;
}

/** The prose literals no exception allows, over the scanned files, one line each. */
export const repositoryProse = (files: readonly ScannedFile[]) => files.flatMap((f) => proseProblems(f.file, f.literals));

/** The logic of the text files no exception allows, over the scanned files, one line each. */
export const repositoryLogic = (files: readonly ScannedFile[]) => files.flatMap((f) => logicProblems(f.file, f.logic));

/** The owners of what the scanned files hold, each with its file: the literals of the logic files, or the logic of
 *  the text files. */
export const ownersIn = (files: readonly ScannedFile[], found: "literals" | "logic") =>
  files.flatMap((f) => f[found].map((item) => ({ file: f.file, owner: item.owner })));

/** The exceptions each list of the guard holds, with the kind of thing it allows. */
export const EXCEPTION_LISTS = [
  { found: "literals", exceptions: TEXT_EXCEPTIONS },
  { found: "logic", exceptions: TEXT_FILE_EXCEPTIONS },
] as const;

/** Literals as `<line>:<owner>`, the text left out. */
export const ownersOf = (literals: readonly TextLiteral[]) => literals.map((l) => `${l.line}:${l.owner}`);

/** Logic found in a text file as `<line>:<construct>:<owner>`. */
export const constructsOf = (logic: readonly LogicFinding[]) => logic.map((l) => `${l.line}:${l.construct}:${l.owner}`);

interface LogicCase { name: string; source: string; expected: string[] }

/** The file the logic cases stand in: a text file of an application folder. */
export const LOGIC_CASE_FILE = "src/crews/dev-plan/application/prompts.ts";

/** What a text file may not hold, as `<line>:<construct>:<owner>`. */
export const LOGIC_CASES: readonly LogicCase[] = [
  {
    name: "flags an async function and its await",
    source: "export async function brief(read: () => Promise<string>) {\n  return `read: ${await read()}`;\n}",
    expected: ["1:async:brief", "2:await:brief"],
  },
  {
    name: "flags a loop and a variable that changes",
    source: "export function fit(rows: string[]) {\n  let room = 10;\n  for (const row of rows) room -= row.length;\n  return room;\n}",
    expected: ["2:let:fit", "3:for:fit"],
  },
  { name: "flags a while loop", source: "export function f(n: number) {\n  while (n > 0) n--;\n  return n;\n}", expected: ["2:while:f"] },
  {
    name: "flags a switch and a try",
    source: "export function f(k: string) {\n  switch (k) { default: }\n  try { return k; } catch { return \"\"; }\n}",
    expected: ["2:switch:f", "3:try:f"],
  },
  { name: "flags a class", source: "export class Brief {}", expected: ["1:class:Brief"] },
  { name: "flags a var", source: "export var count = 0;", expected: ["1:var:(module)"] },
  {
    name: "flags a value imported from an application module, by its name",
    source: `import { carry, cut } from "./brief.ts";`,
    expected: ["1:value imported from ./brief.ts:carry", "1:value imported from ./brief.ts:cut"],
  },
  {
    name: "flags a value imported from a port or from infrastructure",
    source: `import { NO_CLOCK } from "../../../shared/application/ports.ts";\nexport { tools } from "../../../shared/infrastructure/globals.ts";`,
    expected: ["1:value imported from ../../../shared/application/ports.ts:NO_CLOCK", "2:value imported from ../../../shared/infrastructure/globals.ts:tools"],
  },
];

/** What a text file may hold: text, and the values it renders. */
export const TEXT_CASES: readonly LogicCase[] = [
  {
    name: "allows a constant and a template function with a ternary, a .map and a .join",
    source: "export const HEADING = \"## Plan\";\nexport const steps = (s: string[], done: boolean) =>\n  [done ? \"done\" : \"open\", ...s.map((x) => `- ${x}`)].join(\"\\n\");",
    expected: [],
  },
  {
    name: "allows an early return in a template function",
    source: "export function hint(name: string) {\n  if (name === \"\") return \"\";\n  return `see ${name}`;\n}",
    expected: [],
  },
  {
    name: "allows values from another text file and from a domain module",
    source: `import { RULE } from "./markers.ts";\nimport { AXES } from "../domain/audit-answer.ts";\nimport { BOUNDED_READ_RULE } from "../../../shared/domain/dev/reading-rule.ts";`,
    expected: [],
  },
  {
    name: "allows a type imported from anywhere",
    source: `import type { Clock } from "../../../shared/application/ports.ts";\nimport { type Shell } from "../../../shared/application/ports.ts";`,
    expected: [],
  },
];

/** A loop in a logic file: none of the text-file check's business. */
export const LOOP_SOURCE = "export function f(rows: string[]) {\n  let n = 0;\n  for (const r of rows) n += r.length;\n  return n;\n}";

/** A text file importing a value from an application module, and the exception that allows it. */
export const EXCEPTED_IMPORT = {
  file: "src/commands/_lib/settings/messages.ts",
  source: `import { USER_CONFIG_FILE_PATH, OTHER } from "../../../shared/application/config-store.ts";`,
};

interface LiteralCase { name: string; source: string; expected: string[] }

/** What the detector flags, as `<line>:<owner>`. */
export const PROSE_CASES: readonly LiteralCase[] = [
  {
    name: "flags a sentence of three words or more, owned by its constant",
    source: `const REFUSED = "the branch is protected";`,
    expected: ["1:REFUSED"],
  },
  {
    name: "flags a long text with a space and a word, owned by its property",
    source: `const o = {\n  hint: "see docs/architecture.md#where-text-lives-for-the-layers-and-their-text-files today",\n};`,
    expected: ["2:hint"],
  },
  {
    name: "flags the static parts of a template joined, owned by its function",
    source: "function refused(branch: string) {\n  return `refused on ${branch}: switch to a work branch`;\n}",
    expected: ["2:refused"],
  },
  {
    name: "flags a message about a shell command",
    source: `const failed = "git status could not run: ";`,
    expected: ["1:failed"],
  },
  {
    name: "names the module as the owner of a literal outside any declaration",
    source: `console.log("nothing to commit here");`,
    expected: ["1:(module)"],
  },
];

/** What the detector leaves alone: code that only looks like text. */
export const CODE_CASES: readonly LiteralCase[] = [
  { name: "leaves a path alone", source: `const P = "src/shared/domain/dev/prompts.ts";`, expected: [] },
  { name: "leaves a flag alone", source: `const F = "--untracked-files=all";`, expected: [] },
  { name: "leaves a regex source alone", source: `const R = new RegExp("^(?:\\\\s*[-*] )?(\\\\w+): (.+)$", "u");`, expected: [] },
  { name: "leaves an identifier and a constant name alone", source: `const I = ["buildTurnPrompt", "MAX_PLAN_CHARS", "ok"];`, expected: [] },
  { name: "leaves a short shell command alone", source: `const C = "git remote get-url origin";`, expected: [] },
  { name: "leaves an import specifier alone", source: `import { a } from "the three words";`, expected: [] },
  { name: "leaves a literal type alone", source: `type Mode = "ask me every time" | "never";`, expected: [] },
  { name: "leaves a property name alone", source: `const o = { "a key of three words": 1 };`, expected: [] },
];

/** Which files are text files, the guard never reads. */
export const TEXT_FILE_CASES: readonly { file: string; text: boolean }[] = [
  { file: "src/crews/main-loop/application/prompts.ts", text: true },
  { file: "src/commands/_lib/dev/messages.ts", text: true },
  { file: "src/shared/domain/dev/markers.ts", text: true },
  { file: "src/crews/main-loop/domain/prompts/search.ts", text: true },
  { file: "src/shared/domain/dev/reviewer-charter.ts", text: true },
  { file: "src/shared/domain/built-in-charters.ts", text: true },
  { file: "src/shared/domain/dev/design-rules.ts", text: true },
  { file: "src/shared/domain/reading-rule.ts", text: true },
  { file: "src/crews/main-loop/domain/prompt-assembly.ts", text: false },
  { file: "src/commands/_lib/dev/dev.ts", text: false },
];

/** A sentence a text file and a declaration file may hold. */
export const SENTENCE_SOURCE = `export const TEXT = "the model reads this sentence";`;

/** A command's description, the one exception, and a sentence beside it. */
export const COMMAND_SOURCE = [
  `defineCommand({`,
  `  name: "dev-plan",`,
  `  description: "Plan a settled spec as batches of work",`,
  `  run: () => "nothing to plan here yet",`,
  `});`,
].join("\n");

export const COMMAND_FILE = "src/commands/dev/dev-plan.cmd.ts";

/** An exception that names a property no source holds. */
export const STALE_EXCEPTION: TextException = { file: "src/commands/**/*.cmd.ts", name: "summary", reason: "a test" };

/** The exception of the command descriptions, the one a command file uses. */
export const DESCRIPTION_EXCEPTION = TEXT_EXCEPTIONS.find((e) => e.name === "description") as TextException;
