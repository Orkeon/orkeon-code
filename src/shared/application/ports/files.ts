// The files port: the virtual file system and its mounts.
// Types only, re-exported by ../ports.ts.

/** One VFS mount: its virtual path, and its access as the host spells it (`ro`, `rw`, `rwnd`). */
export interface Mount {
  path: string;
  /** Undefined when the host reports none. */
  rights?: string;
}

/** Files by virtual path (/workspace, /output, /tmp). A read that fails throws,
 *  with the runtime's own message (an absent file says "not found"). */
export interface Files {
  /** The file's content, its first `maxLength` characters when given. */
  read(path: string, maxLength?: number): Promise<string>;
  write(path: string, content: string): Promise<void>;
  /** The names of a directory's entries, files and directories, at most `maxEntries`. */
  list(path: string, maxEntries: number): Promise<string[]>;
  /** The VFS mounts. Throws when the host cannot list them. */
  mounts(): Promise<Mount[]>;
}
