// A native Windows host whose checkout sits on a path with spaces: the context the adapter and crew tests convert
// spellings under, and its source as the adapters take it.
import type { HostContext, HostSource } from "../../../src/shared/application/host-context.ts";
import type { HostLayout } from "../../../src/shared/domain/host-layout.ts";

/** The checkout's physical base. */
export const PROJECT_WIN = "C:\\ici est\\mon repertoire";
/** The same base as git for Windows prints it. */
export const PROJECT_GIT = "c:/ici est/mon repertoire";

export const WINDOWS_LAYOUT: HostLayout = {
  flavour: "windows", automountRoot: "/mnt",
  mounts: [{ virtual: "/workspace", windows: PROJECT_WIN }, { virtual: "/output", windows: "C:\\Users\\me\\.orkeon-code\\projects\\x\\output" }],
};

/** Native Windows, no path list. */
export const WINDOWS_HOST: HostContext = { layout: WINDOWS_LAYOUT, lists: { deny: [], allow: [] } };

/** The source of WINDOWS_HOST, as an adapter reads it. */
export const windowsHost: HostSource = async () => WINDOWS_HOST;

/** The identity layout with /workspace/secrets denied: the lists alone, for the commands that put them in the gate. */
export const SECRETS_HOST: HostContext = {
  layout: { flavour: "posix", automountRoot: "/mnt", mounts: [] },
  lists: { deny: ["/workspace/secrets", "/workspace/secrets/*"], allow: [] },
};

/** The source of SECRETS_HOST. */
export const secretsHost: HostSource = async () => SECRETS_HOST;
