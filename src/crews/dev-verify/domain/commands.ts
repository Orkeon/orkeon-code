// The shell lines /dev-verify runs, every one frozen here so that the gate, the capture
// and their tests share one spelling. The runtime's shell runs a command line without
// operators: quoting is the only syntax used. A builder gives null when a path or name
// cannot be quoted, or when a list it needs is left empty once the unquotable entries are
// dropped; its caller says the item is not captured. Pure.

const PLAIN_WORD = /^[A-Za-z0-9_./@+,:=-]+$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_FIND_PATHS = 200;

/** The word as the shell gets it: as is when /^[A-Za-z0-9_./@+,:=-]+$/, else single-quoted; null when it holds a "'". */
export function shellWord(value: string): string | null {
  if (PLAIN_WORD.test(value)) return value;
  if (value.includes("'")) return null;
  return `'${value}'`;
}

/** AC:104: a folder name, not a path. */
export function buildOutputProblem(name: string): string | undefined {
  return name === "" || name === "." || name === ".." || name.includes("/")
    ? `layout.build_outputs takes folder names, not paths: ${name}`
    : undefined;
}

/** ["':(exclude,glob)**\/bin/**'", …], one per layout.build_outputs entry (AC:101-106). */
export function excludePathspecs(buildOutputs: readonly string[]): string[] {
  const out: string[] = [];
  for (const o of buildOutputs) {
    const word = shellWord(`:(exclude,glob)**/${o}/**`);
    if (word !== null) out.push(word);
  }
  return out;
}

export const GIT_CHANGED_TRACKED = "git diff --name-only HEAD";
export const GIT_DIFF_CHECK = "git diff --check HEAD";
export const GIT_ORIGIN_HEAD = "git rev-parse --abbrev-ref origin/HEAD";

function line(parts: ReadonlyArray<string | readonly string[]>): string {
  return parts.flat().filter((p) => p !== "").join(" ");
}

/** The quotable words of `values`; null when a non-empty list keeps none. */
function words(values: readonly string[]): string[] | null {
  const out = values.map(shellWord).filter((w): w is string => w !== null);
  return values.length > 0 && out.length === 0 ? null : out;
}

/** The reason a caller gives when a builder returned null for an unquotable list. */
export const UNQUOTABLE_SCOPE = "not captured: unquotable scope";

export function gitUntracked(excludes: readonly string[]): string {
  return line(["git ls-files --others --exclude-standard -- .", excludes]);
}

export function gitTraitGrep(ere: string, scope: readonly string[], excludes: readonly string[]): string | null {
  const scopeWords = words(scope);
  return scopeWords === null ? null : line([`git grep --untracked -I -noE -e '${ere}' --`, scopeWords, excludes]);
}

export function gitStatusShort(excludes: readonly string[]): string {
  return line(["git status --short -- .", excludes]);
}

export function gitDiffTracked(path: string): string | null {
  const word = shellWord(path);
  return word === null ? null : `git diff HEAD -- ${word}`;
}

export function gitDiffUntracked(path: string): string | null {
  const word = shellWord(path);
  return word === null ? null : `git diff --no-index -- /dev/null ${word}`;
}

export function gitMethodGrep(methods: readonly string[], testDirs: readonly string[], excludes: readonly string[]): string | null {
  const methodWords = words(methods);
  const dirWords = words(testDirs);
  if (methodWords === null || dirWords === null) return null;
  return line(["git grep --untracked -I -n -o -w -F", methodWords.flatMap((m) => ["-e", m]), "--", dirWords, excludes]);
}

export function gitTestFilesNaming(
  type: string, testDirs: readonly string[], ext: string, excludes: readonly string[],
): string | null {
  if (!IDENTIFIER.test(type)) return null;
  const specs: string[] = [];
  for (const dir of testDirs) {
    const d = dir.replace(/\/+$/, "");
    const word = shellWord(d === "" || d === "." ? `:(glob)**/*.${ext}` : `:(glob)${d}/**/*.${ext}`);
    if (word === null) return null;
    specs.push(word);
  }
  return line([`git grep --untracked -I -lw -e ${type} --`, specs, excludes]);
}

/** `find ./<path>… -maxdepth 0 -newer <log>`: "./" keeps a name such as "-delete" a path; null for an absolute path. */
export function findNewer(paths: readonly string[], log: string): string | null {
  if (paths.length === 0 || paths.length > MAX_FIND_PATHS) return null;
  if (paths.some((p) => p.startsWith("/"))) return null;
  const pathWords = paths.map((p) => shellWord(p.startsWith("./") ? p : `./${p}`));
  const logWord = shellWord(log);
  if (logWord === null || pathWords.some((w) => w === null)) return null;
  return line(["find", pathWords as string[], `-maxdepth 0 -newer ${logWord}`]);
}
