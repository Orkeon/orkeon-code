// Files adapter over file_read, file_write, directory_read and list_mounts. A
// failed read is rethrown as the runtime raised it: callers tell an absent file
// from an unreadable one by its message.

import type { Files } from "../../application/ports.ts";
import { entryNames, fileContent, pick } from "./tool-results.ts";

export function createFiles(
  tools: Pick<OrkeonTools, "fileRead" | "fileWrite" | "directoryRead" | "listMounts">,
): Files {
  return {
    async read(path, maxLength) {
      return fileContent(await tools.fileRead(maxLength === undefined ? { path } : { path, max_length: maxLength }));
    },
    async write(path, content) {
      await tools.fileWrite({ path, content });
    },
    async list(path, maxEntries) {
      // DirectoryReadRequest.MaxResults, bound through the tools' snake_case naming
      // (as file_read's MaxLength is `max_length`); an unknown field is ignored.
      return entryNames(await tools.directoryRead({ path, max_results: maxEntries }));
    },
    async mounts() {
      const list: any[] = pick(await tools.listMounts(), "mounts", "Mounts") ?? [];
      // `Path` / `Rights`, PascalCase — read off a live call, not guessed. The first
      // reader of this tool asked for `virtual_path` and printed "undefined(rw)" four
      // times: a successful call whose reader looked for a field the tool never emits.
      return list.map((m) => {
        const rights = pick(m, "Rights", "rights");
        return {
          path: String(pick(m, "Path", "path", "virtual_path") ?? ""),
          rights: rights == null ? undefined : String(rights),
        };
      });
    },
  };
}
