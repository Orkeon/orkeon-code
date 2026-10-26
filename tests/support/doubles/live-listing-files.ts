// LiveListingFiles: FakeFiles whose list() answers from the files the map holds (the names directly
// under the folder), as the runtime's list_directory does after a write, so a use case that writes
// then lists sees its own files; `listErrors` and `writeErrors` of FakeFiles apply as there.
import { FakeFiles } from "./fake-files.ts";

export class LiveListingFiles extends FakeFiles {
  override async list(path: string, maxEntries: number): Promise<string[]> {
    const failure = this.listErrors.get(path);
    if (failure) throw failure;
    const prefix = `${path}/`;
    const names = new Set<string>();
    for (const file of this.files.keys()) {
      if (file.startsWith(prefix)) names.add(file.slice(prefix.length).split("/")[0]);
    }
    return [...names].sort().slice(0, maxEntries);
  }
}
