// The shared memory's folder and settings, pure: the three config keys, what a memory.dir
// value may be, the paths of the folder's layout and the name of its RAG collection.
// Nothing here reads a file or a setting; application/shared-memory/memory-settings.ts does.

import { normalizeWorkDir } from "../dev/work-folder.ts";
import { MEMORY_DIR, TOPIC_PATTERN } from "./refused.ts";
import type { EntryType } from "./entry.ts";

export const MEMORY_DIR_CONFIG_KEY = "memory.dir";
export const MEMORY_PROJECT_CONFIG_KEY = "memory.project";
export const MEMORY_AUTO_ADMIT_CONFIG_KEY = "memory.autoAdmitAudited";
export const DEFAULT_MEMORY_DIR = MEMORY_DIR;
/** The runtime's agent memory (Orkeon:Scripting:AgentMemory:RootDirectory, default /workspace/.orkeon/agent-memory):
 *  per agent, per run of the host, and never the shared memory's folder. */
export const AGENT_MEMORY_DIR = ".orkeon/agent-memory";
/** Where the files of the project are, as the file tools name them. */
export const MEMORY_WORKSPACE = "/workspace";

const within = (inner: string, outer: string): boolean => inner === outer || inner.startsWith(`${outer}/`);

/** The memory.dir value normalised (no leading ./, no trailing /), or why it cannot be the memory folder. */
export function checkMemoryDir(raw: string): { ok: true; dir: string } | { ok: false; reason: string } {
  const check = normalizeWorkDir(raw);
  if (!check.ok) return { ok: false, reason: check.reason };
  if (check.folder === "") return { ok: false, reason: "an empty folder" };
  if (within(check.folder, AGENT_MEMORY_DIR) || within(AGENT_MEMORY_DIR, check.folder)) {
    return { ok: false, reason: `the agent memory's folder ${AGENT_MEMORY_DIR} (the two stay apart)` };
  }
  return { ok: true, dir: check.folder };
}

/** For CONFIG_KEYS.problem: undefined when valid, else the reason. */
export function memoryDirProblem(value: string): string | undefined {
  const check = checkMemoryDir(value);
  return check.ok ? undefined : `'${value}' is not a folder of the project for the memory: ${check.reason}`;
}

/** For CONFIG_KEYS.problem: a project name is a kebab-case name, as the entries' ids start with it. */
export function memoryProjectProblem(value: string): string | undefined {
  return TOPIC_PATTERN.test(value) ? undefined : "a kebab-case name of at most 60 characters (e.g. 'orkeon-code')";
}

/** The RAG collection of a project's memory (one per project). */
export function memoryCollection(project: string): string {
  return `memory-${project}`;
}

export interface MemoryLayout {
  /** The folder, as the file tools name it: /workspace/<memory.dir>. */
  root: string;
  candidates: string;
  candidatesList: string;
  entries: string;
  refused: string;
  index: string;
  golden: string;
  /** The glob the index ingests: every admitted or superseded entry. */
  entriesGlob: string;
}

/** The paths of the folder's layout (temp/05 § 1.2); `dir` relative to the project, as checkMemoryDir returns it. */
export function memoryLayout(dir: string): MemoryLayout {
  const root = `${MEMORY_WORKSPACE}/${dir}`;
  return {
    root,
    candidates: `${root}/candidates`,
    candidatesList: `${root}/candidates/CANDIDATES.md`,
    entries: `${root}/entries`,
    refused: `${root}/refused.md`,
    index: `${root}/INDEX.md`,
    golden: `${root}/eval/golden.yaml`,
    entriesGlob: `${root}/entries/**/*.md`,
  };
}

export const candidatePath = (layout: MemoryLayout, id: string): string => `${layout.candidates}/${id}.md`;
export const entryPath = (layout: MemoryLayout, type: EntryType, id: string): string =>
  `${layout.entries}/${type}/${id}.md`;
