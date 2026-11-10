// The sources the text-isolation guard is run on, what each one holds, and the files of the repository it reads.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { TEXT_EXCEPTIONS, textProblems } from "./text-isolation.ts";
import type { TextException, TextLiteral } from "./text-isolation.ts";

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

/** Every .ts file of src/ with its text. */
export const srcFiles = () => filesUnder("src").map((file) => ({ file, text: readFileSync(posix.join(ROOT, file), "utf-8") }));

/** The prose literals no exception allows, over the given files, one line each. */
export const repositoryProblems = (files: readonly { file: string; text: string }[]) =>
  files.flatMap(({ file, text }) => textProblems(file, text));

/** Literals as `<line>:<owner>`, the text left out. */
export const ownersOf = (literals: readonly TextLiteral[]) => literals.map((l) => `${l.line}:${l.owner}`);

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
