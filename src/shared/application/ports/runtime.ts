// The runtime port: the Orkeon that runs the command, as the host names itself (Orkeon #225).
// Types only, re-exported by ../ports.ts.

/** The runtime that runs the command: its release, the commit its build metadata carries (null when none)
 *  and the channel it was installed through (`deb`, `tarball`, `source`, `dotnet-tool`, `unknown`). */
export interface RuntimeInfo {
  version: string;
  commit: string | null;
  channel: string;
}

/** The reader of the running runtime; undefined when the host names none, or the read fails. */
export interface RuntimeInfoReader {
  read(): RuntimeInfo | undefined;
}
