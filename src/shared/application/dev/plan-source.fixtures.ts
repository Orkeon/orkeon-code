// The work folder, the listings and the tokens resolvePlanSource and readPlanSource are tested on.
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import type { WorkFolder } from "./resolve-work-folder.ts";
import { MAX_SOURCE_CHARS } from "./plan-source.ts";
import type { ResolvedSource } from "./plan-source.ts";
import { WORKSPACE } from "../../domain/dev/path-rebase.ts";

export const WORK: WorkFolder = {
  folder: "workbench", vfsPath: `${WORKSPACE}/workbench`, outcome: "applied", request: null, exists: true, note: null,
};

/** WORK outside the mounts: a host path with no virtual path, as from a linked worktree. */
export const WORK_OUTSIDE: WorkFolder = { ...WORK, folder: "/home/dev/repo/workbench", vfsPath: null, outcome: "main-worktree" };

const SPEC_TEXT = "# trim — Trim stale entries\n### UC-01 — Trim the store\n";

/** Files whose work folder holds a folder per code (listing the names given) and a README.md. */
export function setup(codes: Record<string, string[]> = {}): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(`${WORKSPACE}/workbench`, [...Object.keys(codes).map((c) => `${c}/`), "README.md"]);
  for (const [code, names] of Object.entries(codes)) files.listings.set(`${WORKSPACE}/workbench/${code}`, names);
  return files;
}

/** The source resolved for a code, its file in `folderShown`. */
export const source = (kind: "spec" | "change", code: string, folderShown: string, file: string): ResolvedSource => ({
  kind, code, prefix: code.toUpperCase(), folderShown, sourceShown: `${folderShown}/${file}`,
});

export const TRIM_SOURCE = source("spec", "trim", "workbench/trim", "SPEC-trim.md");

/** setup(), the spec of trim one parsable text longer than MAX_SOURCE_CHARS. */
export function longTrimSpec(): FakeFiles {
  const files = setup();
  files.files.set(`${WORKSPACE}/workbench/trim/SPEC-trim.md`, SPEC_TEXT + "x".repeat(MAX_SOURCE_CHARS));
  return files;
}

/** setup(), the spec of trim unreadable with a two-line error. */
export function unreadableTrimSpec(): FakeFiles {
  const files = setup();
  files.readErrors.set(`${WORKSPACE}/workbench/trim/SPEC-trim.md`, new Error("permission denied\nsecond line"));
  return files;
}

interface RefusedCode { name: string; codes: Record<string, string[]>; token: string; text: string }

/** Code folders holding neither source file, or both. */
export const REFUSED_CODES: readonly RefusedCode[] = [
  {
    name: "a folder with neither file", codes: { trim: ["SPEC-other.md"] }, token: "trim",
    text: "dev-plan: workbench/trim/ holds no SPEC-trim.md nor CHANGE-trim.md",
  },
  {
    name: "a code with no folder", codes: {}, token: "absent",
    text: "dev-plan: workbench/absent/ holds no SPEC-absent.md nor CHANGE-absent.md",
  },
  {
    name: "a folder with both files", codes: { trim: ["SPEC-trim.md", "CHANGE-trim.md"] }, token: "trim",
    text: "dev-plan: workbench/trim/ holds both SPEC-trim.md and CHANGE-trim.md: name the file",
  },
];

/** Paths to a source, relative or under /workspace/, and the source each resolves to. */
export const SOURCE_PATHS: ReadonlyArray<{ name: string; token: string; source: ResolvedSource }> = [
  { name: "a relative path", token: "docs/specs/SPEC-trim.md", source: source("spec", "trim", "docs/specs", "SPEC-trim.md") },
  {
    name: `a path under ${WORKSPACE}/`, token: `${WORKSPACE}/workbench/slow/CHANGE-slow.md`,
    source: source("change", "slow", "workbench/slow", "CHANGE-slow.md"),
  },
];

/** Tokens that are neither a code nor a SPEC-/CHANGE- path. */
export const NOT_SOURCES: readonly string[] = ["workbench/trim/TRIM-PLAN.md", "../SPEC-trim.md", "/etc/SPEC-trim.md", "a b"];

/** Paths to a source under .claude/, however written. */
export const UNDER_CLAUDE: readonly string[] = [
  ".claude/local/SPEC-trim.md", `${WORKSPACE}/.claude/SPEC-trim.md`, `${WORKSPACE}/./.claude/SPEC-trim.md`,
  `${WORKSPACE}//.claude/SPEC-trim.md`, "././.claude/SPEC-trim.md",
];
