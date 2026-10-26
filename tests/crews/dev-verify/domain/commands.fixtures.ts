// The arguments the frozen shell lines of /dev-verify are built from, and the lines expected.
import type {
  findNewer, gitDiffTracked, gitDiffUntracked, gitMethodGrep, gitStatusShort, gitTestFilesNaming, gitTraitGrep,
  gitUntracked, shellWord,
} from "../../../../src/crews/dev-verify/domain/commands.ts";

/** The exclude pathspecs of the build outputs `bin` and `obj`. */
export const EX: readonly string[] = ["':(exclude,glob)**/bin/**'", "':(exclude,glob)**/obj/**'"];

/** The trait pattern of a C# repository. */
export const ERE = '\\[Trait\\("BR", *"[BCU][CHR]-[0-9]+"\\)\\]';

/** One call of a line builder: its arguments and the line (or null) it gives. */
export interface LineCase<F extends (...args: never[]) => unknown> {
  name: string;
  args: Parameters<F>;
  expected: ReturnType<F>;
}

export const SHELL_WORD_CASES: readonly LineCase<typeof shellWord>[] = [
  { name: "keeps a plain path", args: ["src/Ledger/Account.cs"], expected: "src/Ledger/Account.cs" },
  { name: "keeps a word of safe punctuation", args: ["a-b_c.d/e@f+g,h:i=j"], expected: "a-b_c.d/e@f+g,h:i=j" },
  { name: "quotes a spaced word", args: ["docs/my notes.md"], expected: "'docs/my notes.md'" },
  { name: "quotes a command substitution", args: ["$(x)"], expected: "'$(x)'" },
  { name: "quotes the empty word", args: [""], expected: "''" },
  { name: "refuses a single quote", args: ["it's"], expected: null },
];

/** Build output names that are no folder name. */
export const REFUSED_BUILD_OUTPUTS: readonly string[] = ["", ".", "..", "out/bin"];

export const UNTRACKED_CASES: readonly LineCase<typeof gitUntracked>[] = [
  {
    name: "with excludes",
    args: [EX],
    expected: "git ls-files --others --exclude-standard -- . ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'",
  },
  { name: "without excludes", args: [[]], expected: "git ls-files --others --exclude-standard -- ." },
];

export const TRAIT_GREP_CASES: readonly LineCase<typeof gitTraitGrep>[] = [
  {
    name: "over two folders with excludes",
    args: [ERE, ["src", "tests"], EX],
    expected: `git grep --untracked -I -noE -e '${ERE}' -- src tests ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'`,
  },
  {
    name: "over the checkout without excludes",
    args: ["// *rule: *[BCU][CHR]-[0-9]+", ["."], []],
    expected: "git grep --untracked -I -noE -e '// *rule: *[BCU][CHR]-[0-9]+' -- .",
  },
];

export const STATUS_SHORT_CASES: readonly LineCase<typeof gitStatusShort>[] = [
  {
    name: "with excludes",
    args: [EX],
    expected: "git status --short -- . ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'",
  },
  { name: "without excludes", args: [[]], expected: "git status --short -- ." },
];

export const DIFF_TRACKED_CASES: readonly LineCase<typeof gitDiffTracked>[] = [
  { name: "a plain path", args: ["src/A.cs"], expected: "git diff HEAD -- src/A.cs" },
  { name: "a spaced path, quoted", args: ["docs/a b.md"], expected: "git diff HEAD -- 'docs/a b.md'" },
  { name: "an unquotable path", args: ["it's.md"], expected: null },
];

export const DIFF_UNTRACKED_CASES: readonly LineCase<typeof gitDiffUntracked>[] = [
  { name: "a plain path", args: ["src/B.cs"], expected: "git diff --no-index -- /dev/null src/B.cs" },
  { name: "an unquotable path", args: ["it's.md"], expected: null },
];

export const METHOD_GREP_CASES: readonly LineCase<typeof gitMethodGrep>[] = [
  {
    name: "two methods in one folder with excludes",
    args: [["ShouldA", "ShouldB"], ["tests"], EX],
    expected:
      "git grep --untracked -I -n -o -w -F -e ShouldA -e ShouldB -- tests ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'",
  },
  {
    name: "one method in two folders without excludes",
    args: [["m"], ["tests", "spec"], []],
    expected: "git grep --untracked -I -n -o -w -F -e m -- tests spec",
  },
];

/** Trait greps whose scope is left empty once its unquotable entries are dropped. */
export const TRAIT_GREP_DROPPED_CASES: readonly LineCase<typeof gitTraitGrep>[] = [
  { name: "an unquotable scope only", args: [ERE, ["it's"], EX], expected: null },
];

/** Method greps whose lists are left empty, or not, once their unquotable entries are dropped. */
export const METHOD_GREP_DROPPED_CASES: readonly LineCase<typeof gitMethodGrep>[] = [
  { name: "an unquotable method only", args: [["it's"], ["tests"], []], expected: null },
  { name: "an unquotable test folder only", args: [["m"], ["it's"], []], expected: null },
  {
    name: "an unquotable method and folder beside quotable ones, dropped",
    args: [["m", "it's"], ["tests", "it's"], []],
    expected: "git grep --untracked -I -n -o -w -F -e m -- tests",
  },
];

export const TEST_FILES_NAMING_CASES: readonly LineCase<typeof gitTestFilesNaming>[] = [
  {
    name: "two test folders with excludes",
    args: ["Account", ["tests", "."], "cs", EX],
    expected:
      "git grep --untracked -I -lw -e Account -- ':(glob)tests/**/*.cs' ':(glob)**/*.cs' ':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'",
  },
  {
    name: "the empty test folder, read as the checkout",
    args: ["Account", [""], "ts", []],
    expected: "git grep --untracked -I -lw -e Account -- ':(glob)**/*.ts'",
  },
  { name: "a dotted name", args: ["Order.Lines", ["tests"], "cs", []], expected: null },
  { name: "an unquotable test folder", args: ["Account", ["it's"], "cs", []], expected: null },
];

export const FIND_NEWER_CASES: readonly LineCase<typeof findNewer>[] = [
  {
    name: "a plain path and a spaced one, each under ./",
    args: [["src/A.cs", "a b.cs"], "workbench/x/logs/build.txt"],
    expected: "find ./src/A.cs './a b.cs' -maxdepth 0 -newer workbench/x/logs/build.txt",
  },
  {
    name: "a path read as an option, kept a path by ./",
    args: [["-delete", "src/a.ts"], "w/logs/F1-build.txt"],
    expected: "find ./-delete ./src/a.ts -maxdepth 0 -newer w/logs/F1-build.txt",
  },
  { name: "an absolute path", args: [["/etc/passwd"], "log"], expected: null },
  { name: "an unquotable path", args: [["it's"], "log"], expected: null },
  { name: "an unquotable log", args: [["a"], "it's"], expected: null },
  { name: "201 paths", args: [Array.from({ length: 201 }, (_, i) => `f${i}`), "log"], expected: null },
];

/** 200 paths: the most findNewer takes. */
export const TWO_HUNDRED_PATHS: readonly string[] = Array.from({ length: 200 }, () => "f");
