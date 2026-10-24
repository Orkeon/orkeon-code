// What code sees of the tree between two acts: every path git reports changed or untracked, each
// with a hash of its content read through Files, so that a second write to a file already dirty
// is seen too. The checks of domain/step-checks.ts compare two of these.
import type { Files, Shell } from "../../../shared/application/ports.ts";
import { statusPaths } from "../domain/step-checks.ts";
import type { Snapshot } from "../domain/step-checks.ts";

export const STATUS_COMMAND = "git status --porcelain=v1 --untracked-files=all";
/** The paths one snapshot reads; past this, it keeps the paths alone (unread), and a role's change is known
 *  from the paths its write tools named. */
export const MAX_SNAPSHOT_PATHS = 200;
const MAX_READ_CHARS = 2_000_000;
const ABSENT = "absent";

/** FNV-1a over the text, with its length: enough to tell two contents of one file apart. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length}:${h.toString(16)}`;
}

export type Observed = { ok: true; snapshot: Snapshot } | { ok: false; problem: string };

export async function snapshot(deps: { shell: Pick<Shell, "run">; files: Pick<Files, "read"> }): Promise<Observed> {
  let status;
  try {
    status = await deps.shell.run(STATUS_COMMAND);
  } catch (e) {
    return { ok: false, problem: `${STATUS_COMMAND} could not run: ${String((e as Error)?.message ?? e).split("\n")[0]}` };
  }
  if (status.exitCode !== 0) return { ok: false, problem: `${STATUS_COMMAND} exited ${status.exitCode}` };
  const paths = statusPaths(status.stdout);
  const out = new Map<string, string | null>();
  if (paths.length > MAX_SNAPSHOT_PATHS) {
    for (const path of paths) out.set(path, null);
    return { ok: true, snapshot: out };
  }
  for (const path of paths) {
    try {
      out.set(path, contentHash(await deps.files.read(`/workspace/${path}`, MAX_READ_CHARS)));
    } catch (e) {
      out.set(path, /not found/i.test(String((e as Error)?.message ?? e)) ? ABSENT : null);
    }
  }
  return { ok: true, snapshot: out };
}
