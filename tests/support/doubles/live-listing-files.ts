// LiveListingFiles: FakeFiles whose list() answers from the files the map holds (the names directly
// under the folder), as the runtime's list_directory does after a write, so a use case that writes
// then lists sees its own files. `listFailures` makes a folder's listing throw.
import { FakeFiles } from "./fake-files.ts";

export class LiveListingFiles extends FakeFiles {
  listFailures = new Map<string, Error>();
  writeFailures = new Map<string, Error>();

  override async list(path: string, maxEntries: number): Promise<string[]> {
    const failure = this.listFailures.get(path);
    if (failure) throw failure;
    const prefix = `${path}/`;
    const names = new Set<string>();
    for (const file of this.files.keys()) {
      if (file.startsWith(prefix)) names.add(file.slice(prefix.length).split("/")[0]);
    }
    return [...names].sort().slice(0, maxEntries);
  }

  override async write(path: string, content: string): Promise<void> {
    const failure = this.writeFailures.get(path);
    if (failure) throw failure;
    await super.write(path, content);
  }
}
