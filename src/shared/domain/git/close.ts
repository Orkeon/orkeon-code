// The git close of a change: who commits (git's own identity), which files (an
// explicit list, never the work folder), the command lines that commit, push and
// merge them, and the pull request body and command handed over. Pure: nothing
// here runs a command; shared/application/git runs these lines through the Shell port.

/** Q-10's switch: `true` asks the close to open the pull request itself. Omitted = false. */
export const DEV_PR_AUTO_CONFIG_KEY = "dev.prAuto";

/** Where the message goes for `git commit -F` (relative to /workspace; never tracked). */
export const COMMIT_MESSAGE_FILE = ".git/ORKEON_COMMITMSG";
export const GIT_IDENT_COMMAND = "git var GIT_AUTHOR_IDENT";
/** A commit needs the committer too: with only GIT_AUTHOR_* set it would fail after the draft was paid for. */
export const GIT_COMMITTER_IDENT_COMMAND = "git var GIT_COMMITTER_IDENT";
/** Names as they are (an accented name is not C-quoted); untracked files one by one. */
export const GIT_STATUS_COMMAND = "git -c core.quotePath=false status --short --untracked-files=all";
export const GIT_HEAD_COMMAND = "git rev-parse --short HEAD";
export const GIT_DEFAULT_BRANCH_COMMAND = "git symbolic-ref --short refs/remotes/origin/HEAD";
export const GIT_CURRENT_BRANCH_COMMAND = "git branch --show-current";
/** A merge or a cherry-pick in progress refuses a partial commit: each probe exits 0 while one is. */
export const GIT_IN_PROGRESS_PROBES: readonly string[] = [
  "git rev-parse -q --verify MERGE_HEAD", "git rev-parse -q --verify CHERRY_PICK_HEAD",
];
/** What git says when a merge is refused only for not being a fast-forward. */
export function isNotFastForward(stderr: string): boolean {
  return /fast-forward/i.test(String(stderr ?? ""));
}

export interface GitIdent { name: string; email: string }

/** The identity of `git var GIT_AUTHOR_IDENT` (`Name <email> <time> <tz>`), null when it holds no usable email. */
export function parseGitIdent(stdout: string): GitIdent | null {
  const line = String(stdout ?? "").split("\n")[0].trim();
  const m = /^(.*?)\s*<([^<>\s]+)>/.exec(line);
  if (m === null || m[2].endsWith(".(none)")) return null;
  return { name: m[1].trim(), email: m[2] };
}

/** The two commands that give git an identity; the user types them with their own name and email. */
export const IDENTITY_HANDOVER: readonly string[] = [
  "git config --global user.name \"<your name>\"",
  "git config --global user.email <your email>",
];

/** The stop when git has no identity: git's reason, then the two commands, one per line. Never an invented identity. */
export function identityStop(detail: string, rerun: string): string {
  return [
    `✗ stopped: git has no identity for the commit (${detail}). Set one in a terminal, then re-run ${rerun}:`,
    ...IDENTITY_HANDOVER.map((c) => `  ${c}`),
  ].join("\n");
}

/** A `git status --short` path with its quotes removed (an escaped name keeps its backslashes, so it reads unsafe). */
function unquote(path: string): string {
  return path.trim().replace(/^"(.*)"$/, "$1");
}

/** Every path a `git status --short` lists, once, in order: both sides of a rename. */
export function changedPaths(status: string): string[] {
  const out: string[] = [];
  for (const line of String(status ?? "").split("\n")) {
    // `AD`: added, then deleted from the worktree; neither HEAD nor the worktree holds it, so there is nothing to commit.
    if (line.length <= 3 || line.startsWith("AD ")) continue;
    const rest = line.slice(3);
    const arrow = rest.indexOf(" -> ");
    const paths = arrow >= 0 ? [rest.slice(0, arrow), rest.slice(arrow + 4)] : [rest];
    for (const p of paths.map(unquote)) if (p.length > 0 && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * The paths already gone from the index (a staged deletion, the old side of a
 * staged rename): `git add` refuses them ("did not match any files"), while the
 * commit's own path list takes them from HEAD.
 */
export function indexDeletedPaths(status: string): string[] {
  const out: string[] = [];
  for (const line of String(status ?? "").split("\n")) {
    if (line.length <= 3) continue;
    const rest = line.slice(3);
    if (line[0] === "D") out.push(unquote(rest));
    else if (line[0] === "R" && rest.includes(" -> ")) out.push(unquote(rest.slice(0, rest.indexOf(" -> "))));
  }
  return out;
}

/** True when the runtime's shell (no shell: quote-aware split, no escape, forbidden operators) cannot carry `s`. */
export function shellUnsafe(s: string): boolean {
  return s.length === 0 || /['"\\\r\n`;|]/.test(s) || s.includes("$(") || s.includes("&&");
}

/** `s` single-quoted for a POSIX shell (a quote inside becomes `'\''`). */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function under(path: string, folder: string): boolean {
  return folder.length > 0 && (path === folder || path.startsWith(folder + "/"));
}

function bare(path: string): string {
  let p = path.trim();
  while (p.startsWith("./")) p = p.slice(2);
  return p.replace(/\/+$/, "");
}

export interface CommitSelection {
  /** The files the commit holds, in the status's order. */
  files: string[];
  /** Changed files of the work folder, left out. */
  leftOut: string[];
  /** Named paths inside the work folder: refused. */
  inWorkFolder: string[];
  /** Named paths with no change: refused. */
  unchanged: string[];
  /** Selected paths the shell cannot carry: refused. */
  unsafe: string[];
}

/**
 * The files a commit holds: the changed paths of `status` (or those equal to or
 * under a `named` path), never one of the work folder unless `namedWorkFolder`
 * lets a path named inside it through (/commit: the user's explicit choice, for a
 * work folder the repository tracks; the dev close never). A work folder given as
 * an absolute path lies outside the checkout and excludes nothing.
 */
export function selectCommitFiles(req: {
  status: string; workFolder: string; named?: readonly string[]; namedWorkFolder?: boolean;
}): CommitSelection {
  const work = req.workFolder.startsWith("/") ? "" : bare(req.workFolder);
  const changed = changedPaths(req.status);
  const inWorkFolder: string[] = [];
  const unchanged: string[] = [];
  let picked: string[] = [];
  const allowed: string[] = [];
  const named = (req.named ?? []).map(String).filter((n) => n.trim().length > 0);
  if (named.length === 0) {
    picked = changed;
  } else {
    for (const raw of named) {
      const n = bare(raw);
      if (n === "" || n === ".") { picked.push(...changed); continue; }
      if (under(n, work) && req.namedWorkFolder !== true) { inWorkFolder.push(n); continue; }
      const hits = changed.filter((p) => p === n || p.startsWith(n + "/"));
      if (hits.length === 0) unchanged.push(n);
      picked.push(...hits);
      if (under(n, work)) allowed.push(...hits);
    }
    picked = changed.filter((p) => picked.includes(p));
  }
  const out = (p: string): boolean => under(p, work) && !allowed.includes(p);
  const files = picked.filter((p) => !out(p));
  return {
    files,
    leftOut: picked.filter(out),
    inWorkFolder,
    unchanged,
    unsafe: files.filter(shellUnsafe),
  };
}

const quoted = (paths: readonly string[]): string => paths.map(shellQuote).join(" ");

// Every path list is literal: `a[1].ts` names that file, never a glob matching `a1.ts`.
export function gitAddCommand(files: readonly string[]): string {
  return `git --literal-pathspecs add -- ${quoted(files)}`;
}

/** A path list on the commit itself: changes staged elsewhere stay staged and out of it. */
export function gitCommitCommand(files: readonly string[]): string {
  return `git --literal-pathspecs commit -F ${COMMIT_MESSAGE_FILE} -- ${quoted(files)}`;
}

export function gitDiffCommand(files: readonly string[]): string {
  return `git --literal-pathspecs diff HEAD -- ${quoted(files)}`;
}

export function gitPushCommand(branch: string): string {
  return `git push -u origin ${shellQuote(branch)}`;
}

export function gitMergeFfOnly(ref: string): string {
  return `git merge --ff-only ${shellQuote(ref)}`;
}

export function gitRebaseIn(worktree: string, onto: string): string {
  return `git -C ${shellQuote(worktree)} rebase ${shellQuote(onto)}`;
}

export function gitRebaseAbortIn(worktree: string): string {
  return `git -C ${shellQuote(worktree)} rebase --abort`;
}

/** `origin/main` -> `main`; null when origin/HEAD is unset. */
export function parseDefaultBranch(stdout: string): string | null {
  const b = String(stdout ?? "").trim().replace(/^origin\//, "");
  return b.length > 0 ? b : null;
}

/** A folder name from a branch name: anything but letters, digits, `.`, `_`, `-` becomes `-`. */
export function prSlug(branch: string): string {
  const s = String(branch ?? "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "change";
}

/** `<work>/pr-<slug>/PR.md`, the body file the harness writes too. */
export function prBodyPath(workFolder: string, slug: string): string {
  return `${workFolder.replace(/\/+$/, "")}/pr-${slug}/PR.md`;
}

export interface PrSummary {
  /** The `## Batch` paragraph. */
  batch: string;
  layers: Array<{ layer: string; paths: string[] }>;
  validations?: string[];
  assumptions?: Array<{ id: string; assumption: string; by: string }>;
  audit?: string;
  notRun?: string;
}

const NONE = "None.";

/** The body of the pull request, under the template's headings, none removed or added; `None.` where nothing is said. */
export function renderPrBody(s: PrSummary): string {
  const layers = s.layers.filter((l) => l.paths.length > 0)
    .map((l) => `- ${l.layer}: ${l.paths.map((p) => `\`${p}\``).join(", ")}`);
  const validations = (s.validations ?? []).map((v) => `- ${v}`);
  const assumptions = (s.assumptions ?? []).length === 0 ? [NONE] : [
    "| Id | Assumption | To be validated by |",
    "|----|------------|--------------------|",
    ...(s.assumptions ?? []).map((a) => `| ${a.id} | ${a.assumption} | ${a.by} |`),
  ];
  const text = (v: string | undefined): string => (v ?? "").trim() || NONE;
  return [
    "## Batch", "", text(s.batch), "",
    "## Files, per layer", "", ...(layers.length > 0 ? layers : [NONE]), "",
    "## Validations", "", ...(validations.length > 0 ? validations : [NONE]), "",
    "## Assumptions to validate", "", ...assumptions, "",
    "## Audit", "", text(s.audit), "",
    "## Not run", "", text(s.notRun), "",
  ].join("\n");
}

/** The `gh pr create` line handed over, for the user's own shell; `--base` left out when unknown (gh's default). */
export function ghPrCreateCommand(req: { base: string | null; head: string; title: string; bodyFile: string }): string {
  const arg = (s: string): string => (/^[A-Za-z0-9._/@:+-]+$/.test(s) ? s : shellQuote(s));
  const base = req.base === null ? "" : ` --base ${arg(req.base)}`;
  return `gh pr create${base} --head ${arg(req.head)} --title ${shellQuote(req.title)} --body-file ${arg(req.bodyFile)}`;
}
