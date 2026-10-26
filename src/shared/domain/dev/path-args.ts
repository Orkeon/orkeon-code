// A relative path a dev agent hands a tool, resolved under the project before the tool runs. The runtime resolves
// one too since Orkeon #206 (against the agent's root, else /workspace); the resolution here is for Orkeon Code's
// own guard and hooks, which judge the call before the runtime sees it and must see one absolute form. The base is
// the checkout, `/workspace`, or a batch's working root. The guard judges the resolved path, in the same form it
// always matched a relative one in (call-guard's pathForms). Pure.
import { sameToolName } from "../agent-policy/permission.ts";
import { OPERATIONS_TOOL, PATH_READ_TOOLS, PATH_WRITE_TOOLS } from "../agent-policy/rule-sets.ts";
import { WORKSPACE } from "../vfs.ts";
import { normalisePath } from "./call-guard.ts";

/** The tools whose `path` names one file or folder. */
const PATH_TOOLS: readonly string[] = [...PATH_READ_TOOLS, ...PATH_WRITE_TOOLS];

/** `path` under `base` when relative, normalised as the guard matches it (a leading `..` climbs out of the base, and the
 *  runtime refuses what no mount holds); an absolute path as it is. */
export function resolvedPath(path: string, base: string = WORKSPACE): string {
  return path.startsWith("/") ? path : normalisePath(`${base}/${path}`);
}

const relative = (path: unknown): path is string => typeof path === "string" && path !== "" && !path.startsWith("/");

/** The call's input with every relative `path` resolved under `base` (an edit_batch: each operation's), or null
 *  when the call names no relative path: the input then goes to the tool as it is. */
export function resolvePathInput(tool: string, input: unknown, base: string = WORKSPACE): unknown | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const args = input as Readonly<Record<string, unknown>>;
  if (PATH_TOOLS.some((name) => sameToolName(tool, name))) {
    return relative(args.path) ? { ...args, path: resolvedPath(args.path, base) } : null;
  }
  if (sameToolName(tool, OPERATIONS_TOOL) && Array.isArray(args.operations)) {
    let changed = false;
    const operations = args.operations.map((op: unknown) => {
      if (op === null || typeof op !== "object") return op;
      const path = (op as { path?: unknown }).path;
      if (!relative(path)) return op;
      changed = true;
      return { ...(op as Record<string, unknown>), path: resolvedPath(path, base) };
    });
    return changed ? { ...args, operations } : null;
  }
  return null;
}
