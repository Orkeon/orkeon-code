// The shared memory's settings as they apply to a run: the folder (memory.dir), the project
// (memory.project, else the origin remote's name, else "local", as /dev-learn names it) and
// whether an audited candidate is admitted without asking (memory.autoAdmitAudited). A stored
// value is checked again here, since the config store hands back what the file holds: an invalid
// one falls back to the default with a warning, it never stops the caller.

import type { ConfigStore } from "../config-store.ts";
import type { Shell } from "../ports.ts";
import { projectFromRemote } from "../../domain/shared-memory/refused.ts";
import {
  DEFAULT_MEMORY_DIR, MEMORY_AUTO_ADMIT_CONFIG_KEY, MEMORY_DIR_CONFIG_KEY, MEMORY_PROJECT_CONFIG_KEY, checkMemoryDir,
  memoryCollection, memoryLayout, memoryProjectProblem,
} from "../../domain/shared-memory/layout.ts";
import type { MemoryLayout } from "../../domain/shared-memory/layout.ts";

export const GIT_REMOTE_ORIGIN = "git remote get-url origin";
export const LOCAL_PROJECT = "local";

export interface MemorySettings {
  /** memory.dir, relative to the project. */
  dir: string;
  layout: MemoryLayout;
  project: string;
  collection: string;
  autoAdmitAudited: boolean;
  /** What was set aside, one line each. */
  warnings: string[];
}

async function stdoutOf(shell: Pick<Shell, "run">, command: string): Promise<string | null> {
  try {
    const result = await shell.run(command);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

async function valueOf(config: Pick<ConfigStore, "readValue">, key: string): Promise<string | undefined> {
  try {
    return (await config.readValue(key)).value;
  } catch {
    return undefined;
  }
}

const validProject = (name: string | null): string | null =>
  name !== null && memoryProjectProblem(name) === undefined ? name : null;

/** The project name when memory.project is unset: the origin remote's, else "local". Not the checkout's
 *  folder: in the container it is always /workspace. */
export async function defaultProject(shell: Pick<Shell, "run">): Promise<string> {
  const remote = await stdoutOf(shell, GIT_REMOTE_ORIGIN);
  return validProject(remote === null || remote === "" ? null : projectFromRemote(remote)) ?? LOCAL_PROJECT;
}

export async function readMemorySettings(
  deps: { config: Pick<ConfigStore, "readValue">; shell: Pick<Shell, "run"> },
): Promise<MemorySettings> {
  const warnings: string[] = [];
  const rawDir = await valueOf(deps.config, MEMORY_DIR_CONFIG_KEY);
  let dir = DEFAULT_MEMORY_DIR;
  if (rawDir !== undefined) {
    const check = checkMemoryDir(rawDir);
    if (check.ok) dir = check.dir;
    else warnings.push(`${MEMORY_DIR_CONFIG_KEY} '${rawDir}' set aside (${check.reason}): ${DEFAULT_MEMORY_DIR} applies`);
  }
  const rawProject = await valueOf(deps.config, MEMORY_PROJECT_CONFIG_KEY);
  let project: string | null = null;
  if (rawProject !== undefined) {
    project = validProject(rawProject);
    if (project === null) warnings.push(`${MEMORY_PROJECT_CONFIG_KEY} '${rawProject}' set aside (${memoryProjectProblem(rawProject)})`);
  }
  project ??= await defaultProject(deps.shell);
  const auto = await valueOf(deps.config, MEMORY_AUTO_ADMIT_CONFIG_KEY);
  return {
    dir, layout: memoryLayout(dir), project, collection: memoryCollection(project),
    autoAdmitAudited: auto === "true", warnings,
  };
}
