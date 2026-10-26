// Files adapter over file_read, file_write, directory_read and list_mounts. A
// failed read is rethrown with the tool's own message, the runtime's wrapping gone
// (withToolMessage): callers tell an absent file from an unreadable one by it. Given a batch's working root, each
// `/workspace` path is read and written under it (shared/domain/dev/path-rebase.ts).

import type { Files } from "../../application/ports.ts";
import { toRoot } from "../../domain/dev/path-rebase.ts";
import { entryNames, fileContent, pick, withToolMessage } from "./tool-results.ts";

export function createFiles(
  tools: Pick<OrkeonTools, "fileRead" | "fileWrite" | "directoryRead" | "listMounts">,
  root?: string,
): Files {
  return {
    async read(logical, maxLength) {
      const path = toRoot(logical, root);
      const input = maxLength === undefined ? { path } : { path, max_length: maxLength };
      return fileContent(await withToolMessage(() => tools.fileRead(input)));
    },
    async write(path, content) {
      await tools.fileWrite({ path: toRoot(path, root), content });
    },
    async list(logical, maxEntries) {
      const path = toRoot(logical, root);
      // DirectoryReadRequest.MaxResults, bound through the tools' snake_case naming
      // (as file_read's MaxLength is `max_length`); an unknown field is ignored.
      return entryNames(await tools.directoryRead({ path, max_results: maxEntries }));
    },
    async mounts() {
      const list: any[] = pick(await tools.listMounts(), "mounts") ?? [];
      // `{ mounts: [{ virtual_path, access, overrides }] }`, as the typings of the
      // runtime declare it (tools.generated.d.ts, `listMounts`); `access` is `ro`, `rw`
      // or `rwnd`, else the rights enum's own name.
      return list.map((m) => ({
        path: String(m.virtual_path ?? ""),
        rights: m.access == null ? undefined : String(m.access),
      }));
    },
  };
}
