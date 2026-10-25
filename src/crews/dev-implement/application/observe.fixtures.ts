// The trees the snapshot is tested on.
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { MAX_SNAPSHOT_PATHS, STATUS_COMMAND } from "./observe.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** A shell whose status answers `stdout`, or fails with `exitCode`. */
export function statusShell(status: { stdout?: string; exitCode?: number }): FakeShell {
  const shell = new FakeShell();
  shell.results[STATUS_COMMAND] = status;
  return shell;
}

/** A status naming one path more than the snapshot reads. */
export const WIDE_STATUS = Array.from({ length: MAX_SNAPSHOT_PATHS + 1 }, (_, i) => `?? f${i}`).join("\n");

/** A workspace holding `src/a.ts` with the content `x`. */
export function workspaceWithA(): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/src/a.ts`, "x");
  return files;
}
