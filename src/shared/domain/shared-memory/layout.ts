// The shared memory's folder and settings, pure: the three config keys, what a memory.dir
// value may be, the paths of the folder's layout and the name of its RAG collection.
// Nothing here reads a file or a setting; application/shared-memory/memory-settings.ts does.

import { normalizeWorkDir } from "../dev/work-folder.ts";
import { OPERATIONS_TOOL, PATH_WRITE_TOOLS, UNSCOPED_WRITE_TOOLS } from "../agent-policy/rule-sets.ts";
import { sameToolName, shellCommandForms } from "../agent-policy/permission.ts";
import type { PermissionRule } from "../agent-policy/permission.ts";
import { normalisePath } from "../dev/call-guard.ts";
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
  // normalizeWorkDir compares the first segment as written; a case-insensitive file system (macOS, Windows)
  // reads `.Claude/` as the harness's folder.
  const first = check.folder.split("/")[0].toLowerCase();
  if (first === ".claude" || first === ".git") return { ok: false, reason: "under .claude/ or .git/" };
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

/** The two folders no tool of the model writes in. */
const MEMORY_LEAVES = ["candidates", "entries"] as const;

/**
 * The deny rules every sync of the session's gate adds, whatever the mode (a deny holds in bypassPermissions too):
 * no tool of the model writes a candidate or an entry. A candidate comes from memory_push or Orkeon Code's own
 * harvests, an entry from /memory-admit, both Orkeon Code's code, which the gate does not see; so a forged
 * `status: admitted` file or an `audit:` source the model wrote itself never reaches the memory. The gate matches
 * the raw text, so each pattern lets any text stand between the folder's segments (`./`, `//`, `src/../`) and
 * before them after a `/` (`/workspace/`, `../workspace/`): two rules per tool of PATH_WRITE_TOOLS and folder, and
 * one shell_command rule per folder, which refuses a command naming its segments then the leaf in that order, any
 * text between them - a `cd` into the memory folder then a write under `entries/` included. The gate compares case
 * and cannot read the paths of edit_batch and structural_rewrite: memoryWriteRefusal, run by the callbacks of the
 * main loop and of the dev crews, checks those.
 */
export function memoryWriteRules(dir: string): PermissionRule[] {
  const segments = dir.split("/").join("/*");
  const folders = MEMORY_LEAVES.map((leaf) => `${segments}/*${leaf}`);
  const paths = PATH_WRITE_TOOLS.flatMap((tool) => folders.flatMap((folder) =>
    [`${folder}/*`, `*/${folder}/*`].map((pattern): PermissionRule => ({ effect: "deny", tool, argument: "path", pattern }))));
  const shell = MEMORY_LEAVES.map((leaf): PermissionRule =>
    ({ effect: "deny", tool: "shell_command", argument: "command", pattern: `*${dir.split("/").join("*")}*${leaf}*` }));
  return [...paths, ...shell];
}

/** A path as the host resolves it, in lower case: a case-insensitive file system (a project mounted from macOS or
 *  Windows) reads `.Orkeon/Memory/Entries` as the folder, so the check never counts on the case. */
function resolvedLower(path: string): string {
  const resolved = normalisePath(path.startsWith("/") ? path : `${MEMORY_WORKSPACE}/${path}`);
  return resolved.toLowerCase();
}

const inside = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

/** The text of a glob up to its first wildcard. */
const literalHead = (glob: string): string => {
  const at = glob.search(/[*?[{]/);
  return at < 0 ? glob : glob.slice(0, at);
};

/**
 * Why a call of the model would write under the memory's candidates or entries, or null: what the gate's rules
 * (memoryWriteRules) cannot see - a path in another letter case, each operation of an edit_batch, the paths and the
 * glob of a structural_rewrite that writes (never its dry run: its default), a shell command naming the folder's
 * segments then a leaf in any case and through any steps (`cd .orkeon/memory && … > entries/x`). Pure; the
 * callbacks of the main loop and of the dev crews deny with it.
 */
export function memoryWriteRefusal(dir: string, tool: string, input: unknown): string | null {
  const args = input !== null && typeof input === "object" && !Array.isArray(input) ? input as Readonly<Record<string, unknown>> : {};
  const folders = MEMORY_LEAVES.map((leaf) => resolvedLower(`${dir}/${leaf}`));
  const said = (what: string): string =>
    `${what} writes under ${dir}/candidates/ or ${dir}/entries/: a candidate comes from memory_push, an entry from /memory-admit`;
  const under = (path: unknown): boolean => typeof path === "string" && path.trim() !== ""
    && folders.some((f) => inside(resolvedLower(path.trim()), f));
  if (PATH_WRITE_TOOLS.some((t) => sameToolName(t, tool))) return under(args.path) ? said(`${tool} on '${String(args.path)}'`) : null;
  if (sameToolName(tool, OPERATIONS_TOOL)) {
    const ops = Array.isArray(args.operations) ? args.operations : [];
    const at = ops.findIndex((op) => op !== null && typeof op === "object" && under((op as { path?: unknown }).path));
    return at < 0 ? null : said(`edit_batch operation ${at + 1} on '${String((ops[at] as { path: unknown }).path)}'`);
  }
  if (UNSCOPED_WRITE_TOOLS.some((t) => sameToolName(t, tool))) {
    if (args.dry_run !== false) return null;
    const given = Array.isArray(args.paths) ? args.paths.filter((p): p is string => typeof p === "string" && p.trim() !== "") : [];
    const bases = given.length > 0 ? given : [MEMORY_WORKSPACE];
    const glob = typeof args.glob === "string" && args.glob.trim() !== "" ? args.glob.trim() : null;
    for (const base of bases) {
      const resolved = resolvedLower(base.trim());
      if (folders.some((f) => inside(resolved, f))) return said(`${tool} on '${base}'`);
      // A folder above the memory's: the whole tree is rewritten, unless the glob's literal head leaves the folder out.
      if (!folders.some((f) => f.startsWith(`${resolved}/`))) continue;
      const head = glob === null ? `${resolved}/` : resolvedLower(`${resolved}/${literalHead(glob)}`) + (literalHead(glob).endsWith("/") ? "/" : "");
      if (folders.some((f) => `${f}/`.startsWith(head) || head.startsWith(`${f}/`))) {
        return said(`${tool} on '${base}'${glob === null ? "" : ` with the glob '${glob}'`}`);
      }
    }
    return null;
  }
  if (sameToolName(tool, "shell_command") && typeof args.command === "string") {
    const steps = [...dir.toLowerCase().split("/").filter((s) => s !== "")];
    const reaches = (text: string, leaf: string): boolean => {
      let at = 0;
      for (const word of [...steps, leaf]) {
        const found = text.indexOf(word, at);
        if (found < 0) return false;
        at = found + word.length;
      }
      return true;
    };
    const hit = shellCommandForms(args.command).some((form) => MEMORY_LEAVES.some((leaf) => reaches(form.toLowerCase(), leaf)));
    return hit ? said(`the shell command '${args.command}'`) : null;
  }
  return null;
}

export const candidatePath = (layout: MemoryLayout, id: string): string => `${layout.candidates}/${id}.md`;
export const entryPath = (layout: MemoryLayout, type: EntryType, id: string): string =>
  `${layout.entries}/${type}/${id}.md`;
