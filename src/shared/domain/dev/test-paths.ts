// Which paths of a repository are its tests, by its pack: under `layout.tests`, or matching one pattern of
// `layout.test_files` (tests beside the code, `src/*.test.ts`; `*` spans folders, as the gate reads a pattern).
// /dev-implement reads it to tell the test author's changes from the implementer's. Pure.
import { globMatches } from "../agent-policy/permission.ts";
import type { RepoPackLayout } from "./repo-pack.ts";

/** A path relative to the project: no `/workspace/` or `./` in front, no `/` behind. */
export function relativePath(path: string): string {
  let p = path.trim();
  if (p.startsWith("/workspace/")) p = p.slice("/workspace/".length);
  while (p.startsWith("./")) p = p.slice(2);
  return p.replace(/\/+$/, "");
}

/** Whether `path` lies under `folder` (a relative folder of the pack's layout). */
export function under(path: string, folder: string): boolean {
  const f = folder.replace(/^\.\//, "").replace(/\/+$/, "");
  return f === "" || f === "." || path === f || path.startsWith(`${f}/`);
}

export function matchesAny(path: string, patterns: readonly string[]): boolean {
  const p = relativePath(path);
  return patterns.some((raw) => {
    const pattern = relativePath(raw);
    return pattern !== "" && globMatches(pattern, p);
  });
}

/** Whether the pack can tell a test file at all: a test folder or a test file pattern. */
export function hasTestLayout(layout: Pick<RepoPackLayout, "tests" | "testFiles">): boolean {
  return (layout.tests?.trim() ?? "") !== "" || (layout.testFiles ?? []).some((p) => p.trim() !== "");
}

export function isTestPath(path: string, layout: Pick<RepoPackLayout, "tests" | "testFiles">): boolean {
  const p = relativePath(path);
  const folder = layout.tests?.trim() ?? "";
  if (folder !== "" && under(p, relativePath(folder))) return true;
  return matchesAny(p, layout.testFiles ?? []);
}
