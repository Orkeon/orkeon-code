// The folders, paths and commands the memory's layout and write rules are tested on.

/** The layout of the memory folder .orkeon/memory. */
export const ORKEON_MEMORY_LAYOUT = {
  root: "/workspace/.orkeon/memory",
  candidates: "/workspace/.orkeon/memory/candidates",
  candidatesList: "/workspace/.orkeon/memory/candidates/CANDIDATES.md",
  entries: "/workspace/.orkeon/memory/entries",
  refused: "/workspace/.orkeon/memory/refused.md",
  index: "/workspace/.orkeon/memory/INDEX.md",
  golden: "/workspace/.orkeon/memory/eval/golden.yaml",
  entriesGlob: "/workspace/.orkeon/memory/entries/**/*.md",
};

/** The agent memory, a folder inside it, and one that holds it: none can be the shared memory. */
export const AGENT_MEMORY_DIRS: readonly string[] = [".orkeon/agent-memory", ".orkeon/agent-memory/shared", ".orkeon"];

/** Folders under .claude/ or .git/, in any letter case. */
export const HARNESS_DIRS: readonly string[] = [".claude", ".claude/memory", "./.claude/memory", ".Claude/memory", ".CLAUDE", ".Git/x", ".git"];

/** The memory folder of the write rules' tests. */
export const MEMORY_DIR = ".orkeon/memory";

/** Spellings of a path under the memory's candidates or entries. */
export const PROTECTED_SPELLINGS: readonly string[] = [
  "/workspace/.orkeon/memory/entries/decision/x.md", ".orkeon/memory/entries/x.md", ".orkeon/memory/candidates/CANDIDATES.md",
  "./.orkeon/memory/candidates/x.md", "/workspace/./.orkeon/memory/candidates/x.md", "/workspace//.orkeon/memory/candidates/x.md",
  ".orkeon/memory//candidates/x.md", "src/../.orkeon/memory/candidates/x.md", "../workspace/.orkeon/memory/entries/x.md",
];

/** Paths the write rules leave alone: the memory's other files, and look-alikes. */
export const FREE_PATHS: readonly string[] = [".orkeon/memory/refused.md", ".orkeon/memory/INDEX.md", "src/entries/x.md", "my.orkeon/memory/entries/x.md"];

export interface ShellRuleCase {
  name: string;
  command: string;
  decision: "deny" | undefined;
}

/** Shell commands and what the memory's write rules decide for them. */
export const SHELL_RULES: readonly ShellRuleCase[] = [
  { name: "denies a redirection into the candidates", command: "printf x > .orkeon/memory/candidates/x.md", decision: "deny" },
  { name: "denies a copy into the entries", command: "cp a.md ./.orkeon/memory/entries/decision/", decision: "deny" },
  { name: "leaves a read of refused.md", command: "cat .orkeon/memory/refused.md", decision: undefined },
];

/** Commands that name the folder's words elsewhere, or reach it in steps: the rule leaves them to the callback. */
export const SHELL_WORDS_ELSEWHERE: readonly string[] = [
  "git diff -- .orkeon/dev src/shared/domain/shared-memory/candidates.ts",
  "cd .orkeon/memory && cat refused.md",
];

export interface RefusalCase {
  name: string;
  tool: string;
  input: unknown;
  refused: boolean;
}

/** File tools: a path in any letter case reaches the folder, the memory's other files and other tools do not. */
export const PATH_REFUSALS: readonly RefusalCase[] = [
  { name: "a path in mixed case", tool: "file_write", input: { path: ".Orkeon/Memory/Entries/x.md" }, refused: true },
  { name: "an absolute path in upper case", tool: "file_write", input: { path: "/workspace/.ORKEON/memory/CANDIDATES/x.md" }, refused: true },
  { name: "a path with a double slash", tool: "file_write", input: { path: "./.orkeon//Memory/entries/a/b.md" }, refused: true },
  { name: "refused.md", tool: "file_write", input: { path: ".orkeon/memory/refused.md" }, refused: false },
  { name: "a read of an entry", tool: "file_read", input: { path: ".orkeon/memory/entries/x.md" }, refused: false },
  { name: "a path outside the folder", tool: "file_write", input: { path: "src/entries/x.md" }, refused: false },
];

/** edit_batch: one operation reaching the folder is enough. */
export const EDIT_BATCH_REFUSALS: readonly RefusalCase[] = [
  {
    name: "a batch with one operation in the entries", tool: "edit_batch", refused: true,
    input: { operations: [
      { kind: "node_replace", path: "src/a.ts", selector: "x", text: "y" },
      { kind: "ensure_section", path: "/workspace/.orkeon/memory/entries/decision/x.md", selector: "## A", text: "b" },
    ] },
  },
  {
    name: "a batch outside the folder", tool: "edit_batch", refused: false,
    input: { operations: [{ kind: "node_replace", path: "src/a.ts", selector: "x", text: "y" }] },
  },
];

/** structural_rewrite: its paths and glob, when it writes. */
export const REWRITE_REFUSALS: readonly RefusalCase[] = [
  { name: "a write on the entries", tool: "structural_rewrite", input: { paths: [".orkeon/memory/entries"], dry_run: false }, refused: true },
  { name: "a dry run by default", tool: "structural_rewrite", input: { paths: [".orkeon/memory/entries"] }, refused: false },
  { name: "the whole project reaches it", tool: "structural_rewrite", input: { glob: "**/*.md", dry_run: false }, refused: true },
  { name: "a folder that holds it", tool: "structural_rewrite", input: { paths: [".orkeon"], dry_run: false }, refused: true },
  { name: "a glob under src", tool: "structural_rewrite", input: { glob: "src/**/*.ts", dry_run: false }, refused: false },
  { name: "a glob within paths under src", tool: "structural_rewrite", input: { paths: ["src"], glob: "**/*.ts", dry_run: false }, refused: false },
];

const shell = (name: string, command: string, refused: boolean): RefusalCase =>
  ({ name, tool: "shell_command", input: { command }, refused });

/** shell_command: reaching the folder in steps or in another letter case; each step a whole path segment. */
export const SHELL_REFUSALS: readonly RefusalCase[] = [
  shell("a cd then a write", "cd .orkeon/memory && printf x > entries/a.md", true),
  shell("a copy in mixed case", "cp a.md .Orkeon/Memory/Candidates/", true),
  shell("cd steps, one quoted", "cd \".orkeon\" && cd memory && mv x entries", true),
  shell("a read of refused.md", "cat .orkeon/memory/refused.md", false),
  shell("shared-memory/candidates.ts is no step into the folder", "git diff -- .orkeon/dev src/shared/domain/shared-memory/candidates.ts", false),
  shell("the words in separate paths", "grep -r memory .orkeon/dev docs/candidates-list.md", false),
  shell("a look-alike folder", "ls .orkeon/memory-old/entries", false),
  shell("cd steps split by semicolons", "cd .orkeon; cd memory; cd entries; printf x > a.md", true),
  shell("a path with a double slash and a dot", "printf x > .orkeon//memory/./entries/a.md", true),
];
