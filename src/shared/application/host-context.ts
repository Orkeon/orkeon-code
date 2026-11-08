// What every act's callbacks know of the host: its layout (host-layout-store.ts) and the user's path lists
// (agent-policy/path-rules.ts), read together once a run. The identity context, a posix host without mounts and
// without a list, means the callbacks have nothing to do.
import type { Files } from "./ports.ts";
import type { ConfigStore } from "./config-store.ts";
import { readHostLayout } from "./host-layout-store.ts";
import { IDENTITY_HOST, isIdentityHost } from "../domain/host-layout.ts";
import type { HostLayout } from "../domain/host-layout.ts";
import {
  EMPTY_PATH_LISTS, PATHS_ALLOW_CONFIG_KEY, PATHS_DENY_CONFIG_KEY, readPathLists,
} from "../domain/agent-policy/path-rules.ts";
import type { PathListValues, PathLists } from "../domain/agent-policy/path-rules.ts";

/** How an adapter reads this run's context: once asked, at the first operation that needs it. */
export type HostSource = () => Promise<HostContext>;

export interface HostContext {
  layout: HostLayout;
  lists: PathLists;
}

export const IDENTITY_CONTEXT: HostContext = Object.freeze({ layout: IDENTITY_HOST, lists: EMPTY_PATH_LISTS }) as HostContext;

/** True when the context gives the callbacks nothing to do: no host fact, no list. */
export function isIdentityContext(host: HostContext): boolean {
  return isIdentityHost(host.layout) && host.lists.deny.length === 0 && host.lists.allow.length === 0;
}

export interface HostContextRead extends HostContext {
  /** The layout's problems, then the lists', each named for /doctor. */
  problems: string[];
  /** launch.json is not JSON. */
  malformed: boolean;
}

/** The two keys of one settings map, string values only (another type is no value: the schema reports it). */
function pathListValues(map: Record<string, unknown>): PathListValues {
  const text = (key: string): string | undefined => typeof map[key] === "string" ? map[key] as string : undefined;
  return { deny: text(PATHS_DENY_CONFIG_KEY), allow: text(PATHS_ALLOW_CONFIG_KEY) };
}

/** The host context of a run: launch.json, then the lists of the user settings and of the project file over it. */
export async function readHostContext(
  files: Pick<Files, "read">, config: Pick<ConfigStore, "readFile" | "readUserFile">,
): Promise<HostContextRead> {
  const [layout, user, project] = await Promise.all([readHostLayout(files), config.readUserFile(), config.readFile()]);
  const lists = readPathLists(pathListValues(user.map), pathListValues(project.map), layout.layout);
  return {
    layout: layout.layout,
    lists: { deny: lists.deny, allow: lists.allow },
    problems: [...layout.problems, ...lists.problems],
    malformed: layout.malformed,
  };
}
