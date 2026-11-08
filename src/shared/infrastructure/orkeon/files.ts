// Files adapter over file_read, file_write, directory_read and list_mounts. A
// failed read is rethrown with the tool's own message, the runtime's wrapping gone
// (withToolMessage): callers tell an absent file from an unreadable one by it. Given a batch's working root, each
// `/workspace` path is read and written under it (shared/domain/dev/path-rebase.ts). Given the host's context, a path
// spelled as the disk does comes back to the VFS first, and a failure's message comes back with the VFS spellings
// (shared/domain/host-paths.ts).

import type { Files } from "../../application/ports.ts";
import type { HostSource } from "../../application/host-context.ts";
import { toRoot } from "../../domain/dev/path-rebase.ts";
import { textToVirtual, toVirtual } from "../../domain/host-paths.ts";
import type { HostLayout } from "../../domain/host-layout.ts";
import { layoutOf } from "./host-context.ts";
import { entryNames, fileContent, pick, withToolMessage } from "./tool-results.ts";

/** The tool's own message (withToolMessage), its disk spellings brought back to the VFS. */
async function withHostMessage<T>(layout: HostLayout, call: () => Promise<T>): Promise<T> {
  try {
    return await withToolMessage(call);
  } catch (error) {
    throw new Error(textToVirtual(error instanceof Error ? error.message : String(error), layout));
  }
}

export function createFiles(
  tools: Pick<OrkeonTools, "fileRead" | "fileWrite" | "directoryRead" | "listMounts">,
  root?: string,
  host?: HostSource,
): Files {
  const pathOf = async (logical: string) => toRoot(toVirtual(logical, await layoutOf(host)), root);
  return {
    async read(logical, maxLength) {
      const layout = await layoutOf(host);
      const path = toRoot(toVirtual(logical, layout), root);
      const input = maxLength === undefined ? { path } : { path, max_length: maxLength };
      return fileContent(await withHostMessage(layout, () => tools.fileRead(input)));
    },
    async write(logical, content) {
      await tools.fileWrite({ path: await pathOf(logical), content });
    },
    async list(logical, maxEntries) {
      const path = await pathOf(logical);
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
