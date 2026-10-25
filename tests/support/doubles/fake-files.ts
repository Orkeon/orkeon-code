// FakeFiles: the Files port over a map of path → content. Reading a path the map
// does not hold fails with "not found", as the runtime does; `readErrors` makes a
// path fail with another message (an unreadable file); a read with a length gives
// that many characters. Writes land in the map and in `writes`; `listings` holds
// what list() answers per directory, `mountTable` what mounts() answers (a
// `mountsFailure` makes it throw, as a host without list_mounts does).
import type { Files, Mount } from "../../../src/shared/application/ports.ts";

export class FakeFiles implements Files {
  files = new Map<string, string>();
  readErrors = new Map<string, Error>();
  listings = new Map<string, string[]>();
  writes: Array<{ path: string; content: string }> = [];
  mountTable: Mount[] = [];
  mountsFailure: Error | null = null;

  async read(path: string, maxLength?: number): Promise<string> {
    const error = this.readErrors.get(path);
    if (error) throw error;
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`file not found: ${path}`);
    return maxLength === undefined ? content : content.slice(0, maxLength);
  }

  async write(path: string, content: string): Promise<void> {
    this.writes.push({ path, content });
    this.files.set(path, content);
  }

  async list(path: string, maxEntries: number): Promise<string[]> {
    return (this.listings.get(path) ?? []).slice(0, maxEntries);
  }

  async mounts(): Promise<Mount[]> {
    if (this.mountsFailure) throw this.mountsFailure;
    return this.mountTable;
  }
}
