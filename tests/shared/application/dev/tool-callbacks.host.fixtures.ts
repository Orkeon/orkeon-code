// A native Windows host, the lists and the calls and results the host callbacks are tested with.
import type { HostContext } from "../../../../src/shared/application/host-context.ts";
import type { HostLayout } from "../../../../src/shared/domain/host-layout.ts";

export const PROJECT_WIN = "C:\\ici est\\mon repertoire";
const OUTPUT_WIN = "C:\\Users\\me\\.orkeon-code\\projects\\x\\output";

export const WINDOWS: HostLayout = {
  flavour: "windows", automountRoot: "/mnt",
  mounts: [{ virtual: "/workspace", windows: PROJECT_WIN }, { virtual: "/output", windows: OUTPUT_WIN }],
};

/** Native Windows, secrets denied. */
export const HOST: HostContext = { layout: WINDOWS, lists: { deny: ["/workspace/secrets", "/workspace/secrets/*"], allow: [] } };

/** Native Windows, no list. */
export const HOST_NO_LISTS: HostContext = { layout: WINDOWS, lists: { deny: [], allow: [] } };

/** The identity host with a deny list: the lists alone wrap the callbacks. */
export const LISTS_ONLY: HostContext = { layout: { flavour: "posix", automountRoot: "/mnt", mounts: [] }, lists: HOST.lists };

/** A file_read spelled on the Windows disk, and its canonical call. */
export const WINDOWS_READ = { name: "file_read", input: { path: `${PROJECT_WIN}\\src\\a.ts` } };
export const CANONICAL_READ = { name: "file_read", input: { path: "/workspace/src/a.ts" } };

/** A call already canonical. */
export const PLAIN_READ = { name: "file_read", input: { path: "/workspace/src/b.ts" } };

/** A call under the denied folder, spelled on the disk. */
export const SECRET_READ = { name: "file_read", input: { path: `${PROJECT_WIN}\\secrets\\k` } };
/** The refusal names the canonical path: the lists judge the call once canonicalised. */
export const SECRET_DENY = "file_read on '/workspace/secrets/k' is refused by paths.deny '/workspace/secrets/*'";

/** A shell command spelled on the disk. */
export const WINDOWS_SHELL = { name: "shell_command", input: { command: `type "${PROJECT_WIN}\\src\\a.ts"` } };
export const CANONICAL_SHELL = { name: "shell_command", input: { command: `type "/workspace/src/a.ts"` } };

/** A text result holding two spellings of the disk, and what the model should read. */
export const DISK_TEXT = `wrote ${PROJECT_WIN}\\un dossier\\f.txt\nalso c:/ici est/mon repertoire/x.ts and ${OUTPUT_WIN}\\log.txt`;
export const CANONICAL_TEXT = "wrote /workspace/un dossier/f.txt\nalso /workspace/x.ts and /output/log.txt";

/** A structured result, as the shell tool answers. */
export const DISK_RESULT = { stdout: `${PROJECT_WIN}\\src\\a.ts: 3 lines`, stderr: "", exitCode: 0 };
export const CANONICAL_RESULT = { stdout: "/workspace/src/a.ts: 3 lines", stderr: "", exitCode: 0 };
