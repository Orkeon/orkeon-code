// The checkouts and the requests the work folder resolution is tested on.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import type { WorkDirRequest } from "../../../../src/shared/domain/dev/work-folder.ts";
import { GIT_TOPLEVEL, GIT_WORKTREE_LIST } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** A request from the pack's layout.work, and from the config's dev.workDir. */
export const pack = (value: string): WorkDirRequest => ({ value, source: "layout.work" });
export const config = (value: string): WorkDirRequest => ({ value, source: "dev.workDir" });

/** /workspace as a linked worktree of /home/dev/repo. */
export const LINKED_PORCELAIN = "worktree /home/dev/repo\nHEAD 0123abc\nbranch refs/heads/main\n\n"
  + `worktree ${WORKSPACE}\nHEAD 4567def\nbranch refs/heads/feature\n`;

/** Files whose checkout root lists `listing`, and a shell answering nothing. */
export function setup(listing: string[] = []) {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, listing);
  const shell = new FakeShell();
  return { files, shell };
}

/** Makes git say, on `shell`, that /workspace is a linked worktree of /home/dev/repo. */
export function linked(shell: FakeShell): void {
  shell.results[GIT_WORKTREE_LIST] = { stdout: LINKED_PORCELAIN };
  shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };
}

/** Main worktree paths no probe is run on. */
export const UNQUOTABLE_MAINS: readonly string[] = ["/home/dev/my repo", "/home/dev/o'repo"];

/** Paths and whether the listing of their parent names them. */
export const ENTRIES: ReadonlyArray<{ path: string; exists: boolean }> = [
  { path: `${WORKSPACE}/workbench`, exists: true },
  { path: `${WORKSPACE}/workbench/`, exists: true },
  { path: `${WORKSPACE}/todo`, exists: false },
  { path: `${WORKSPACE}/workbench/demo`, exists: false },
];

/** setup() over a checkout holding todo/ and backstage/tasks/. */
export function todoAndBackstage() {
  const deps = setup(["todo", "backstage"]);
  deps.files.listings.set(`${WORKSPACE}/backstage`, ["tasks"]);
  return deps;
}

/** Requests resolved over todoAndBackstage(), the pack file shown, and the label of the folder. */
export const LABELS: ReadonlyArray<{ name: string; request: WorkDirRequest | null; packShown: string | null; label: string }> = [
  { name: "the default", request: null, packShown: null, label: "workbench/ (default)" },
  {
    name: "a folder of the pack", request: pack("backstage/tasks"), packShown: ".orkeon/repo.yaml",
    label: "backstage/tasks/ (layout.work, .orkeon/repo.yaml)",
  },
  { name: "a folder of the config", request: config("todo"), packShown: ".orkeon/repo.yaml", label: "todo/ (dev.workDir)" },
];

export const DEFAULT_WORK = {
  folder: "workbench", vfsPath: `${WORKSPACE}/workbench`, outcome: "default", request: null, exists: true, note: null,
};
