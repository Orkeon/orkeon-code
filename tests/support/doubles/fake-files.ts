// FakeFiles: the Files port over a map of path → content. Reading a path the map
// does not hold fails with "not found", as the runtime does; `readErrors` makes a
// path fail with another message (an unreadable file); a read with a length gives
// that many characters; every path read lands in `reads`, in order. Writes land in
// the map and in `writes`, except under a prefix of `writeErrors`, which throws the
// error made for that path (a linked worktree's `.git/`, which is no folder);
// `listings` holds what list() answers per directory, every folder listed landing
// in `listed`; `mountTable` is what mounts() answers (a `mountsFailure` makes it
// throw, as a host without list_mounts does).
import type { Files, Mount } from "../../../src/shared/application/ports.ts";

export class FakeFiles implements Files {
  files = new Map<string, string>();
  readErrors = new Map<string, Error>();
  reads: string[] = [];
  writeErrors: Array<{ prefix: string; error: (path: string) => Error }> = [];
  listings = new Map<string, string[]>();
  listed: string[] = [];
  writes: Array<{ path: string; content: string }> = [];
  mountTable: Mount[] = [];
  mountsFailure: Error | null = null;

  async read(path: string, maxLength?: number): Promise<string> {
    this.reads.push(path);
    const error = this.readErrors.get(path);
    if (error) throw error;
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`file not found: ${path}`);
    return maxLength === undefined ? content : content.slice(0, maxLength);
  }

  async write(path: string, content: string): Promise<void> {
    const refused = this.writeErrors.find((w) => path.startsWith(w.prefix));
    if (refused) throw refused.error(path);
    this.writes.push({ path, content });
    this.files.set(path, content);
  }

  async list(path: string, maxEntries: number): Promise<string[]> {
    this.listed.push(path);
    return (this.listings.get(path) ?? []).slice(0, maxEntries);
  }

  async mounts(): Promise<Mount[]> {
    if (this.mountsFailure) throw this.mountsFailure;
    return this.mountTable;
  }
}
