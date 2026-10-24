// The work folder of a checkout: where a dev workflow keeps `<work>/<code>/`.
// Pure rules only: how a requested folder is normalised and refused, which
// request applies (the config key before the pack's layout.work), and the two
// readings of git output the resolution needs. Nothing here touches a file or
// runs a command; resolve-work-folder.ts does, through the ports.

export const DEFAULT_WORK_FOLDER = "workbench";
export const DEV_WORK_DIR_CONFIG_KEY = "dev.workDir";

export type WorkDirCheck = { ok: true; folder: string } | { ok: false; reason: string };

// Python's str.isprintable() refuses the Other categories and every separator but the space.
const NON_PRINTABLE = /[\p{C}\p{Zl}\p{Zp}]|(?! )\p{Zs}/u;

/** Normalised as learn-candidates.py:61-63; folder "" when the value is empty. */
export function normalizeWorkDir(raw: string): WorkDirCheck {
  let w = raw.replace(/[\t\r\n]/g, "").trim();
  for (;;) {
    if (w.startsWith("./")) w = w.slice(2);
    else if (w.endsWith("/") && w !== "/") w = w.slice(0, -1);
    else break;
  }
  if (w === "") return { ok: true, folder: "" };
  const parts = w.split("/");
  if (w.startsWith("/")) return { ok: false, reason: "an absolute path" };
  if (w.includes("//")) return { ok: false, reason: "an empty segment" };
  if (parts.includes("..") || parts.includes(".")) return { ok: false, reason: "a '..' or '.' segment" };
  if (parts[0] === ".claude" || parts[0] === ".git") return { ok: false, reason: "under .claude/ or .git/" };
  if (NON_PRINTABLE.test(w)) return { ok: false, reason: "a non-printable character" };
  return { ok: true, folder: w };
}

/** For CONFIG_KEYS.problem: undefined when valid, else the reason. */
export function workFolderProblem(value: string): string | undefined {
  const check = normalizeWorkDir(value);
  return check.ok ? undefined : `'${value}' is not a relative folder of the checkout: ${check.reason}`;
}

export type WorkDirSource = "dev.workDir" | "layout.work";

export interface WorkDirRequest {
  value: string;
  source: WorkDirSource;
}

/** The first of (config, pack) whose trimmed value is non-empty; null when neither. */
export function pickWorkDirRequest(
  configValue: string | undefined,
  packValue: string | undefined,
): WorkDirRequest | null {
  if (configValue !== undefined && configValue.trim() !== "") return { value: configValue, source: "dev.workDir" };
  if (packValue !== undefined && packValue.trim() !== "") return { value: packValue, source: "layout.work" };
  return null;
}

/** The path after "worktree " on the first line of `git worktree list --porcelain`; null otherwise. */
export function mainWorktreeOf(porcelain: string): string | null {
  const first = porcelain.split("\n", 1)[0].replace(/\r$/, "");
  if (!first.startsWith("worktree ")) return null;
  const path = first.slice("worktree ".length);
  return path === "" ? null : path;
}

/** Equal once trailing "/" are removed. */
export function isSamePath(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}
