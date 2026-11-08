// The mount of the Orkeon VFS the code works in (docs/architecture.md, "The VFS and the host platform"): the
// project's checkout. Pure.

/** The project's checkout: where the file tools name a project file `/workspace/<path>`, where the shell runs, and
 *  the root the code index holds every path under. */
export const WORKSPACE = "/workspace";

/** `path` relative to the checkout when it lies under it; any other path as given. */
export const workspaceRelative = (path: string): string =>
  path.startsWith(`${WORKSPACE}/`) ? path.slice(WORKSPACE.length + 1) : path;

/** The mount points the launchers give the REPL, /audio and /transcripts when a speech folder is set: every path
 *  of the VFS starts with one of them. */
export const MOUNT_POINTS: readonly string[] = [
  WORKSPACE, "/output", "/tmp", "/user-config", "/sessions", "/session-history", "/memory", "/audio", "/transcripts",
];
