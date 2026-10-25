// Values the work folder rules are tested on.

export interface FolderCase {
  raw: string;
  folder: string;
}

/** Control whitespace, blanks, leading ./ and trailing / stripped. */
export const STRIPPED: readonly FolderCase[] = [
  { raw: " ./backstage/tasks/ \t", folder: "backstage/tasks" },
  { raw: "./././notes//", folder: "notes" },
  { raw: "back\nstage", folder: "backstage" },
];

/** Values that hold no folder. */
export const EMPTY_VALUES: readonly string[] = ["", "   ", "./", "\t\r\n", "./ "];

export interface RefusedCase {
  raw: string;
  reason: string;
}

/** What is not a relative folder of the checkout, with the reason. */
export const REFUSED: readonly RefusedCase[] = [
  { raw: "/abs", reason: "an absolute path" },
  { raw: "/", reason: "an absolute path" },
  { raw: "a//b", reason: "an empty segment" },
  { raw: "..", reason: "a '..' or '.' segment" },
  { raw: "a/../b", reason: "a '..' or '.' segment" },
  { raw: "../x", reason: "a '..' or '.' segment" },
  { raw: ".", reason: "a '..' or '.' segment" },
  { raw: "./.", reason: "a '..' or '.' segment" },
  { raw: "a/./b", reason: "a '..' or '.' segment" },
  { raw: ".claude", reason: "under .claude/ or .git/" },
  { raw: ".claude/x", reason: "under .claude/ or .git/" },
  { raw: ".git", reason: "under .claude/ or .git/" },
  { raw: "a\u0007b", reason: "a non-printable character" },
  { raw: "a​b", reason: "a non-printable character" },
];

/** Values breaking two rules: the first rule checked names the reason. */
export const REFUSED_IN_ORDER: readonly RefusedCase[] = [
  { raw: "/a//b", reason: "an absolute path" },
  { raw: "a//..", reason: "an empty segment" },
  { raw: ".git/..", reason: "a '..' or '.' segment" },
];

/** Folders only named like the guarded ones. */
export const LOOK_ALIKES: readonly string[] = ["docs/.claude", ".claudette"];

export interface ProblemCase {
  raw: string;
  problem: string | undefined;
}

export const VALID_VALUES: readonly string[] = ["backstage/tasks", ""];

export const PROBLEMS: readonly ProblemCase[] = [
  { raw: "/srv/work", problem: "'/srv/work' is not a relative folder of the checkout: an absolute path" },
  { raw: ".git/x", problem: "'.git/x' is not a relative folder of the checkout: under .claude/ or .git/" },
];

export interface RequestCase {
  name: string;
  config: string | undefined;
  pack: string | undefined;
}

export const PACK_FALLBACKS: readonly RequestCase[] = [
  { name: "the config unset", config: undefined, pack: "backstage/tasks" },
  { name: "the config blank", config: "  ", pack: "backstage/tasks" },
];

export const NEITHER_SET: readonly RequestCase[] = [
  { name: "both unset", config: undefined, pack: undefined },
  { name: "both blank", config: "", pack: " \t" },
];

/** A porcelain listing of the main worktree and a linked one. */
export const PORCELAIN = "worktree /workspace\nHEAD 0123abc\nbranch refs/heads/main\n\n"
  + "worktree /workspace/.claude/worktrees/p2\nHEAD 4567def\nbranch refs/heads/p2\n";

export interface ListingCase {
  name: string;
  listing: string;
  main: string | null;
}

export const LISTINGS: readonly ListingCase[] = [
  { name: "a listing of two worktrees", listing: PORCELAIN, main: "/workspace" },
  { name: "a listing with CRLF line ends", listing: "worktree /home/me/repo\r\nHEAD x\r\n", main: "/home/me/repo" },
];

export const NOT_LISTINGS: readonly ListingCase[] = [
  { name: "nothing", listing: "", main: null },
  { name: "a worktree line without a path", listing: "worktree \n", main: null },
  { name: "a git error", listing: "fatal: not a git repository\n", main: null },
];

export interface PathPairCase {
  a: string;
  b: string;
  same: boolean;
}

export const PATH_PAIRS: readonly PathPairCase[] = [
  { a: "/workspace", b: "/workspace/", same: true },
  { a: "/workspace//", b: "/workspace", same: true },
  { a: "/workspace", b: "/workspace2", same: false },
];
